from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.models.family import Family
from app.models.fx_rate_daily import FxRateDaily
from app.main import app
from app.models.holding_item import HoldingItem
from app.models.member import Member
from app.models.settings import SettingsModel
from app.models.snapshot_daily import SnapshotDaily
from app.models.snapshot_event import SnapshotEvent
from app.services.bootstrap import init_database


def _reset_runtime_data() -> None:
    init_database()
    with SessionLocal() as session:
        session.query(SnapshotEvent).delete()
        session.query(SnapshotDaily).delete()
        session.query(FxRateDaily).delete()
        session.query(HoldingItem).delete()
        session.query(Member).delete()
        session.query(SettingsModel).delete()
        session.commit()


def _find_category_path(tree: list[dict], path: tuple[str, str, str]) -> tuple[dict, dict, dict]:
    for l1 in tree:
        if l1["name"] != path[0]:
            continue
        for l2 in l1["children"]:
            if l2["name"] != path[1]:
                continue
            for l3 in l2["children"]:
                if l3["name"] == path[2]:
                    return l1, l2, l3
    raise AssertionError(f"分类路径不存在: {path}")


def test_create_holding_via_api_creates_snapshot():
    _reset_runtime_data()
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


def test_create_holding_uses_correct_fx_direction_for_foreign_currency():
    _reset_runtime_data()
    with SessionLocal() as session:
        session.add(
            FxRateDaily(
                rate_date=date.today(),
                base_currency="CNY",
                quote_currency="USD",
                rate=Decimal("0.14"),
                provider="test",
                is_estimated=False,
            )
        )
        session.commit()

    with TestClient(app) as client:
        member_resp = client.post("/api/v1/members", json={"name": "Bob"})
        member_id = member_resp.json()["data"]["id"]

        category_resp = client.get("/api/v1/categories", params={"type": "asset"})
        tree = category_resp.json()["data"]
        l1, l2, l3 = tree[0], tree[0]["children"][0], tree[0]["children"][0]["children"][0]

        create_resp = client.post(
            "/api/v1/holdings",
            json={
                "member_id": member_id,
                "type": "asset",
                "name": "US ETF",
                "category_l1_id": l1["id"],
                "category_l2_id": l2["id"],
                "category_l3_id": l3["id"],
                "currency": "USD",
                "amount_original": "100",
                "target_ratio": "10",
            },
        )

    assert create_resp.status_code == 200
    assert round(create_resp.json()["data"]["amount_base"], 2) == 714.29


def test_update_settings_revalues_existing_holdings_and_daily_snapshot():
    _reset_runtime_data()
    with SessionLocal() as session:
        session.add(
            FxRateDaily(
                rate_date=date.today(),
                base_currency="USD",
                quote_currency="CNY",
                rate=Decimal("7"),
                provider="test",
                is_estimated=False,
            )
        )
        session.commit()

    with TestClient(app) as client:
        member_resp = client.post("/api/v1/members", json={"name": "Carol"})
        member_id = member_resp.json()["data"]["id"]

        category_resp = client.get("/api/v1/categories", params={"type": "asset"})
        asset_l1, asset_l2, asset_l3 = _find_category_path(category_resp.json()["data"], ("现金与存款", "银行存款", "活期存款"))

        create_resp = client.post(
            "/api/v1/holdings",
            json={
                "member_id": member_id,
                "type": "asset",
                "name": "家庭备用金",
                "category_l1_id": asset_l1["id"],
                "category_l2_id": asset_l2["id"],
                "category_l3_id": asset_l3["id"],
                "currency": "CNY",
                "amount_original": "700",
                "target_ratio": "10",
            },
        )
        assert create_resp.status_code == 200

        update_resp = client.put(
            "/api/v1/settings",
            json={
                "base_currency": "USD",
                "rebalance_threshold_pct": 5,
            },
        )
        holdings_resp = client.get("/api/v1/holdings")
        trend_resp = client.get("/api/v1/analytics/trend", params={"window": 30})

    assert update_resp.status_code == 200
    assert holdings_resp.status_code == 200
    assert trend_resp.status_code == 200
    assert update_resp.json()["data"]["base_currency"] == "USD"
    assert holdings_resp.json()["data"][0]["amount_base"] == 100.0
    assert trend_resp.json()["data"]["total_asset"][-1] == 100.0


