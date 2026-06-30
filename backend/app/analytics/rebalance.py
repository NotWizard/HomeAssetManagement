from decimal import Decimal


def compute_rebalance_items(
    holdings: list[dict],
    threshold_pct: float,
) -> dict:
    threshold = Decimal(str(threshold_pct))
    participating_by_member: dict[int | None, list[tuple[dict, Decimal, Decimal]]] = {}
    participating_amount = Decimal("0")
    excluded_amount = Decimal("0")
    excluded_count = 0

    for item in holdings:
        if item.get("type") != "asset":
            continue

        amount = Decimal(str(item.get("amount_base", 0) or 0))
        target = Decimal(str(item.get("target_ratio", 0) or 0))
        if target <= 0:
            excluded_amount += amount
            excluded_count += 1
            continue

        member_id = item.get("member_id")
        participating_by_member.setdefault(member_id, []).append((item, amount, target))
        participating_amount += amount

    result = {
        "valid": False,
        "reason": "no_participating_assets",
        "participating_amount": float(participating_amount),
        "excluded_amount": float(excluded_amount),
        "excluded_count": excluded_count,
        "allocations": [],
        "items": [],
    }
    if not participating_by_member:
        return result

    member_totals: dict[int | None, Decimal] = {}
    for member_id, entries in participating_by_member.items():
        member_amount = sum((amount for _, amount, _ in entries), Decimal("0"))
        target_total = sum((target for _, _, target in entries), Decimal("0"))
        member_totals[member_id] = member_amount
        result["allocations"].append(
            {
                "member_id": member_id,
                "participating_amount": float(member_amount),
                "target_ratio_total": float(target_total),
                "target_ratio_gap": float(Decimal("100") - target_total),
                "valid": target_total == Decimal("100"),
            }
        )

    if any(not allocation["valid"] for allocation in result["allocations"]):
        result["reason"] = "invalid_target_total"
        return result
    if any(total <= 0 for total in member_totals.values()):
        result["reason"] = "zero_participating_amount"
        return result

    items: list[dict] = []
    for member_id, entries in participating_by_member.items():
        member_total = member_totals[member_id]
        for item, current_amount, target in entries:
            current_ratio = (current_amount / member_total) * Decimal("100")
            target_amount = (member_total * target) / Decimal("100")
            adjustment_amount = target_amount - current_amount
            deviation = current_ratio - target
            if abs(deviation) < threshold:
                continue

            items.append(
                {
                    "id": item.get("id"),
                    "member_id": member_id,
                    "name": item.get("name"),
                    "target_ratio": float(target),
                    "current_ratio": float(current_ratio),
                    "deviation": float(deviation),
                    "current_amount": float(current_amount),
                    "target_amount": float(target_amount),
                    "adjustment_amount": float(adjustment_amount),
                    "status": "超配" if deviation > 0 else "低配",
                }
            )

    items.sort(key=lambda item: abs(item["deviation"]), reverse=True)
    result["valid"] = True
    result["reason"] = "ok"
    result["items"] = items
    return result
