from fastapi.testclient import TestClient

from app.main import app
from app.main import _status_code_for_app_error


def test_status_code_mapping_by_error_code():
    assert _status_code_for_app_error(4001) == 400
    assert _status_code_for_app_error(4002) == 400
    assert _status_code_for_app_error(4040) == 404
    assert _status_code_for_app_error(4041) == 404
    assert _status_code_for_app_error(4090) == 409
    assert _status_code_for_app_error(5000) == 500
    assert _status_code_for_app_error(4999) == 400


def test_member_not_found_returns_404():
    with TestClient(app) as client:
        resp = client.put("/api/v1/members/999999", json={"name": "Nobody"})

    assert resp.status_code == 404
    payload = resp.json()
    assert payload["code"] == 4040
