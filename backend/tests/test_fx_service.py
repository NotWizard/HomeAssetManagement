from datetime import date
from decimal import Decimal

import pytest

from sqlalchemy import select

from app.core.config import Settings
from app.core.database import SessionLocal
from app.core.exceptions import AppError
from app.models.fx_rate_daily import FxRateDaily
from app.services.fx_service import FXService


def test_default_fx_urls_use_chinamoney_primary_and_frankfurter_fallback(monkeypatch):
    monkeypatch.delenv("HBS_FX_PRIMARY_URL", raising=False)
    monkeypatch.delenv("HBS_FX_FALLBACK_URL", raising=False)

    settings = Settings(_env_file=None)

    assert settings.fx_primary_url == (
        "https://www.chinamoney.com.cn/ags/ms/cm-u-bk-ccpr/CcprHisNew"
    )
    assert settings.fx_fallback_url == "https://api.frankfurter.dev/v1"


def test_fetch_chinamoney_normalizes_cross_rates(monkeypatch):
    import app.services.fx_service as fx_module

    monkeypatch.setattr(
        fx_module,
        "_fetch_with_retry",
        lambda *_args, **_kwargs: {
            "head": {"rep_code": "200"},
            "data": {"head": ["USD/CNY", "100JPY/CNY", "CNY/MOP"]},
            "records": [
                {
                    "date": "2026-06-26",
                    "values": ["7.20", "4.80", "1.10"],
                }
            ],
        },
    )

    actual_date, rates = fx_module._fetch_chinamoney(date(2026, 6, 28), "USD")
    normalized = {
        currency: rate.quantize(Decimal("0.00000001"))
        for currency, rate in rates.items()
    }

    # 请求 6-28（周日）但记录属于 6-26（周五）：返回记录自带的真实日期
    assert actual_date == date(2026, 6, 26)
    assert normalized == {
        "CNY": Decimal("7.20000000"),
        "JPY": Decimal("150.00000000"),
        "MOP": Decimal("7.92000000"),
    }


def test_fetch_chinamoney_rejects_record_from_future(monkeypatch):
    import app.services.fx_service as fx_module

    monkeypatch.setattr(
        fx_module,
        "_fetch_with_retry",
        lambda *_args, **_kwargs: {
            "head": {"rep_code": "200"},
            "data": {"head": ["USD/CNY"]},
            "records": [{"date": "2026-06-29", "values": ["7.20"]}],
        },
    )

    with pytest.raises(ValueError, match="after requested date"):
        fx_module._fetch_chinamoney(date(2026, 6, 28), "USD")


def test_fetch_chinamoney_rejects_missing_record_date(monkeypatch):
    import app.services.fx_service as fx_module

    monkeypatch.setattr(
        fx_module,
        "_fetch_with_retry",
        lambda *_args, **_kwargs: {
            "head": {"rep_code": "200"},
            "data": {"head": ["USD/CNY"]},
            "records": [{"values": ["7.20"]}],
        },
    )

    with pytest.raises(ValueError, match="date is missing"):
        fx_module._fetch_chinamoney(date(2026, 6, 28), "USD")


def test_fetch_frankfurter_validates_response_date(monkeypatch):
    import app.services.fx_service as fx_module

    # 周末请求返回前一工作日数据：以响应自带的 date 为准
    monkeypatch.setattr(
        fx_module,
        "_fetch_with_retry",
        lambda *_args, **_kwargs: {
            "base": "CNY",
            "date": "2026-06-26",
            "rates": {"USD": 0.14},
        },
    )

    actual_date, rates = fx_module._fetch_frankfurter(date(2026, 6, 28), "CNY")

    assert actual_date == date(2026, 6, 26)
    assert rates == {"USD": Decimal("0.14")}


