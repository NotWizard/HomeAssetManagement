from fastapi.testclient import TestClient

from app.main import app


def test_create_holding_via_api_creates_snapshot():
    with TestClient(app) as client:
        member_resp = client.post("/api/v1/members", json={"name": "Bob"})
        assert member_resp.status_code == 200
        member_id = member_resp.json()["data"]["id"]

        category_resp = client.get("/api/v1/categories", params={"type": "asset"})
        assert category_resp.status_code == 200
        tree = category_resp.json()["data"]
        l1 = tree[0]
        l2 = l1["children"][0]
        l3 = l2["children"][0]

        create_resp = client.post(
            "/api/v1/holdings",
            json={
                "member_id": member_id,
                "type": "asset",
                "name": "Test Asset",
                "category_l1_id": l1["id"],
                "category_l2_id": l2["id"],
                "category_l3_id": l3["id"],
                "currency": "CNY",
                "amount_original": "100",
                "target_ratio": "10",
            },
        )
        assert create_resp.status_code == 200

        snapshots = client.get("/api/v1/snapshots/events").json()["data"]
        assert len(snapshots) >= 1
