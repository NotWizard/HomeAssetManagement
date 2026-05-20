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
            monkeypatch.delenv("HBS_FRONTEND_DIST_DIR", raising=False)
        else:
            monkeypatch.setenv("HBS_FRONTEND_DIST_DIR", str(frontend_dist_dir))

        config_module.get_settings.cache_clear()
        importlib.reload(config_module)
        importlib.reload(app_main_module)
        return app_main_module.app

    yield _load

    monkeypatch.delenv("HBS_FRONTEND_DIST_DIR", raising=False)
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
        body = health_response.json()
        assert body["status"] == "ok"
        assert "app_version" in body


def test_unmatched_api_paths_do_not_fall_through_to_frontend(tmp_path: Path, load_app):
    """未命中的 /api/* 与 backend 保留路径不能被 catch-all 吞掉返回前端 index。"""
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()
    index_marker = "FRONTEND_INDEX_SENTINEL_8a13"
    (dist_dir / "index.html").write_text(
        f"<!doctype html><html><body>{index_marker}</body></html>",
        encoding="utf-8",
    )

    app = load_app(dist_dir)

    with TestClient(app) as client:
        for path in ("/api/v2/typo", "/api/anything", "/api"):
            response = client.get(path)
            assert response.status_code == 404, f"{path} should 404, got {response.status_code}"
            assert index_marker not in response.text, (
                f"{path} 不应返回前端 index 内容"
            )

        for path in ("/docs", "/openapi.json", "/redoc"):
            response = client.get(path)
            assert index_marker not in response.text, (
                f"{path} 不应被 catch-all 吞掉成前端 index"
            )
