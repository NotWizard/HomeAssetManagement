import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.core.config as config_module
import app.main as app_main_module


@pytest.fixture
def reload_app_with_cors(monkeypatch, tmp_path: Path):
    """重新加载 app 以应用环境变量驱动的 CORS 设置。"""

    def _load(cors_origins: str | None) -> object:
        if cors_origins is None:
            monkeypatch.delenv("HBS_CORS_ORIGINS", raising=False)
        else:
            monkeypatch.setenv("HBS_CORS_ORIGINS", cors_origins)

        # 隔离测试 DB，避免污染主库
        monkeypatch.setenv("HBS_DATABASE_URL", f"sqlite:///{tmp_path}/cors-test.db")
        monkeypatch.setenv("HBS_STORAGE_DIR", str(tmp_path))
        monkeypatch.setenv("HBS_ENABLE_SCHEDULER", "false")
        monkeypatch.setenv("HBS_ENABLE_BOOTSTRAP_SNAPSHOT", "false")

        config_module.get_settings.cache_clear()
        importlib.reload(config_module)
        importlib.reload(app_main_module)
        return app_main_module.app

    yield _load

    monkeypatch.delenv("HBS_CORS_ORIGINS", raising=False)
    config_module.get_settings.cache_clear()
    importlib.reload(config_module)
    importlib.reload(app_main_module)


def test_default_dev_origin_is_allowed(reload_app_with_cors):
    app = reload_app_with_cors(None)

    with TestClient(app) as client:
        response = client.options(
            "/health",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"
    assert "GET" in response.headers.get("access-control-allow-methods", "")


def test_unknown_origin_is_not_echoed_back(reload_app_with_cors):
    """未列入白名单的 Origin 不应被回显（防 credentials + * 反模式）。"""
    app = reload_app_with_cors(None)

    with TestClient(app) as client:
        response = client.options(
            "/health",
            headers={
                "Origin": "https://evil.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.headers.get("access-control-allow-origin") != "https://evil.example.com"
    assert response.headers.get("access-control-allow-origin") != "*"


def test_wildcard_method_is_no_longer_emitted(reload_app_with_cors):
    """allow_methods 必须是显式列表，不能再返回 * 通配。"""
    app = reload_app_with_cors(None)

    with TestClient(app) as client:
        response = client.options(
            "/health",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "GET",
            },
        )

    methods = response.headers.get("access-control-allow-methods", "")
    assert methods != "*"
    assert "GET" in methods
    assert "POST" in methods


def test_cors_allows_hbs_token_header(reload_app_with_cors):
    """dev 模式开启 require_auth 时，X-HBS-Token 必须在 CORS 白名单内，否则预检失败。"""
    app = reload_app_with_cors(None)

    with TestClient(app) as client:
        response = client.options(
            "/health",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "x-hbs-token",
            },
        )

    assert "x-hbs-token" in response.headers.get("access-control-allow-headers", "").lower()


def test_empty_cors_origins_disables_cors(reload_app_with_cors):
    """HBS_CORS_ORIGINS='' 时 CORSMiddleware 完全不挂载（适配桌面同源）。"""
    app = reload_app_with_cors("")

    with TestClient(app) as client:
        response = client.options(
            "/health",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.headers.get("access-control-allow-origin") is None
