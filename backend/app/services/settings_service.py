from decimal import Decimal

from sqlalchemy import select
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


class SettingsService:
    @staticmethod
    def get_settings(session: Session) -> SettingsModel:
        app_settings = get_settings()
        family = get_default_family(session)
        settings = session.scalar(
            select(SettingsModel).where(SettingsModel.family_id == family.id).limit(1)
        )
        if settings is None:
            settings = SettingsModel(
                family_id=family.id,
                base_currency=app_settings.base_currency,
                timezone=app_settings.timezone,
                rebalance_threshold_pct=app_settings.rebalance_threshold_pct,
                fx_provider=DEFAULT_FX_PROVIDER,
            )
            session.add(settings)
            session.flush()
        return settings

    @staticmethod
    def update_settings(
        session: Session,
        base_currency: str,
        rebalance_threshold_pct: float,
    ) -> SettingsModel:
        settings = SettingsService.get_settings(session)
        next_base_currency = base_currency.upper()
        base_currency_changed = _apply_settings_update(
            settings,
            base_currency=next_base_currency,
            rebalance_threshold_pct=rebalance_threshold_pct,
        )
        session.flush()

        if base_currency_changed:
            _run_base_currency_change_pipeline(
                session,
                next_base_currency,
                allow_rate_refresh=True,
            )
        return settings


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



def _apply_settings_update(
    settings: SettingsModel,
    *,
    base_currency: str,
    rebalance_threshold_pct: float,
) -> bool:
    base_currency_changed = settings.base_currency.upper() != base_currency
    settings.base_currency = base_currency
    settings.rebalance_threshold_pct = rebalance_threshold_pct
    settings.fx_provider = DEFAULT_FX_PROVIDER
    return base_currency_changed



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
    SnapshotService.revalue_all_snapshots(
        session,
        next_base_currency,
        allow_rate_refresh=allow_rate_refresh,
    )
    SnapshotService.create_event_snapshot(
        session,
        trigger_type="settings",
        note=f"base_currency:{next_base_currency}",
    )
    SnapshotService.create_daily_snapshot(session)