def test_fetch_frankfurter_rejects_missing_date(monkeypatch):
    import app.services.fx_service as fx_module

    monkeypatch.setattr(
        fx_module,
        "_fetch_with_retry",
        lambda *_args, **_kwargs: {"base": "CNY", "rates": {"USD": 0.14}},
    )

    with pytest.raises(ValueError, match="date is missing"):
        fx_module._fetch_frankfurter(date(2026, 6, 28), "CNY")


def test_fetch_provider_rates_prefers_chinamoney(monkeypatch):
    import app.services.fx_service as fx_module

    monkeypatch.setattr(
        fx_module,
        "_fetch_chinamoney",
        lambda *_args: (date(2026, 6, 26), {"USD": Decimal("0.14")}),
        raising=False,
    )
    monkeypatch.setattr(
        fx_module,
        "_fetch_frankfurter",
        lambda *_args: pytest.fail("不应在主汇率源成功后继续请求备用源"),
    )

    assert fx_module._fetch_provider_rates(date(2026, 6, 28), "CNY") == (
        "chinamoney",
        date(2026, 6, 26),
        {"USD": Decimal("0.14")},
    )


def test_fetch_provider_rates_falls_back_to_frankfurter(monkeypatch):
    import app.services.fx_service as fx_module

    def unavailable(*_args):
        raise ValueError("unavailable")

    monkeypatch.setattr(
        fx_module,
        "_fetch_chinamoney",
        unavailable,
        raising=False,
    )
    monkeypatch.setattr(
        fx_module,
        "_fetch_frankfurter",
        lambda *_args: (date(2026, 6, 26), {"USD": Decimal("0.14")}),
    )

    assert fx_module._fetch_provider_rates(date(2026, 6, 28), "CNY") == (
        "frankfurter",
        date(2026, 6, 26),
        {"USD": Decimal("0.14")},
    )


def test_refresh_rates_stores_weekend_rates_under_actual_trading_date(monkeypatch):
    """周日请求拿到周五数据时，必须以周五落库而不是错标成周日精确值。"""
    import app.services.fx_service as fx_module

    monkeypatch.setattr(
        fx_module,
        "_fetch_with_retry",
        lambda *_args, **_kwargs: {
            "head": {"rep_code": "200"},
            "data": {"head": ["USD/CNY"]},
            "records": [{"date": "2026-06-26", "values": ["8.00"]}],
        },
    )

    with SessionLocal() as session:
        count = FXService.refresh_rates(
            session, rate_date=date(2026, 6, 28), base_currency="CNY"
        )

        assert count == 2  # USD + CNY 自指行
        assert session.scalar(
            select(FxRateDaily).where(FxRateDaily.rate_date == date(2026, 6, 28))
        ) is None
        friday = session.scalar(
            select(FxRateDaily).where(
                FxRateDaily.rate_date == date(2026, 6, 26),
                FxRateDaily.base_currency == "CNY",
                FxRateDaily.quote_currency == "USD",
            )
        )
        assert friday is not None
        assert friday.is_estimated is False
        assert Decimal(friday.rate) == Decimal("0.125")

        # 周日查询走历史 fallback，显式标记估算值而不是伪精确
        rate, is_estimated = FXService.resolve_rate_for_pair(
            session,
            quote_currency="USD",
            base_currency="CNY",
            as_of=date(2026, 6, 28),
            allow_refresh=False,
        )
        assert rate == Decimal("0.125")
        assert is_estimated is True


def test_resolve_rate_cold_start_on_weekend_uses_actual_date_fallback(monkeypatch):
    """空缓存 + 周末冷启动：refresh 落库实际交易日后，递归查询应命中估算 fallback 而非报错。"""
    import app.services.fx_service as fx_module

    monkeypatch.setattr(
        fx_module,
        "_fetch_with_retry",
        lambda *_args, **_kwargs: {
            "head": {"rep_code": "200"},
            "data": {"head": ["USD/CNY"]},
            "records": [{"date": "2026-06-26", "values": ["8.00"]}],
        },
    )

    with SessionLocal() as session:
        rate, is_estimated = FXService.resolve_rate_for_pair(
            session,
            quote_currency="USD",
            base_currency="CNY",
            as_of=date(2026, 6, 28),
            allow_refresh=True,
        )

    assert rate == Decimal("0.125")
    assert is_estimated is True


