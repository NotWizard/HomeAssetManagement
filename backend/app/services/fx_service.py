from datetime import date
from datetime import timedelta
from decimal import Decimal
from threading import Thread
from typing import Any

import httpx
from sqlalchemy import and_
from sqlalchemy import desc
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.core.timezone import business_today
from app.models.fx_rate_daily import FxRateDaily
from app.core.clock import utc_now_naive

logger = get_logger(__name__)


class FXService:
    @staticmethod
    def refresh_rates(
        session: Session,
        rate_date: date | None = None,
        base_currency: str | None = None,
    ) -> int:
        from app.services.settings_service import SettingsService

        if rate_date is None:
            rate_date = business_today(session)

        settings = SettingsService.get_settings(session)
        base = (base_currency or settings.base_currency).upper()

        provider_payload = _fetch_provider_rates(rate_date, base)
        if provider_payload is None:
            return 0

        provider_name, actual_date, latest_rates = provider_payload
        # 以汇率源返回的实际数据日期落库，而非请求的 rate_date：周末/节假日
        # provider 返回的是最近交易日数据，若错标为当天，resolve_rate_for_pair
        # 会把它当作精确值（is_estimated=False），污染历史快照重估。
        return _upsert_daily_rates(
            session,
            rate_date=actual_date,
            base_currency=base,
            provider_name=provider_name,
            latest_rates=latest_rates,
        )

    @staticmethod
    def resolve_rate(
        session: Session,
        quote_currency: str,
        base_currency: str | None = None,
        as_of: date | None = None,
        allow_refresh: bool = True,
    ) -> tuple[Decimal, bool]:
        from app.services.settings_service import SettingsService

        settings = SettingsService.get_settings(session)
        base = (base_currency or settings.base_currency).upper()
        quote = quote_currency.upper()
        as_of_date = as_of or business_today(session)
        return FXService.resolve_rate_for_pair(
            session,
            quote_currency=quote,
            base_currency=base,
            as_of=as_of_date,
            allow_refresh=allow_refresh,
        )

    @staticmethod
    def resolve_rate_for_pair(
        session: Session,
        quote_currency: str,
        base_currency: str,
        as_of: date,
        *,
        allow_refresh: bool,
    ) -> tuple[Decimal, bool]:
        base = base_currency.upper()
        quote = quote_currency.upper()
        as_of_date = as_of

        if quote == base:
            return Decimal("1"), False

        exact = session.scalar(
            select(FxRateDaily).where(
                and_(
                    FxRateDaily.rate_date == as_of_date,
                    FxRateDaily.base_currency == base,
                    FxRateDaily.quote_currency == quote,
                )
            )
        )
        if exact:
            return Decimal(exact.rate), exact.is_estimated

        # 历史 fallback：找到该币种 ≤ as_of_date 最近的一次已知汇率，标记为 is_estimated
        # 以便 UI 提示"汇率为估算值"。
        fallback = session.scalar(
            select(FxRateDaily)
            .where(
                and_(
                    FxRateDaily.rate_date <= as_of_date,
                    FxRateDaily.base_currency == base,
                    FxRateDaily.quote_currency == quote,
                )
            )
            .order_by(desc(FxRateDaily.rate_date))
            .limit(1)
        )
        if fallback:
            # 没拿到当天精确值时 fire-and-forget 一次后台 refresh：不阻塞当前请求，
            # 下次同样查询大概率有数据。避免之前同步 refresh 在 provider 抖动时
            # 最多阻塞 ~30s 的体验灾难。
            if allow_refresh:
                _trigger_background_refresh(as_of_date, base)
            return Decimal(fallback.rate), True

        # 连历史 fallback 都没有：尝试同步 refresh 一次（首次启动 + 新币种的边界场景），
        # 不再用历史 fallback 兜底就只能 raise；这里的同步调用是不可避免的"冷启动税"。
        if allow_refresh:
            FXService.refresh_rates(session, as_of_date, base)
            # refresh 以实际数据日期落库（周末/节假日可能是更早的交易日），因此
            # 递归重走完整查询（精确 + 历史 fallback），而不是只查 as_of 当天；
            # allow_refresh=False 保证不会二次 refresh、不会无限递归。
            return FXService.resolve_rate_for_pair(
                session,
                quote_currency=quote,
                base_currency=base,
                as_of=as_of_date,
                allow_refresh=False,
            )

        raise AppError(
            5000,
            f"无法获取 {base}→{quote} 汇率，请检查网络后重试",
        )

    @staticmethod
    def list_rates(session: Session, on_date: date | None = None) -> list[FxRateDaily]:
        from app.services.settings_service import SettingsService

        target_date = on_date or business_today(session)
        settings = SettingsService.get_settings(session)
        base = settings.base_currency.upper()
        rows = list(
            session.scalars(
                select(FxRateDaily)
                .where(
                    and_(
                        FxRateDaily.rate_date == target_date,
                        FxRateDaily.base_currency == base,
                    )
                )
                .order_by(FxRateDaily.quote_currency.asc())
            )
        )
        if rows:
            return rows
        # 兜底语义是“每币种最近一次可用汇率”，不是全量历史：原实现无 LIMIT 无去重，
        # 一年后会返回约 7000+ 行。按币种分组取 MAX(rate_date) 再回 join 取行。
        latest_dates = (
            select(
                FxRateDaily.quote_currency,
                func.max(FxRateDaily.rate_date).label("latest_date"),
            )
            .where(FxRateDaily.base_currency == base)
            .group_by(FxRateDaily.quote_currency)
            .subquery()
        )
        return list(
            session.scalars(
                select(FxRateDaily)
                .join(
                    latest_dates,
                    and_(
                        FxRateDaily.quote_currency
                        == latest_dates.c.quote_currency,
                        FxRateDaily.rate_date == latest_dates.c.latest_date,
                    ),
                )
                .where(FxRateDaily.base_currency == base)
                .order_by(FxRateDaily.quote_currency.asc())
            )
        )


