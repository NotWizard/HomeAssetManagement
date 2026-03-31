from pathlib import Path
import types
import sys

from sqlalchemy import create_engine
from sqlalchemy import text

from app.services.schema_migration import BASELINE_REVISION
from app.services.schema_migration import resolve_migration_paths
from app.services.schema_migration import run_database_migrations
from app.services.schema_migration import should_stamp_legacy_schema


class DummyConfig:
    def __init__(self, path: str):
        self.path = path
        self.options: dict[str, str] = {}

    def set_main_option(self, key: str, value: str) -> None:
        self.options[key] = value



def test_resolve_migration_paths_returns_backend_files(monkeypatch):
    import app.services.schema_migration as migration_module

    monkeypatch.setattr(migration_module.sys, "frozen", False, raising=False)
    monkeypatch.setattr(
        migration_module,
        "__file__",
        "/repo/backend/app/services/schema_migration.py",
    )

    config_path, script_location = resolve_migration_paths()

    assert config_path == Path("/repo/backend/alembic.ini")
    assert script_location == Path("/repo/backend/db_migrations")



def test_should_stamp_legacy_schema_detects_existing_tables(tmp_path):
    database_path = tmp_path / "legacy.db"
    engine = create_engine(f"sqlite:///{database_path}", future=True)
    try:
        with engine.begin() as connection:
            connection.execute(text("create table family (id integer primary key, name varchar(100))"))
        assert should_stamp_legacy_schema(f"sqlite:///{database_path}") is True

        with engine.begin() as connection:
            connection.execute(text("create table alembic_version (version_num varchar(32) not null)"))
        assert should_stamp_legacy_schema(f"sqlite:///{database_path}") is False
    finally:
        engine.dispose()



def test_run_database_migrations_uses_alembic_head(monkeypatch):
    import app.services.schema_migration as migration_module

    invoked: dict[str, object] = {}

    class DummyCommandModule:
        @staticmethod
        def stamp(config, revision: str) -> None:
            invoked["stamped"] = revision

        @staticmethod
        def upgrade(config, revision: str) -> None:
            invoked["config"] = config
            invoked["revision"] = revision

    monkeypatch.setattr(
        migration_module,
        "resolve_migration_paths",
        lambda: (Path("/tmp/backend/alembic.ini"), Path("/tmp/backend/db_migrations")),
    )
    monkeypatch.setattr(migration_module, "should_stamp_legacy_schema", lambda database_url: False)
    alembic_module = types.ModuleType("alembic")
    alembic_module.command = DummyCommandModule
    config_module = types.ModuleType("alembic.config")
    config_module.Config = DummyConfig
    monkeypatch.setitem(sys.modules, "alembic", alembic_module)
    monkeypatch.setitem(sys.modules, "alembic.config", config_module)

    run_database_migrations("sqlite:///tmp/test.db")

    config = invoked["config"]
    assert isinstance(config, DummyConfig)
    assert config.path == "/tmp/backend/alembic.ini"
    assert config.options["script_location"] == "/tmp/backend/db_migrations"
    assert config.options["sqlalchemy.url"] == "sqlite:///tmp/test.db"
    assert invoked["revision"] == "head"
    assert "stamped" not in invoked



def test_run_database_migrations_stamps_legacy_schema(monkeypatch):
    import app.services.schema_migration as migration_module

    invoked: list[tuple[str, str]] = []

    class DummyCommandModule:
        @staticmethod
        def stamp(config, revision: str) -> None:
            invoked.append(("stamp", revision))

        @staticmethod
        def upgrade(config, revision: str) -> None:
            invoked.append(("upgrade", revision))

    monkeypatch.setattr(
        migration_module,
        "resolve_migration_paths",
        lambda: (Path("/tmp/backend/alembic.ini"), Path("/tmp/backend/db_migrations")),
    )
    monkeypatch.setattr(migration_module, "should_stamp_legacy_schema", lambda database_url: True)
    alembic_module = types.ModuleType("alembic")
    alembic_module.command = DummyCommandModule
    config_module = types.ModuleType("alembic.config")
    config_module.Config = DummyConfig
    monkeypatch.setitem(sys.modules, "alembic", alembic_module)
    monkeypatch.setitem(sys.modules, "alembic.config", config_module)

    run_database_migrations("sqlite:///tmp/test.db")

    assert invoked == [("stamp", BASELINE_REVISION), ("upgrade", "head")]
