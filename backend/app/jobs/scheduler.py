from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.timezone import get_business_tzinfo
from app.core.database import SessionLocal
from app.jobs.fx_jobs import run_daily_fx_job
from app.jobs.snapshot_jobs import run_daily_snapshot_job

logger = get_logger(__name__)

# 限制 default executor 为 1 worker（默认 10 太多）：
# 本项目只有 daily_fx_fetch_job + daily_snapshot_job 两个 job，互不并发，
# 单 worker 足够；原 10 worker 每个 stack ~2MB → 常驻 sidecar 内存 -20MB。
scheduler = BackgroundScheduler(executors={"default": ThreadPoolExecutor(1)})


def _get_scheduler_timezone():
    with SessionLocal() as session:
        return get_business_tzinfo(session)


def start_scheduler() -> None:
    settings = get_settings()
    if not settings.enable_scheduler:
        logger.info("scheduler disabled by config")
        return

    if scheduler.running:
        return

    scheduler_timezone = _get_scheduler_timezone()
    # misfire_grace_time：进程睡眠/被休眠唤醒后允许追赶最多 1 小时的漏跑
    # coalesce: True：错过多次只补跑一次，避免雪崩
    # max_instances: 1：同一作业不允许并发，防止业务侧重入
    common_job_kwargs = {
        "misfire_grace_time": 3600,
        "coalesce": True,
        "max_instances": 1,
        "replace_existing": True,
    }
    scheduler.add_job(
        run_daily_fx_job,
        trigger=CronTrigger(hour=6, minute=0, timezone=scheduler_timezone),
        id="daily_fx_fetch_job",
        **common_job_kwargs,
    )
    scheduler.add_job(
        run_daily_snapshot_job,
        trigger=CronTrigger(hour=23, minute=55, timezone=scheduler_timezone),
        id="daily_snapshot_job",
        **common_job_kwargs,
    )
    scheduler.start()
    logger.info("scheduler started business_timezone=%s", scheduler_timezone)


def stop_scheduler() -> None:
    if scheduler.running:
        # wait=True：等待 in-flight job 干净落地，避免与 SessionLocal 关闭顺序竞态
        scheduler.shutdown(wait=True)
        logger.info("scheduler stopped")