def _trigger_background_refresh(rate_date: date, base_currency: str) -> None:
    """Fire-and-forget 触发一次 FX refresh，不阻塞调用方。

    用在 resolve_rate_for_pair 命中历史 fallback 但缺当天精确值的场景：
    立即返回 fallback（is_estimated=True）给用户，同时启动 daemon 线程
    刷一次最新汇率，下一次同样查询大概率能命中精确值。

    线程内自己创建新 Session，避免跨线程共享 Session（SQLAlchemy 不允许）；
    任何异常都吞掉（只是后台尽力而为，不能影响主请求），仅记 warning。
    """
    def _run() -> None:
        try:
            with SessionLocal() as bg_session:
                FXService.refresh_rates(bg_session, rate_date, base_currency)
                bg_session.commit()
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "fx background refresh failed (date=%s base=%s): %s",
                rate_date,
                base_currency,
                exc,
            )

    Thread(target=_run, daemon=True, name=f"fx-refresh-{base_currency}-{rate_date}").start()


def _fetch_provider_rates(
    rate_date: date,
    base_currency: str,
) -> tuple[str, date, dict[str, Decimal]] | None:
    """返回 (provider, 实际数据日期, rates)；全部 provider 失败时返回 None。"""
    providers = [
        ("chinamoney", _fetch_chinamoney),
        ("frankfurter", _fetch_frankfurter),
    ]

    for name, fn in providers:
        try:
            actual_date, rates = fn(rate_date, base_currency)
            return name, actual_date, rates
        except Exception as exc:  # noqa: BLE001
            logger.warning("fx provider %s failed: %s", name, exc)

    return None


def _upsert_daily_rates(
    session: Session,
    *,
    rate_date: date,
    base_currency: str,
    provider_name: str,
    latest_rates: dict[str, Decimal],
) -> int:
    """一次 batch INSERT ... ON CONFLICT DO UPDATE 写所有币种。

    原实现每币种先 SELECT existing 再决定 add / update，N 个币种 = 2N 次 SQL。
    SQLite 方言 `INSERT ... ON CONFLICT (...) DO UPDATE SET ...` 用唯一约束
    `uq_fx_rate_daily(rate_date, base, quote)` 做 upsert，一次往返写完所有。
    base == base 自指鉴 rate=1 行也并入同一 batch。
    """
    fetched_at = utc_now_naive()
    rows: list[dict[str, Any]] = []
    for quote, rate in latest_rates.items():
        rows.append(
            {
                "rate_date": rate_date,
                "base_currency": base_currency,
                "quote_currency": quote,
                "rate": rate,
                "provider": provider_name,
                "is_estimated": False,
                "fetched_at": fetched_at,
            }
        )
    rows.append(
        {
            "rate_date": rate_date,
            "base_currency": base_currency,
            "quote_currency": base_currency,
            "rate": Decimal("1"),
            "provider": provider_name,
            "is_estimated": False,
            "fetched_at": fetched_at,
        }
    )
    if not rows:
        return 0

    stmt = sqlite_insert(FxRateDaily).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["rate_date", "base_currency", "quote_currency"],
        set_={
            "rate": stmt.excluded.rate,
            "provider": stmt.excluded.provider,
            "is_estimated": stmt.excluded.is_estimated,
            "fetched_at": stmt.excluded.fetched_at,
        },
    )
    session.execute(stmt)
    session.flush()
    return len(rows)


