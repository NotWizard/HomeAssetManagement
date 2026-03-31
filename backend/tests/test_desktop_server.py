import desktop_server
from app.services.bootstrap_runtime import resolve_startup_runtime_options


def test_desktop_server_runs_imported_asgi_app(monkeypatch):
    captured: dict[str, object] = {}

    def fake_run(app, host, port, reload):  # type: ignore[no-untyped-def]
        captured["app"] = app
        captured["host"] = host
        captured["port"] = port
        captured["reload"] = reload

    monkeypatch.setattr(desktop_server.uvicorn, "run", fake_run)

    desktop_server.main()

    assert captured["app"] is desktop_server.app
    assert captured["host"] == desktop_server.settings.app_host
    assert captured["port"] == desktop_server.settings.app_port
    assert captured["reload"] is False


def test_desktop_runtime_keeps_bootstrap_snapshot_disabled_by_env():
    options = resolve_startup_runtime_options()
    assert options.run_bootstrap_snapshot is False
