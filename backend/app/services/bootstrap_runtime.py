from dataclasses import dataclass
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.jobs.scheduler import start_scheduler
from app.jobs.scheduler import stop_scheduler
from app.services.bootstrap import ensure_database_schema
from app.services.bootstrap import ensure_seed_data
from app.services.snapshot_service import SnapshotService


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
    startup_options = options or resolve_startup_runtime_options()

    if startup_options.run_schema:
        ensure_database_schema()

    if startup_options.run_seed_data or startup_options.run_bootstrap_snapshot:
        with session_factory() as session:
            if startup_options.run_seed_data:
                ensure_seed_data(session)
            if startup_options.run_bootstrap_snapshot:
                SnapshotService.create_daily_snapshot(session)
            session.commit()

    if startup_options.run_scheduler:
        scheduler_start()


def run_application_shutdown(
    *,
    options: StartupRuntimeOptions | None = None,
    scheduler_stop: Callable[[], None] = stop_scheduler,
) -> None:
    shutdown_options = options or resolve_startup_runtime_options()
    if shutdown_options.run_scheduler:
        scheduler_stop()