def test_delete_holding_updates_daily_analytics_snapshot_immediately():
    _reset_runtime_data()
    with TestClient(app) as client:
        member_resp = client.post("/api/v1/members", json={"name": "Carol"})
        assert member_resp.status_code == 200
        member_id = member_resp.json()["data"]["id"]

        category_resp = client.get("/api/v1/categories", params={"type": "asset"})
        assert category_resp.status_code == 200
        asset_l1, asset_l2, asset_l3 = _find_category_path(category_resp.json()["data"], ("现金与存款", "银行存款", "活期存款"))

        create_resp = client.post(
            "/api/v1/holdings",
            json={
                "member_id": member_id,
                "type": "asset",
                "name": "家庭备用金",
                "category_l1_id": asset_l1["id"],
                "category_l2_id": asset_l2["id"],
                "category_l3_id": asset_l3["id"],
                "currency": "CNY",
                "amount_original": "100",
                "target_ratio": "10",
            },
        )
        assert create_resp.status_code == 200
        holding_id = create_resp.json()["data"]["id"]

        trend_after_create = client.get("/api/v1/analytics/trend", params={"window": 30})
        assert trend_after_create.status_code == 200
        trend_payload = trend_after_create.json()["data"]
        assert trend_payload["total_asset"][-1] == 100.0
        assert trend_payload["net_asset"][-1] == 100.0

        sankey_after_create = client.get("/api/v1/analytics/sankey")
        assert sankey_after_create.status_code == 200
        assert len(sankey_after_create.json()["data"]["nodes"]) > 0

        delete_resp = client.delete(f"/api/v1/holdings/{holding_id}")
        assert delete_resp.status_code == 200

        holdings_after_delete = client.get("/api/v1/holdings")
        assert holdings_after_delete.status_code == 200
        assert holdings_after_delete.json()["data"] == []

        trend_after_delete = client.get("/api/v1/analytics/trend", params={"window": 30})
        assert trend_after_delete.status_code == 200
        trend_payload = trend_after_delete.json()["data"]
        assert trend_payload["total_asset"][-1] == 0.0
        assert trend_payload["net_asset"][-1] == 0.0

        sankey_after_delete = client.get("/api/v1/analytics/sankey")
        assert sankey_after_delete.status_code == 200
        assert sankey_after_delete.json()["data"] == {"nodes": [], "links": []}


def test_currency_overview_api_returns_empty_payload_when_no_snapshot_exists():
    _reset_runtime_data()
    with TestClient(app) as client:
        response = client.get("/api/v1/analytics/currency-overview")

    assert response.status_code == 200
    assert response.json()["data"] == {"currencies": [], "details": {}}


def test_currency_overview_api_returns_currency_summary_and_category_paths():
    _reset_runtime_data()
    with TestClient(app) as client:
        member_resp = client.post("/api/v1/members", json={"name": "Alice"})
        assert member_resp.status_code == 200
        member_id = member_resp.json()["data"]["id"]

        asset_tree = client.get("/api/v1/categories", params={"type": "asset"}).json()["data"]
        liability_tree = client.get("/api/v1/categories", params={"type": "liability"}).json()["data"]

        asset_l1, asset_l2, asset_l3 = _find_category_path(asset_tree, ("权益投资", "股票", "A股"))
        liability_l1, liability_l2, liability_l3 = _find_category_path(
            liability_tree,
            ("消费负债", "信用卡", "已出账单"),
        )

        create_asset = client.post(
            "/api/v1/holdings",
            json={
                "member_id": member_id,
                "type": "asset",
                "name": "沪深300ETF",
                "category_l1_id": asset_l1["id"],
                "category_l2_id": asset_l2["id"],
                "category_l3_id": asset_l3["id"],
                "currency": "CNY",
                "amount_original": "300",
                "target_ratio": "20",
            },
        )
        assert create_asset.status_code == 200

        create_liability = client.post(
            "/api/v1/holdings",
            json={
                "member_id": member_id,
                "type": "liability",
                "name": "信用卡账单",
                "category_l1_id": liability_l1["id"],
                "category_l2_id": liability_l2["id"],
                "category_l3_id": liability_l3["id"],
                "currency": "CNY",
                "amount_original": "50",
                "target_ratio": None,
            },
        )
        assert create_liability.status_code == 200

        response = client.get("/api/v1/analytics/currency-overview")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["currencies"][0]["currency"] == "CNY"
    assert payload["currencies"][0]["total_asset"] == 300.0
    assert payload["currencies"][0]["total_liability"] == 50.0
    assert payload["currencies"][0]["net_asset"] == 250.0
    assert payload["details"]["CNY"]["items"][0]["category_path"] == "权益投资 / 股票 / A股"
    assert payload["details"]["CNY"]["items"][1]["category_path"] == "消费负债 / 信用卡 / 已出账单"



