import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.core.config as config_module
import app.main as app_main_module


@pytest.fixture
def load_app(monkeypatch):
    def _load(frontend_dist_dir: Path | None = None):
        if frontend_dist_dir is None:
            monkeypatch.delenv("HAM_FRONTEND_DIST_DIR", raising=False)
        else:
            monkeypatch.setenv("HAM_FRONTEND_DIST_DIR", str(frontend_dist_dir))

        config_module.get_settings.cache_clear()
        importlib.reload(config_module)
        importlib.reload(app_main_module)
        return app_main_module.app

    yield _load

    monkeypatch.delenv("HAM_FRONTEND_DIST_DIR", raising=False)
    config_module.get_settings.cache_clear()
    importlib.reload(config_module)
    importlib.reload(app_main_module)


def test_backend_can_serve_frontend_dist_for_desktop_shell(tmp_path: Path, load_app):
    dist_dir = tmp_path / "dist"
    assets_dir = dist_dir / "assets"
    assets_dir.mkdir(parents=True)

    index_html = """<!doctype html><html><body><div id="root">desktop</div></body></html>"""
    asset_js = """console.log('desktop asset');"""
    (dist_dir / "index.html").write_text(index_html, encoding="utf-8")
    (assets_dir / "app.js").write_text(asset_js, encoding="utf-8")

    app = load_app(dist_dir)

    with TestClient(app) as client:
        root_response = client.get("/")
        assert root_response.status_code == 200
        assert "desktop" in root_response.text

        asset_response = client.get("/assets/app.js")
        assert asset_response.status_code == 200
        assert "desktop asset" in asset_response.text

        route_response = client.get("/settings")
        assert route_response.status_code == 200
        assert route_response.text == root_response.text

        health_response = client.get("/health")
        assert health_response.status_code == 200
        assert health_response.json() == {"status": "ok"}
