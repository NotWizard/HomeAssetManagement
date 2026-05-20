from app.services.bootstrap_runtime import StartupRuntimeOptions
from app.services.bootstrap_runtime import resolve_startup_runtime_options
from app.services.bootstrap_runtime import run_application_shutdown
from app.services.bootstrap_runtime import run_application_startup


def test_resolve_startup_runtime_options_reflects_config(monkeypatch):
    monkeypatch.setenv("HBS_ENABLE_SCHEDULER", "false")
    monkeypatch.setenv("HBS_ENABLE_BOOTSTRAP_SNAPSHOT", "false")

    import app.core.config as config_module
    import app.services.bootstrap_runtime as runtime_module

    config_module.get_settings.cache_clear()

    try:
        options = runtime_module.resolve_startup_runtime_options()
        assert options.run_schema is True
        assert options.run_seed_data is True
        assert options.run_scheduler is False
        assert options.run_bootstrap_snapshot is False
    finally:
        config_module.get_settings.cache_clear()


class DummySession:
    def __init__(self):
        self.committed = False
        self.entered = False
        self.exited = False

    def __enter__(self):
        self.entered = True
        return self

    def __exit__(self, exc_type, exc, tb):
        self.exited = True
        return False

    def commit(self):
        self.committed = True


def test_run_application_startup_allows_disabling_snapshot_and_scheduler():
    calls: list[str] = []
    session = DummySession()

    def session_factory():
        return session

    def scheduler_start():
        calls.append("scheduler_start")

    def ensure_schema():
        calls.append("schema")

    def ensure_seed(session_obj):
        assert session_obj is session
        calls.append("seed")

    def create_snapshot(session_obj):
        assert session_obj is session
        calls.append("snapshot")

    import app.services.bootstrap_runtime as runtime_module

    original_ensure_schema = runtime_module.ensure_database_schema
    original_ensure_seed = runtime_module.ensure_seed_data
    original_snapshot = runtime_module.SnapshotService.create_daily_snapshot

    runtime_module.ensure_database_schema = ensure_schema
    runtime_module.ensure_seed_data = ensure_seed
    runtime_module.SnapshotService.create_daily_snapshot = create_snapshot
    try:
        run_application_startup(
            options=StartupRuntimeOptions(
                run_schema=True,
                run_seed_data=True,
                run_bootstrap_snapshot=False,
                run_scheduler=False,
            ),
            session_factory=session_factory,
            scheduler_start=scheduler_start,
        )
    finally:
        runtime_module.ensure_database_schema = original_ensure_schema
        runtime_module.ensure_seed_data = original_ensure_seed
        runtime_module.SnapshotService.create_daily_snapshot = original_snapshot

    assert calls == ["schema", "seed"]
    assert session.entered is True
    assert session.exited is True
    assert session.committed is True


def test_boot_snapshot_failure_is_swallowed_and_does_not_block_startup():
    """boot snapshot 失败不应该阻止 schema/seed/scheduler 完成。"""
    calls: list[str] = []
    sessions: list[DummySession] = []

    def session_factory():
        s = DummySession()
        sessions.append(s)
        return s

    def scheduler_start():
        calls.append("scheduler_start")

    def ensure_schema():
        calls.append("schema")

    def ensure_seed(_):
        calls.append("seed")

    def create_snapshot(_):
        calls.append("snapshot_attempt")
        raise RuntimeError("FX provider unreachable")

    import app.services.bootstrap_runtime as runtime_module

    original_ensure_schema = runtime_module.ensure_database_schema
    original_ensure_seed = runtime_module.ensure_seed_data
    original_snapshot = runtime_module.SnapshotService.create_daily_snapshot

    runtime_module.ensure_database_schema = ensure_schema
    runtime_module.ensure_seed_data = ensure_seed
    runtime_module.SnapshotService.create_daily_snapshot = create_snapshot
    try:
        run_application_startup(
            options=StartupRuntimeOptions(
                run_schema=True,
                run_seed_data=True,
                run_bootstrap_snapshot=True,
                run_scheduler=True,
            ),
            session_factory=session_factory,
            scheduler_start=scheduler_start,
        )
    finally:
        runtime_module.ensure_database_schema = original_ensure_schema
        runtime_module.ensure_seed_data = original_ensure_seed
        runtime_module.SnapshotService.create_daily_snapshot = original_snapshot

    assert "schema" in calls
    assert "seed" in calls
    assert "snapshot_attempt" in calls
    assert "scheduler_start" in calls, "scheduler 必须仍然启动"
    # 两个独立 session：一个给 seed，一个给 snapshot
    assert len(sessions) == 2
    # seed session 已 commit；snapshot session 因 raise 不会 commit
    assert sessions[0].committed is True
    assert sessions[1].committed is False


def test_scheduler_failure_does_not_block_startup():
    """scheduler 启动失败也不应抛回到 lifespan 阻断应用上线。"""
    import app.services.bootstrap_runtime as runtime_module

    def boom() -> None:
        raise RuntimeError("scheduler down")

    # schema/seed/snapshot 都关闭，仅测 scheduler best-effort 行为
    run_application_startup(
        options=StartupRuntimeOptions(
            run_schema=False,
            run_seed_data=False,
            run_bootstrap_snapshot=False,
            run_scheduler=True,
        ),
        session_factory=DummySession,
        scheduler_start=boom,
    )


def test_run_application_shutdown_respects_scheduler_flag():
    calls: list[str] = []

    run_application_shutdown(
        options=StartupRuntimeOptions(run_scheduler=False),
        scheduler_stop=lambda: calls.append("stop"),
    )
    assert calls == []

    run_application_shutdown(
        options=StartupRuntimeOptions(run_scheduler=True),
        scheduler_stop=lambda: calls.append("stop"),
    )
    assert calls == ["stop"]