def test_bulk_delete_holdings_by_ids_updates_analytics_immediately():
    _reset_runtime_data()
    with TestClient(app) as client:
        member_resp = client.post("/api/v1/members", json={"name": "Daisy"})
        assert member_resp.status_code == 200
        member_id = member_resp.json()["data"]["id"]

        asset_tree = client.get("/api/v1/categories", params={"type": "asset"}).json()["data"]
        liability_tree = client.get("/api/v1/categories", params={"type": "liability"}).json()["data"]
        asset_l1, asset_l2, asset_l3 = _find_category_path(asset_tree, ("现金与存款", "银行存款", "活期存款"))
        liability_l1, liability_l2, liability_l3 = _find_category_path(liability_tree, ("消费负债", "信用卡", "已出账单"))

        first_resp = client.post(
            "/api/v1/holdings",
            json={
                "member_id": member_id,
                "type": "asset",
                "name": "工资卡",
                "category_l1_id": asset_l1["id"],
                "category_l2_id": asset_l2["id"],
                "category_l3_id": asset_l3["id"],
                "currency": "CNY",
                "amount_original": "100",
                "target_ratio": "10",
            },
        )
        second_resp = client.post(
            "/api/v1/holdings",
            json={
                "member_id": member_id,
                "type": "liability",
                "name": "信用卡账单",
                "category_l1_id": liability_l1["id"],
                "category_l2_id": liability_l2["id"],
                "category_l3_id": liability_l3["id"],
                "currency": "CNY",
                "amount_original": "40",
                "target_ratio": None,
            },
        )
        assert first_resp.status_code == 200
        assert second_resp.status_code == 200

        delete_resp = client.post(
            "/api/v1/holdings/bulk-delete",
            json={
                "mode": "ids",
                "holding_ids": [
                    first_resp.json()["data"]["id"],
                    second_resp.json()["data"]["id"],
                ],
            },
        )
        assert delete_resp.status_code == 200
        assert delete_resp.json()["data"]["deleted_count"] == 2

        holdings_after_delete = client.get("/api/v1/holdings")
        assert holdings_after_delete.status_code == 200
        assert holdings_after_delete.json()["data"] == []

        trend_after_delete = client.get("/api/v1/analytics/trend", params={"window": 30})
        assert trend_after_delete.status_code == 200
        trend_payload = trend_after_delete.json()["data"]
        assert trend_payload["total_asset"][-1] == 0.0
        assert trend_payload["net_asset"][-1] == 0.0

        sankey_after_delete = client.get("/api/v1/analytics/sankey")
        assert sankey_after_delete.status_code == 200
        assert sankey_after_delete.json()["data"] == {"nodes": [], "links": []}


