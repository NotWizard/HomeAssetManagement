"""验证本机 API Token 鉴权机制。

默认 `require_auth=False` 不影响现有测试；本测试通过环境变量开启 `require_auth=True`
后断言：
- 不带 X-HBS-Token 头 → 401
- 带错误 token → 401
- 带正确 token → 200
- /health 不受影响（永远公开）
"""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.core.config as config_module
import app.main as app_main_module


@pytest.fixture
def auth_app(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("HBS_REQUIRE_AUTH", "true")
    monkeypatch.setenv("HBS_API_TOKEN", "secret-test-token")
    monkeypatch.setenv("HBS_DATABASE_URL", f"sqlite:///{tmp_path}/auth-test.db")
    monkeypatch.setenv("HBS_STORAGE_DIR", str(tmp_path))
    monkeypatch.setenv("HBS_ENABLE_SCHEDULER", "false")
    monkeypatch.setenv("HBS_ENABLE_BOOTSTRAP_SNAPSHOT", "false")
    monkeypatch.setenv("HBS_CORS_ORIGINS", "")

    config_module.get_settings.cache_clear()
    importlib.reload(config_module)
    importlib.reload(app_main_module)
    yield app_main_module.app

    monkeypatch.delenv("HBS_REQUIRE_AUTH", raising=False)
    monkeypatch.delenv("HBS_API_TOKEN", raising=False)
    monkeypatch.delenv("HBS_DATABASE_URL", raising=False)
    monkeypatch.delenv("HBS_STORAGE_DIR", raising=False)
    config_module.get_settings.cache_clear()
    importlib.reload(config_module)
    importlib.reload(app_main_module)


def test_missing_token_returns_401(auth_app):
    with TestClient(auth_app) as client:
        response = client.get("/api/v1/members")
        assert response.status_code == 401


def test_wrong_token_returns_401(auth_app):
    with TestClient(auth_app) as client:
        response = client.get(
            "/api/v1/members",
            headers={"X-HBS-Token": "wrong-token"},
        )
        assert response.status_code == 401


def test_correct_token_passes(auth_app):
    with TestClient(auth_app) as client:
        response = client.get(
            "/api/v1/members",
            headers={"X-HBS-Token": "secret-test-token"},
        )
        # 即使 0 成员，端点本身应该是 200，鉴权通过即可
        assert response.status_code == 200


def test_health_endpoint_remains_public(auth_app):
    """/health 不在 v1 router 下，永远公开，便于桌面 sidecar 健康轮询。"""
    with TestClient(auth_app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert "app_version" in body


def test_misconfigured_require_auth_without_token_returns_500(monkeypatch, tmp_path: Path):
    """启用 require_auth 但未设置 api_token 视为配置错误。"""
    monkeypatch.setenv("HBS_REQUIRE_AUTH", "true")
    monkeypatch.setenv("HBS_API_TOKEN", "")
    monkeypatch.setenv("HBS_DATABASE_URL", f"sqlite:///{tmp_path}/auth-misc.db")
    monkeypatch.setenv("HBS_STORAGE_DIR", str(tmp_path))
    monkeypatch.setenv("HBS_ENABLE_SCHEDULER", "false")
    monkeypatch.setenv("HBS_ENABLE_BOOTSTRAP_SNAPSHOT", "false")
    monkeypatch.setenv("HBS_CORS_ORIGINS", "")

    config_module.get_settings.cache_clear()
    importlib.reload(config_module)
    importlib.reload(app_main_module)

    try:
        with TestClient(app_main_module.app) as client:
            response = client.get(
                "/api/v1/members",
                headers={"X-HBS-Token": "anything"},
            )
            assert response.status_code == 500
    finally:
        config_module.get_settings.cache_clear()
        importlib.reload(config_module)
        importlib.reload(app_main_module)
