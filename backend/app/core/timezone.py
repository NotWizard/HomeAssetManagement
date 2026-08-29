from datetime import date
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.settings import SettingsModel
from app.services.common import get_default_family

FALLBACK_TIMEZONE = "UTC"

_TIMEZONE_NAME_CACHE_KEY = "_business_timezone_name"


def resolve_timezone_name(session: Session | None = None) -> str:
    configured = get_settings().timezone
    if session is None:
        return configured

    # 缓存 per-session：之前每个 business_now / business_today 调用都查一次
    # SETTINGS 表（resolve_rate / snapshot / list 端点都会用），命中后省 2-4 次小读
    cached = session.info.get(_TIMEZONE_NAME_CACHE_KEY)
    if cached is not None:
        return cached

    family = get_default_family(session)
    timezone_name = session.scalar(
        select(SettingsModel.timezone).where(SettingsModel.family_id == family.id).limit(1)
    )
    resolved = (
        timezone_name.strip() if timezone_name and timezone_name.strip() else configured
    )
    session.info[_TIMEZONE_NAME_CACHE_KEY] = resolved
    return resolved


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
