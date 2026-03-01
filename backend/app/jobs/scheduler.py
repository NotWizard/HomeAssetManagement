from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import get_settings
from app.core.logging import get_logger
from app.jobs.fx_jobs import run_daily_fx_job
from app.jobs.snapshot_jobs import run_daily_snapshot_job

logger = get_logger(__name__)

scheduler = BackgroundScheduler()


def start_scheduler() -> None:
    settings = get_settings()
    if not settings.enable_scheduler:
        logger.info("scheduler disabled by config")
        return

    if scheduler.running:
        return

    scheduler.add_job(
        run_daily_fx_job,
        trigger=CronTrigger(hour=6, minute=0),
        id="daily_fx_fetch_job",
        replace_existing=True,
    )
    scheduler.add_job(
        run_daily_snapshot_job,
        trigger=CronTrigger(hour=23, minute=55),
        id="daily_snapshot_job",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("scheduler started")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("scheduler stopped")
