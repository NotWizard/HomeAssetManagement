from decimal import Decimal


def compute_rebalance_items(
    holdings: list[dict],
    net_asset: float,
    threshold_pct: float,
) -> list[dict]:
    if net_asset <= 0:
        return []

    results: list[dict] = []
    net = Decimal(str(net_asset))
    threshold = Decimal(str(threshold_pct))

    for item in holdings:
        if item.get("type") != "asset":
            continue
        target_ratio = item.get("target_ratio")
        if target_ratio is None:
            continue

        current_ratio = (Decimal(str(item.get("amount_base", 0))) / net) * Decimal("100")
        target = Decimal(str(target_ratio))
        deviation = current_ratio - target
        if abs(deviation) < threshold:
            continue

        results.append(
            {
                "id": item.get("id"),
                "name": item.get("name"),
                "target_ratio": float(target),
                "current_ratio": float(current_ratio),
                "deviation": float(deviation),
                "status": "超配" if deviation > 0 else "低配",
            }
        )

    results.sort(key=lambda x: abs(x["deviation"]), reverse=True)
    return results
