from fastapi.testclient import TestClient

from app.main import app
from app.services.bootstrap_runtime import resolve_startup_runtime_options


def test_health_endpoint():
    client = TestClient(app)
    response = client.get('/health')
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'ok'
    assert 'app_version' in body and isinstance(body['app_version'], str)


def test_test_runtime_disables_scheduler_and_bootstrap_snapshot():
    options = resolve_startup_runtime_options()
    assert options.run_scheduler is False
    assert options.run_bootstrap_snapshot is False
