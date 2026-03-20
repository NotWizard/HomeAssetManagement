from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.models.holding_item import HoldingItem
from app.models.member import Member
from app.models.snapshot_daily import SnapshotDaily
from app.models.snapshot_event import SnapshotEvent
from app.services.bootstrap import init_database


def _reset_members_data() -> None:
    init_database()
    with SessionLocal() as session:
        session.query(SnapshotEvent).delete()
        session.query(SnapshotDaily).delete()
        session.query(HoldingItem).delete()
        session.query(Member).delete()
        session.commit()


def test_create_member_rejects_blank_name_after_strip():
    _reset_members_data()
    with TestClient(app) as client:
        response = client.post("/api/v1/members", json={"name": "   "})

    assert response.status_code == 400
    assert response.json()["message"] == "成员名称不能为空"


def test_create_member_rejects_duplicate_name():
    _reset_members_data()
    with TestClient(app) as client:
        first = client.post("/api/v1/members", json={"name": "Alice"})
        duplicate = client.post("/api/v1/members", json={"name": " Alice "})

    assert first.status_code == 200
    assert duplicate.status_code == 409
    assert duplicate.json()["message"] == "成员名称已存在"
