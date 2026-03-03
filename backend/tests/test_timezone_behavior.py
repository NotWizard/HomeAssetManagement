from datetime import date

from app.core.database import SessionLocal
from app.services.bootstrap import init_database
from app.services.settings_service import SettingsService


def test_resolve_timezone_name_prefers_settings_timezone():
    from app.core.timezone import resolve_timezone_name

    init_database()
    with SessionLocal() as session:
        settings = SettingsService.get_settings(session)
        settings.timezone = "UTC"
        session.commit()

    with SessionLocal() as session:
        assert resolve_timezone_name(session) == "UTC"


def test_business_today_returns_date_with_settings_timezone():
    from app.core.timezone import business_today

    init_database()
    with SessionLocal() as session:
        settings = SettingsService.get_settings(session)
        settings.timezone = "UTC"
        session.commit()

    with SessionLocal() as session:
        assert isinstance(business_today(session), date)


def test_scheduler_timezone_follows_settings_timezone():
    from app.jobs.scheduler import _get_scheduler_timezone

    init_database()
    with SessionLocal() as session:
        settings = SettingsService.get_settings(session)
        settings.timezone = "UTC"
        session.commit()

    assert str(_get_scheduler_timezone()) == "UTC"
