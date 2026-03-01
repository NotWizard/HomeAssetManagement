from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.settings import SettingsModel
from app.services.common import get_default_family


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
                fx_provider="frankfurter",
            )
            session.add(settings)
            session.flush()
        return settings

    @staticmethod
    def update_settings(
        session: Session,
        base_currency: str,
        timezone: str,
        rebalance_threshold_pct: float,
        fx_provider: str,
    ) -> SettingsModel:
        settings = SettingsService.get_settings(session)
        settings.base_currency = base_currency.upper()
        settings.timezone = timezone
        settings.rebalance_threshold_pct = rebalance_threshold_pct
        settings.fx_provider = fx_provider
        session.flush()
        return settings