def test_bulk_delete_holdings_by_member_only_removes_target_member_rows():
    _reset_runtime_data()
    with TestClient(app) as client:
        alice_resp = client.post("/api/v1/members", json={"name": "Alice"})
        bob_resp = client.post("/api/v1/members", json={"name": "Bob"})
        assert alice_resp.status_code == 200
        assert bob_resp.status_code == 200
        alice_id = alice_resp.json()["data"]["id"]
        bob_id = bob_resp.json()["data"]["id"]

        asset_tree = client.get("/api/v1/categories", params={"type": "asset"}).json()["data"]
        asset_l1, asset_l2, asset_l3 = _find_category_path(asset_tree, ("现金与存款", "银行存款", "活期存款"))

        for member_id, name, amount in (
            (alice_id, "Alice 工资卡", "100"),
            (alice_id, "Alice 零钱包", "50"),
            (bob_id, "Bob 备用金", "80"),
        ):
            create_resp = client.post(
                "/api/v1/holdings",
                json={
                    "member_id": member_id,
                    "type": "asset",
                    "name": name,
                    "category_l1_id": asset_l1["id"],
                    "category_l2_id": asset_l2["id"],
                    "category_l3_id": asset_l3["id"],
                    "currency": "CNY",
                    "amount_original": amount,
                    "target_ratio": "10",
                },
            )
            assert create_resp.status_code == 200

        delete_resp = client.post(
            "/api/v1/holdings/bulk-delete",
            json={"mode": "member", "member_id": alice_id},
        )
        assert delete_resp.status_code == 200
        assert delete_resp.json()["data"]["deleted_count"] == 2
        assert delete_resp.json()["data"]["member_id"] == alice_id

        holdings_after_delete = client.get("/api/v1/holdings")
        assert holdings_after_delete.status_code == 200
        remaining = holdings_after_delete.json()["data"]
        assert len(remaining) == 1
        assert remaining[0]["member_id"] == bob_id
        assert remaining[0]["name"] == "Bob 备用金"

        trend_after_delete = client.get("/api/v1/analytics/trend", params={"window": 30})
        assert trend_after_delete.status_code == 200
        trend_payload = trend_after_delete.json()["data"]
        assert trend_payload["total_asset"][-1] == 80.0
        assert trend_payload["net_asset"][-1] == 80.0



def test_delete_member_succeeds_after_bulk_deleting_all_member_holdings():
    _reset_runtime_data()
    with TestClient(app) as client:
        member_resp = client.post("/api/v1/members", json={"name": "Erin"})
        assert member_resp.status_code == 200
        member_id = member_resp.json()["data"]["id"]

        asset_tree = client.get("/api/v1/categories", params={"type": "asset"}).json()["data"]
        asset_l1, asset_l2, asset_l3 = _find_category_path(asset_tree, ("现金与存款", "银行存款", "活期存款"))

        create_resp = client.post(
            "/api/v1/holdings",
            json={
                "member_id": member_id,
                "type": "asset",
                "name": "Erin 工资卡",
                "category_l1_id": asset_l1["id"],
                "category_l2_id": asset_l2["id"],
                "category_l3_id": asset_l3["id"],
                "currency": "CNY",
                "amount_original": "100",
                "target_ratio": "10",
            },
        )
        assert create_resp.status_code == 200

        bulk_delete_resp = client.post(
            "/api/v1/holdings/bulk-delete",
            json={"mode": "member", "member_id": member_id},
        )
        assert bulk_delete_resp.status_code == 200

        delete_member_resp = client.delete(f"/api/v1/members/{member_id}")
        assert delete_member_resp.status_code == 200

        members_after_delete = client.get("/api/v1/members")
        assert members_after_delete.status_code == 200
        assert members_after_delete.json()["data"] == []


def test_update_holding_rejects_cross_family_holding_id():
    _reset_runtime_data()
    with TestClient(app) as client:
        member_resp = client.post("/api/v1/members", json={"name": "Alice"})
        assert member_resp.status_code == 200
        member_id = member_resp.json()["data"]["id"]
        category_resp = client.get("/api/v1/categories", params={"type": "asset"})
        tree = category_resp.json()["data"]
        l1, l2, l3 = tree[0], tree[0]["children"][0], tree[0]["children"][0]["children"][0]

    with SessionLocal() as session:
        other_family = Family(name="第二家庭")
        session.add(other_family)
        session.flush()
        outsider_member = Member(family_id=other_family.id, name="外部成员")
        session.add(outsider_member)
        session.flush()
        outsider_holding = HoldingItem(
            family_id=other_family.id,
            member_id=outsider_member.id,
            type="asset",
            name="外部资产",
            category_l1_id=l1["id"],
            category_l2_id=l2["id"],
            category_l3_id=l3["id"],
            currency="CNY",
            amount_original=100,
            amount_base=100,
            target_ratio=10,
            source="manual",
            is_deleted=False,
        )
        session.add(outsider_holding)
        session.commit()
        outsider_holding_id = outsider_holding.id

    with TestClient(app) as client:
        response = client.put(
            f"/api/v1/holdings/{outsider_holding_id}",
            json={
                "member_id": member_id,
                "type": "asset",
                "name": "Should Fail",
                "category_l1_id": l1["id"],
                "category_l2_id": l2["id"],
                "category_l3_id": l3["id"],
                "currency": "CNY",
                "amount_original": "120",
                "target_ratio": "10",
            },
        )

    assert response.status_code == 404
    assert response.json()["code"] == 4041
    assert response.json()["message"] == "资产/负债不属于当前家庭"


