from __future__ import annotations

from pathlib import Path
import sys

from sqlalchemy import create_engine
from sqlalchemy import inspect


BASELINE_REVISION = "20260331_000001"
MANAGED_TABLES = {
    "category",
    "family",
    "fx_rate_daily",
    "holding_item",
    "import_log",
    "member",
    "settings",
    "snapshot_daily",
    "snapshot_event",
}


def _resolve_runtime_root() -> Path:
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass)
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def resolve_migration_paths() -> tuple[Path, Path]:
    runtime_root = _resolve_runtime_root()
    return runtime_root / "alembic.ini", runtime_root / "db_migrations"


def should_stamp_legacy_schema(database_url: str) -> bool:
    engine = create_engine(database_url, future=True)
    try:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
    finally:
        engine.dispose()

    return "alembic_version" not in table_names and bool(table_names & MANAGED_TABLES)


def run_database_migrations(database_url: str) -> None:
    try:
        from alembic import command
        from alembic.config import Config
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "缺少 Alembic 依赖，请先执行 `pip install -r backend/requirements.txt`。"
        ) from exc

    config_path, script_location = resolve_migration_paths()
    config = Config(str(config_path))
    config.set_main_option("script_location", str(script_location))
    config.set_main_option("sqlalchemy.url", database_url)

    if should_stamp_legacy_schema(database_url):
        command.stamp(config, BASELINE_REVISION)

    command.upgrade(config, "head")
