from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.core.timezone import business_today
from app.services.fx_service import FXService

logger = get_logger(__name__)


def run_daily_fx_job() -> None:
    with SessionLocal() as session:
        count = FXService.refresh_rates(session, rate_date=business_today(session))
        session.commit()
        logger.info("daily fx refresh completed, upsert=%s", count)