def test_update_settings_only_revalues_current_family_holdings_and_snapshots():
    _reset_runtime_data()
    with SessionLocal() as session:
        session.add(
            FxRateDaily(
                rate_date=date.today(),
                base_currency="USD",
                quote_currency="CNY",
                rate=Decimal("7"),
                provider="test",
                is_estimated=False,
            )
        )
        session.commit()

    with TestClient(app) as client:
        member_resp = client.post("/api/v1/members", json={"name": "Carol"})
        member_id = member_resp.json()["data"]["id"]
        category_resp = client.get("/api/v1/categories", params={"type": "asset"})
        asset_l1, asset_l2, asset_l3 = _find_category_path(category_resp.json()["data"], ("现金与存款", "银行存款", "活期存款"))
        create_resp = client.post(
            "/api/v1/holdings",
            json={
                "member_id": member_id,
                "type": "asset",
                "name": "家庭备用金",
                "category_l1_id": asset_l1["id"],
                "category_l2_id": asset_l2["id"],
                "category_l3_id": asset_l3["id"],
                "currency": "CNY",
                "amount_original": "700",
                "target_ratio": "10",
            },
        )
        assert create_resp.status_code == 200

    with SessionLocal() as session:
        other_family = Family(name="第二家庭")
        session.add(other_family)
        session.flush()
        outsider_member = Member(family_id=other_family.id, name="外部成员")
        session.add(outsider_member)
        session.flush()
        outsider_holding = HoldingItem(
            family_id=other_family.id,
            member_id=outsider_member.id,
            type="asset",
            name="外部资产",
            category_l1_id=asset_l1["id"],
            category_l2_id=asset_l2["id"],
            category_l3_id=asset_l3["id"],
            currency="CNY",
            amount_original=700,
            amount_base=700,
            target_ratio=10,
            source="manual",
            is_deleted=False,
        )
        session.add(outsider_holding)
        session.flush()
        outsider_snapshot = SnapshotDaily(
            family_id=other_family.id,
            snapshot_date=date.today(),
            payload_json='{"totals":{"total_asset":700.0,"total_liability":0.0,"net_asset":700.0},"holdings":[{"id":999,"name":"外部资产","type":"asset","currency":"CNY","amount_original":700.0,"amount_base":700.0,"target_ratio":10.0}]}',
        )
        outsider_event = SnapshotEvent(
            family_id=other_family.id,
            trigger_type="manual",
            payload_json='{"totals":{"total_asset":700.0,"total_liability":0.0,"net_asset":700.0},"holdings":[{"id":999,"name":"外部资产","type":"asset","currency":"CNY","amount_original":700.0,"amount_base":700.0,"target_ratio":10.0}]}',
        )
        session.add_all([outsider_snapshot, outsider_event])
        session.commit()
        outsider_holding_id = outsider_holding.id
        outsider_snapshot_id = outsider_snapshot.id
        outsider_event_id = outsider_event.id

    with TestClient(app) as client:
        update_resp = client.put(
            "/api/v1/settings",
            json={
                "base_currency": "USD",
                "rebalance_threshold_pct": 5,
            },
        )
        assert update_resp.status_code == 200

        daily_resp = client.get("/api/v1/snapshots/daily")
        event_resp = client.get("/api/v1/snapshots/events")

    with SessionLocal() as session:
        current_holding = session.query(HoldingItem).filter(HoldingItem.name == "家庭备用金").one()
        untouched_holding = session.query(HoldingItem).filter(HoldingItem.id == outsider_holding_id).one()
        untouched_snapshot = session.query(SnapshotDaily).filter(SnapshotDaily.id == outsider_snapshot_id).one()
        untouched_event = session.query(SnapshotEvent).filter(SnapshotEvent.id == outsider_event_id).one()

    assert float(current_holding.amount_base) == 100.0
    assert float(untouched_holding.amount_base) == 700.0
    assert '"amount_base":700.0' in untouched_snapshot.payload_json
    assert '"amount_base":700.0' in untouched_event.payload_json
    assert all(row["family_id"] == 1 for row in daily_resp.json()["data"])
    assert all(row["family_id"] == 1 for row in event_resp.json()["data"])
