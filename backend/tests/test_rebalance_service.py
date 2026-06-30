from app.analytics.rebalance import compute_rebalance_items


def test_rebalance_excludes_zero_targets_and_returns_actionable_amounts():
    result = compute_rebalance_items(
        [
            {
                "id": 1,
                "member_id": 10,
                "name": "A",
                "type": "asset",
                "amount_base": 80,
                "target_ratio": 50,
            },
            {
                "id": 2,
                "member_id": 10,
                "name": "B",
                "type": "asset",
                "amount_base": 20,
                "target_ratio": 50,
            },
            {
                "id": 3,
                "member_id": 10,
                "name": "Car",
                "type": "asset",
                "amount_base": 100,
                "target_ratio": 0,
            },
            {
                "id": 4,
                "member_id": 10,
                "name": "Debt",
                "type": "liability",
                "amount_base": 30,
                "target_ratio": None,
            },
        ],
        threshold_pct=5,
    )

    assert result["valid"] is True
    assert result["reason"] == "ok"
    assert result["participating_amount"] == 100.0
    assert result["excluded_amount"] == 100.0
    assert result["excluded_count"] == 1
    assert result["allocations"] == [
        {
            "member_id": 10,
            "participating_amount": 100.0,
            "target_ratio_total": 100.0,
            "target_ratio_gap": 0.0,
            "valid": True,
        }
    ]

    items = {item["name"]: item for item in result["items"]}
    assert items["A"] == {
        "id": 1,
        "member_id": 10,
        "name": "A",
        "target_ratio": 50.0,
        "current_ratio": 80.0,
        "deviation": 30.0,
        "current_amount": 80.0,
        "target_amount": 50.0,
        "adjustment_amount": -30.0,
        "status": "超配",
    }
    assert items["B"]["adjustment_amount"] == 30.0
    assert items["B"]["status"] == "低配"


def test_rebalance_rejects_invalid_member_target_total_without_normalizing():
    result = compute_rebalance_items(
        [
            {
                "id": 1,
                "member_id": 10,
                "name": "A",
                "type": "asset",
                "amount_base": 60,
                "target_ratio": 60,
            },
            {
                "id": 2,
                "member_id": 10,
                "name": "B",
                "type": "asset",
                "amount_base": 40,
                "target_ratio": 30,
            },
        ],
        threshold_pct=5,
    )

    assert result["valid"] is False
    assert result["reason"] == "invalid_target_total"
    assert result["allocations"][0]["target_ratio_total"] == 90.0
    assert result["allocations"][0]["target_ratio_gap"] == 10.0
    assert result["items"] == []


def test_rebalance_returns_explicit_empty_pool_states():
    no_participants = compute_rebalance_items(
        [
            {
                "id": 1,
                "member_id": 10,
                "name": "Car",
                "type": "asset",
                "amount_base": 100,
                "target_ratio": 0,
            }
        ],
        threshold_pct=5,
    )
    assert no_participants["valid"] is False
    assert no_participants["reason"] == "no_participating_assets"
    assert no_participants["items"] == []

    zero_amount = compute_rebalance_items(
        [
            {
                "id": 2,
                "member_id": 10,
                "name": "A",
                "type": "asset",
                "amount_base": 0,
                "target_ratio": 100,
            }
        ],
        threshold_pct=5,
    )
    assert zero_amount["valid"] is False
    assert zero_amount["reason"] == "zero_participating_amount"
    assert zero_amount["items"] == []


def test_rebalance_uses_independent_member_pools_and_preserves_threshold_sorting():
    result = compute_rebalance_items(
        [
            {
                "id": 1,
                "member_id": 10,
                "name": "A1",
                "type": "asset",
                "amount_base": 80,
                "target_ratio": 50,
            },
            {
                "id": 2,
                "member_id": 10,
                "name": "A2",
                "type": "asset",
                "amount_base": 20,
                "target_ratio": 50,
            },
            {
                "id": 3,
                "member_id": 20,
                "name": "B1",
                "type": "asset",
                "amount_base": 55,
                "target_ratio": 50,
            },
            {
                "id": 4,
                "member_id": 20,
                "name": "B2",
                "type": "asset",
                "amount_base": 45,
                "target_ratio": 50,
            },
        ],
        threshold_pct=5,
    )

    assert result["valid"] is True
    assert result["participating_amount"] == 200.0
    assert [item["name"] for item in result["items"]] == ["A1", "A2", "B1", "B2"]
    assert [item["current_ratio"] for item in result["items"]] == [80.0, 20.0, 55.0, 45.0]