# FX provider 网络容错策略
# - 每次请求最多 5s（连接 + 读各 5s）
# - 失败时退避重试 2 次（总尝试 3 次），间隔 0.5s → 1.0s
# - 单 provider 总耗时上限 12s（5+0.5+5+1.0+5≈16.5s 上限，向下夹到 12s 由调用方累计判定）
_FX_TIMEOUT = httpx.Timeout(connect=5.0, read=5.0, write=5.0, pool=5.0)
_FX_RETRY_COUNT = 2
_FX_RETRY_BACKOFF_SECONDS = (0.5, 1.0)


def _fetch_with_retry(url: str, params: dict[str, str]) -> dict[str, Any]:
    """同步 GET + 指数式短退避重试。失败时抛最后一次异常给调用方累计降级。"""
    import time

    last_exc: Exception | None = None
    for attempt in range(_FX_RETRY_COUNT + 1):
        try:
            response = httpx.get(url, params=params, timeout=_FX_TIMEOUT)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            last_exc = exc
            if attempt < _FX_RETRY_COUNT:
                time.sleep(_FX_RETRY_BACKOFF_SECONDS[attempt])
    assert last_exc is not None
    raise last_exc


def _parse_provider_date(raw: Any, requested: date, *, provider: str) -> date:
    """解析汇率源返回的实际数据日期。

    chinamoney 按窗口查询返回最近一个交易日记录、frankfurter 在周末/假日返回
    前一工作日数据，两者的实际日期都可能早于请求日期。日期缺失 / 非法 / 晚于
    请求日期都视为该 provider 失败（交给下一 provider），绝不静默错标日期。
    """
    if not isinstance(raw, str):
        raise ValueError(f"{provider} rate date is missing")
    try:
        actual = date.fromisoformat(raw)
    except ValueError as exc:
        raise ValueError(f"{provider} rate date is invalid: {raw!r}") from exc
    if actual > requested:
        raise ValueError(
            f"{provider} rate date is after requested date: {actual} > {requested}"
        )
    return actual


def _fetch_chinamoney(rate_date: date, base: str) -> tuple[date, dict[str, Decimal]]:
    settings = get_settings()
    data = _fetch_with_retry(
        settings.fx_primary_url,
        {
            "startDate": (rate_date - timedelta(days=14)).isoformat(),
            "endDate": rate_date.isoformat(),
            "pageNum": "1",
            "pageSize": "1",
        },
    )
    metadata = data.get("data", {})
    pairs = metadata.get("head", []) if isinstance(metadata, dict) else []
    records = data.get("records", [])
    if (
        data.get("head", {}).get("rep_code") != "200"
        or not isinstance(pairs, list)
        or not isinstance(records, list)
        or not records
        or not isinstance(records[0], dict)
    ):
        raise ValueError("chinamoney rates is empty")

    actual_date = _parse_provider_date(
        records[0].get("date"), rate_date, provider="chinamoney"
    )
    values = records[0].get("values", [])
    if not isinstance(values, list) or len(values) != len(pairs):
        raise ValueError("chinamoney rates is invalid")

    # 官方中间价多数是“外币/CNY”，日元按 100 单位报价；先统一成 1 CNY 可兑换量，
    # 再通过 CNY 交叉计算任意受支持基准币种。
    cny_rates = {"CNY": Decimal("1")}
    for pair, raw_value in zip(pairs, values, strict=True):
        price = Decimal(str(raw_value))
        if price <= 0 or not isinstance(pair, str):
            raise ValueError("chinamoney rate is invalid")
        if pair.endswith("/CNY"):
            source = pair.removesuffix("/CNY")
            units = Decimal("100") if source.startswith("100") else Decimal("1")
            currency = source.removeprefix("100")
            cny_rates[currency] = units / price
        elif pair.startswith("CNY/"):
            cny_rates[pair.removeprefix("CNY/")] = price

    base_rate = cny_rates.get(base.upper())
    if base_rate is None:
        raise ValueError(f"chinamoney does not support base currency: {base}")
    return actual_date, {
        currency: rate / base_rate
        for currency, rate in cny_rates.items()
        if currency != base.upper()
    }


def _fetch_frankfurter(rate_date: date, base: str) -> tuple[date, dict[str, Decimal]]:
    settings = get_settings()
    url = f"{settings.fx_fallback_url}/{rate_date.isoformat()}"
    data = _fetch_with_retry(url, {"base": base})
    actual_date = _parse_provider_date(
        data.get("date"), rate_date, provider="frankfurter"
    )
    rates = data.get("rates", {})
    if not isinstance(rates, dict) or not rates:
        raise ValueError("frankfurter rates is empty")
    return actual_date, {k.upper(): Decimal(str(v)) for k, v in rates.items()}
