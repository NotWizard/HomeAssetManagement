import logging
from dataclasses import dataclass
from collections.abc import Callable
from threading import Thread

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.jobs.scheduler import start_scheduler
from app.jobs.scheduler import stop_scheduler
from app.services.bootstrap import ensure_database_schema
from app.services.bootstrap import ensure_seed_data
from app.services.snapshot_service import SnapshotService

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StartupRuntimeOptions:
    run_schema: bool = True
    run_seed_data: bool = True
    run_bootstrap_snapshot: bool = True
    run_scheduler: bool = True


SessionFactory = Callable[[], Session]


def resolve_startup_runtime_options() -> StartupRuntimeOptions:
    settings = get_settings()
    return StartupRuntimeOptions(
        run_schema=True,
        run_seed_data=True,
        run_bootstrap_snapshot=settings.enable_bootstrap_snapshot,
        run_scheduler=settings.enable_scheduler,
    )


def run_application_startup(
    *,
    options: StartupRuntimeOptions | None = None,
    session_factory: SessionFactory = SessionLocal,
    scheduler_start: Callable[[], None] = start_scheduler,
) -> None:
    """启动副作用编排，每一阶段使用独立事务且尽量互不阻塞。

    阶段顺序：
      1. schema 初始化（必须成功；失败直接抛出阻断启动）
      2. seed 默认数据（必须成功；失败直接抛出阻断启动）
      3. boot snapshot（best-effort：失败仅日志告警，不影响应用上线）
      4. scheduler 启动（best-effort：失败仅日志告警，桌面 UI 仍可用）
    """
    startup_options = options or resolve_startup_runtime_options()

    if startup_options.run_schema:
        ensure_database_schema()

    if startup_options.run_seed_data:
        with session_factory() as session:
            ensure_seed_data(session)
            session.commit()

    if startup_options.run_bootstrap_snapshot:
        # daily snapshot 改异步后台执行：原同步路径会让 /health 在快照写完前不返回 200，
        # Electron 前端 loading 页要等这一步；holdings 较多时冷启动慢 1-3s。
        # 改为 daemon Thread 后台跑，自己开 Session，异常吞掉只 warning。
        # 返回 Thread 引用便于测试 join；生产代码不需要等。
        _start_bootstrap_snapshot_async(session_factory)

    if startup_options.run_scheduler:
        try:
            scheduler_start()
        except Exception as exc:  # pragma: no cover - best-effort path
            logger.warning(
                "scheduler 启动失败，已跳过：%s",
                exc,
                exc_info=True,
            )


def _start_bootstrap_snapshot_async(session_factory: SessionFactory) -> Thread:
    def _run() -> None:
        try:
            with session_factory() as session:
                SnapshotService.create_daily_snapshot(session)
                session.commit()
                logger.info("boot snapshot done (async)")
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "boot snapshot 失败，已跳过：%s",
                exc,
                exc_info=True,
            )

    thread = Thread(target=_run, daemon=True, name="boot-snapshot")
    thread.start()
    return thread


def run_application_shutdown(
    *,
    options: StartupRuntimeOptions | None = None,
    scheduler_stop: Callable[[], None] = stop_scheduler,
) -> None:
    shutdown_options = options or resolve_startup_runtime_options()
    if shutdown_options.run_scheduler:
        scheduler_stop()
