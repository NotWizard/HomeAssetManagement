from datetime import date

from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.services.fx_service import FXService

logger = get_logger(__name__)


def run_daily_fx_job() -> None:
    with SessionLocal() as session:
        count = FXService.refresh_rates(session, rate_date=date.today())
        session.commit()
        logger.info("daily fx refresh completed, upsert=%s", count)
