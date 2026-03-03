from datetime import date
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.settings import SettingsModel
from app.services.common import get_default_family

FALLBACK_TIMEZONE = "UTC"


def resolve_timezone_name(session: Session | None = None) -> str:
    configured = get_settings().timezone
    if session is None:
        return configured

    family = get_default_family(session)
    timezone_name = session.scalar(
        select(SettingsModel.timezone).where(SettingsModel.family_id == family.id).limit(1)
    )
    if timezone_name and timezone_name.strip():
        return timezone_name.strip()

    return configured


def get_business_tzinfo(session: Session | None = None) -> ZoneInfo:
    timezone_name = resolve_timezone_name(session)
    try:
        return ZoneInfo(timezone_name)
    except Exception:  # noqa: BLE001
        fallback = get_settings().timezone or FALLBACK_TIMEZONE
        try:
            return ZoneInfo(fallback)
        except Exception:  # noqa: BLE001
            return ZoneInfo(FALLBACK_TIMEZONE)


def business_now(session: Session | None = None) -> datetime:
    return datetime.now(get_business_tzinfo(session))


def business_today(session: Session | None = None) -> date:
    return business_now(session).date()