def test_resolve_rate_returns_app_error_when_all_fx_providers_fail(monkeypatch):
    monkeypatch.setattr(FXService, "refresh_rates", lambda *_args: 0)

    with SessionLocal() as session:
        with pytest.raises(AppError, match="无法获取 CNY→USD 汇率") as exc_info:
            FXService.resolve_rate_for_pair(
                session,
                quote_currency="USD",
                base_currency="CNY",
                as_of=date(2026, 6, 28),
                allow_refresh=True,
            )

    assert exc_info.value.code == 5000


def test_list_rates_fallback_returns_latest_per_currency_only():
    """目标日期无行时，兜底应返回每币种最近一次汇率，而不是全量历史。"""
    from app.services.bootstrap import init_database

    init_database()
    with SessionLocal() as session:
        session.query(FxRateDaily).delete()
        # 两个币种 × 两个日期 + 一行其他基准币（不应混入）
        for quote, rate_old, rate_new in [("USD", "7.10", "7.20"), ("EUR", "7.80", "7.90")]:
            session.add(
                FxRateDaily(
                    rate_date=date(2026, 6, 26),
                    base_currency="CNY",
                    quote_currency=quote,
                    rate=Decimal(rate_old),
                    provider="test",
                    is_estimated=False,
                )
            )
            session.add(
                FxRateDaily(
                    rate_date=date(2026, 6, 27),
                    base_currency="CNY",
                    quote_currency=quote,
                    rate=Decimal(rate_new),
                    provider="test",
                    is_estimated=False,
                )
            )
        session.add(
            FxRateDaily(
                rate_date=date(2026, 6, 27),
                base_currency="USD",
                quote_currency="EUR",
                rate=Decimal("1.1"),
                provider="test",
                is_estimated=False,
            )
        )
        session.flush()

        rows = FXService.list_rates(session, on_date=date(2026, 6, 28))

        by_quote = {row.quote_currency: row for row in rows}
        assert sorted(by_quote) == ["EUR", "USD"]
        assert all(row.rate_date == date(2026, 6, 27) for row in rows)
        assert Decimal(by_quote["USD"].rate) == Decimal("7.20")


def test_trigger_background_refresh_dedupes_in_flight_same_key(monkeypatch):
    """同一 (date, base) 已有后台刷新在跑时，不再起第二个线程。"""
    import threading
    import time

    import app.services.fx_service as fx_module

    entered = threading.Event()
    release = threading.Event()
    calls: list[tuple] = []

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def commit(self):
            pass

    def fake_refresh(_session, rate_date, base_currency):
        calls.append((rate_date, base_currency))
        entered.set()
        release.wait(2)
        return 1

    monkeypatch.setattr(FXService, "refresh_rates", fake_refresh)
    monkeypatch.setattr(fx_module, "SessionLocal", lambda: FakeSession())

    key = (date(2026, 6, 28), "CNY")
    try:
        fx_module._trigger_background_refresh(*key)
        assert entered.wait(2), "第一个后台刷新应已启动"
        fx_module._trigger_background_refresh(*key)
        release.set()

        deadline = time.time() + 2
        while key in fx_module._fx_refresh_in_flight and time.time() < deadline:
            time.sleep(0.01)
        assert calls == [key], "in-flight 期间同 key 重复触发应被去重"

        # 线程结束后去重键已释放，允许再次触发
        entered.clear()
        release.set()
        fx_module._trigger_background_refresh(*key)
        assert entered.wait(2), "去重键释放后应能再次触发"
        release.set()
        deadline = time.time() + 2
        while key in fx_module._fx_refresh_in_flight and time.time() < deadline:
            time.sleep(0.01)
        assert calls == [key, key]
    finally:
        release.set()
        fx_module._fx_refresh_in_flight.discard(key)
