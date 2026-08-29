from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.timezone import business_today
from app.models.holding_item import HoldingItem
from app.models.settings import SettingsModel
from app.services.common import get_default_family
from app.services.fx_service import FXService
from app.services.snapshot_service import SnapshotService
from app.utils.fx import convert_to_base_amount

DEFAULT_FX_PROVIDER = "frankfurter"


@dataclass
class SettingsUpdatePlan:
    next_base_currency: str
    rebalance_threshold_pct: float
    base_currency_changed: bool


class SettingsService:
    @staticmethod
    def get_settings(session: Session) -> SettingsModel:
        """读取当前家庭的 SettingsModel。

        正常情况下 `bootstrap.ensure_seed_data` 已经在 lifespan 启动阶段创建好默认 settings；
        这里仍保留一次"找不到则隐式创建"的兜底，但用 IntegrityError + 重新 SELECT 的并发安全模式
        替代直接 `session.add` —— 防止两个请求同时进入兜底路径造成 UNIQUE 约束破坏或双写。
        """
        app_settings = get_settings()
        family = get_default_family(session)
        existing = session.scalar(
            select(SettingsModel).where(SettingsModel.family_id == family.id).limit(1)
        )
        if existing is not None:
            return existing

        candidate = SettingsModel(
            family_id=family.id,
            base_currency=app_settings.base_currency,
            timezone=app_settings.timezone,
            rebalance_threshold_pct=app_settings.rebalance_threshold_pct,
            fx_provider=DEFAULT_FX_PROVIDER,
        )
        try:
            session.add(candidate)
            session.flush()
            return candidate
        except IntegrityError:
            session.rollback()
            # 另一个请求已经创建 → 重新读
            settled = session.scalar(
                select(SettingsModel).where(SettingsModel.family_id == family.id).limit(1)
            )
            if settled is None:
                raise
            return settled

    @staticmethod
    def update_settings(
        session: Session,
        base_currency: str,
        rebalance_threshold_pct: float,
    ) -> SettingsModel:
        settings = SettingsService.get_settings(session)
        plan = _build_settings_update_plan(
            settings,
            base_currency=base_currency,
            rebalance_threshold_pct=rebalance_threshold_pct,
        )
        _apply_settings_update_plan(settings, plan)
        session.flush()

        if plan.base_currency_changed:
            _run_base_currency_change_pipeline(
                session,
                plan.next_base_currency,
                allow_rate_refresh=True,
            )
        return settings


def _build_settings_update_plan(
    settings: SettingsModel,
    *,
    base_currency: str,
    rebalance_threshold_pct: float,
) -> SettingsUpdatePlan:
    next_base_currency = base_currency.upper()
    return SettingsUpdatePlan(
        next_base_currency=next_base_currency,
        rebalance_threshold_pct=rebalance_threshold_pct,
        base_currency_changed=settings.base_currency.upper() != next_base_currency,
    )


def _revalue_all_holdings(
    session: Session,
    base_currency: str,
    *,
    allow_rate_refresh: bool,
) -> None:
    family = get_default_family(session)
    rate_cache: dict[str, Decimal] = {}
    target_date = business_today(session)
    rows = list(
        session.scalars(
            select(HoldingItem)
            .where(HoldingItem.family_id == family.id, HoldingItem.is_deleted.is_(False))
            .order_by(HoldingItem.id.asc())
        )
    )

    for row in rows:
        amount_original = Decimal(str(row.amount_original))
        currency = row.currency.upper()
        if currency == base_currency:
            row.amount_base = amount_original
            continue

        if currency not in rate_cache:
            rate_cache[currency], _ = FXService.resolve_rate_for_pair(
                session,
                quote_currency=currency,
                base_currency=base_currency,
                as_of=target_date,
                allow_refresh=allow_rate_refresh,
            )

        row.amount_base = convert_to_base_amount(amount_original, rate_cache[currency])

    session.flush()



def _apply_settings_update_plan(
    settings: SettingsModel,
    plan: SettingsUpdatePlan,
) -> None:
    settings.base_currency = plan.next_base_currency
    settings.rebalance_threshold_pct = plan.rebalance_threshold_pct
    settings.fx_provider = DEFAULT_FX_PROVIDER


def _revalue_all_snapshots(
    session: Session,
    next_base_currency: str,
    *,
    allow_rate_refresh: bool,
) -> None:
    SnapshotService.revalue_all_snapshots(
        session,
        next_base_currency,
        allow_rate_refresh=allow_rate_refresh,
    )


def _record_settings_change_snapshots(
    session: Session,
    next_base_currency: str,
) -> None:
    SnapshotService.create_event_snapshot(
        session,
        trigger_type="settings",
        note=f"base_currency:{next_base_currency}",
    )
    SnapshotService.create_daily_snapshot(session)



def _run_base_currency_change_pipeline(
    session: Session,
    next_base_currency: str,
    *,
    allow_rate_refresh: bool,
) -> None:
    _revalue_all_holdings(
        session,
        next_base_currency,
        allow_rate_refresh=allow_rate_refresh,
    )
    _revalue_all_snapshots(
        session,
        next_base_currency,
        allow_rate_refresh=allow_rate_refresh,
    )
    _record_settings_change_snapshots(session, next_base_currency)
