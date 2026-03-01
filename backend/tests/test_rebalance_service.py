from app.analytics.rebalance import compute_rebalance_items


def test_rebalance_flags_over_and_under_allocated_assets():
    holdings = [
        {"id": 1, "name": "A", "type": "asset", "amount_base": 80, "target_ratio": 50},
        {"id": 2, "name": "B", "type": "asset", "amount_base": 20, "target_ratio": 50},
        {"id": 3, "name": "Debt", "type": "liability", "amount_base": 10, "target_ratio": None},
    ]

    items = compute_rebalance_items(holdings, net_asset=100, threshold_pct=5)

    assert len(items) == 2
    statuses = {item["name"]: item["status"] for item in items}
    assert statuses["A"] == "超配"
    assert statuses["B"] == "低配"


def test_rebalance_returns_empty_when_net_asset_not_positive():
    items = compute_rebalance_items([], net_asset=0, threshold_pct=5)
    assert items == []
