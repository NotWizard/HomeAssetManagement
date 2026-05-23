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

# 模块 import 时不实例化 BackgroundScheduler，避免 enable_scheduler=False
# 配置下仍付一次实例化 + worker 线程预创建开销。首次 start_scheduler 调用
# 时才创建（L4 lazy import 思路落地的一个具体点；配合 M8 的 1-worker 限制）。
_scheduler: BackgroundScheduler | None = None


def _get_or_create_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler(executors={"default": ThreadPoolExecutor(1)})
    return _scheduler


def _get_scheduler_timezone():
    with SessionLocal() as session:
        return get_business_tzinfo(session)


def start_scheduler() -> None:
    settings = get_settings()
    if not settings.enable_scheduler:
        logger.info("scheduler disabled by config")
        return

    scheduler = _get_or_create_scheduler()
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
    if _scheduler is not None and _scheduler.running:
        # wait=True：等待 in-flight job 干净落地，避免与 SessionLocal 关闭顺序竞态
        _scheduler.shutdown(wait=True)
        logger.info("scheduler stopped")
