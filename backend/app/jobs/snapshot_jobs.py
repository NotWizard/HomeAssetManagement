from datetime import date

from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.services.snapshot_service import SnapshotService

logger = get_logger(__name__)


def run_daily_snapshot_job() -> None:
    with SessionLocal() as session:
        row = SnapshotService.create_daily_snapshot(session, snapshot_date=date.today())
        session.commit()
        logger.info("daily snapshot generated id=%s", row.id)
