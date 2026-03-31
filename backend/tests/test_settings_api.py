from fastapi.testclient import TestClient

from app.main import app


def test_get_settings_returns_readonly_timezone_field():
    with TestClient(app) as client:
        resp = client.get("/api/v1/settings")

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert isinstance(data["timezone"], str)
    assert data["timezone"]


def test_update_settings_without_fx_provider_succeeds_and_keeps_default_provider():
    with TestClient(app) as client:
        resp = client.put(
            "/api/v1/settings",
            json={
                "base_currency": "USD",
                "rebalance_threshold_pct": 6,
            },
        )

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["base_currency"] == "USD"
    assert data["fx_provider"] == "frankfurter"


def test_update_settings_rejects_fx_provider_modification():
    with TestClient(app) as client:
        resp = client.put(
            "/api/v1/settings",
            json={
                "base_currency": "CNY",
                "rebalance_threshold_pct": 5,
                "fx_provider": "exchangerate_host",
            },
        )

    assert resp.status_code == 422


def test_update_settings_rejects_timezone_modification():
    with TestClient(app) as client:
        resp = client.put(
            "/api/v1/settings",
            json={
                "base_currency": "CNY",
                "rebalance_threshold_pct": 5,
                "timezone": "UTC",
            },
        )

    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert any(item["loc"][-1] == "timezone" for item in detail)
