def build_sankey(holdings: list[dict], member_names: dict[int, str]) -> dict:
    nodes: dict[str, dict] = {}
    links: dict[tuple[str, str], float] = {}
    member_side_totals: dict[tuple[int, str], float] = {}

    def ensure_node(
        key: str,
        *,
        label: str,
        depth: int,
        node_type: str,
        holding_type: str | None = None,
        amount: float = 0.0,
        member_id: int | None = None,
        member_name: str | None = None,
        category_path: str | None = None,
    ) -> None:
        if key not in nodes:
            nodes[key] = {
                "id": key,
                "name": label,
                "depth": depth,
                "node_type": node_type,
                "holding_type": holding_type,
                "amount": 0.0,
                "member_id": member_id,
                "member_name": member_name,
                "category_path": category_path,
                "share_pct": None,
            }
        nodes[key]["amount"] += amount
        if member_name is not None:
            nodes[key]["member_name"] = member_name
        if category_path is not None:
            nodes[key]["category_path"] = category_path

    def add_link(source: str, target: str, value: float) -> None:
        if value <= 0:
            return
        pair = (source, target)
        links[pair] = links.get(pair, 0.0) + value

    for item in holdings:
        value = float(item.get("amount_base", 0.0) or 0.0)
        if value <= 0:
            continue

        member_id = int(item.get("member_id", 0) or 0)
        member_label = member_names.get(member_id, f"成员 {member_id}")
        holding_type = str(item.get("type", "")).strip()
        if holding_type not in {"asset", "liability"}:
            continue

        l1 = str(item.get("category_l1", "未分类"))
        l2 = str(item.get("category_l2", "未分类"))
        l3 = str(item.get("category_l3", "未分类"))
        l2_path = f"{l1} / {l2}"
        l3_path = f"{l1} / {l2} / {l3}"

        member_side_totals[(member_id, holding_type)] = member_side_totals.get((member_id, holding_type), 0.0) + value

        member_key = f"member:{member_id}"
        ensure_node(
            member_key,
            label=member_label,
            depth=2,
            node_type="member",
            amount=value,
            member_id=member_id,
            member_name=member_label,
        )

        if holding_type == "liability":
            category_key = f"liability:l2:{member_id}:{l1}/{l2}"
            item_key = f"liability:l3:{member_id}:{l1}/{l2}/{l3}"
            ensure_node(
                category_key,
                label=l2,
                depth=1,
                node_type="category",
                holding_type="liability",
                amount=value,
                member_id=member_id,
                member_name=member_label,
                category_path=l2_path,
            )
            ensure_node(
                item_key,
                label=l3,
                depth=0,
                node_type="holding",
                holding_type="liability",
                amount=value,
                member_id=member_id,
                member_name=member_label,
                category_path=l3_path,
            )
            add_link(member_key, category_key, value)
            add_link(category_key, item_key, value)
            continue

        category_key = f"asset:l2:{member_id}:{l1}/{l2}"
        item_key = f"asset:l3:{member_id}:{l1}/{l2}/{l3}"
        ensure_node(
            category_key,
            label=l2,
            depth=3,
            node_type="category",
            holding_type="asset",
            amount=value,
            member_id=member_id,
            member_name=member_label,
            category_path=l2_path,
        )
        ensure_node(
            item_key,
            label=l3,
            depth=4,
            node_type="holding",
            holding_type="asset",
            amount=value,
            member_id=member_id,
            member_name=member_label,
            category_path=l3_path,
        )
        add_link(member_key, category_key, value)
        add_link(category_key, item_key, value)

    for node in nodes.values():
        if node["node_type"] == "member" or node["holding_type"] is None or node["member_id"] is None:
            continue
        total = member_side_totals.get((node["member_id"], node["holding_type"]), 0.0)
        node["share_pct"] = round(node["amount"] / total * 100, 2) if total > 0 else 0.0

    return {
        "nodes": list(nodes.values()),
        "links": [
            {"source": source, "target": target, "value": value}
            for (source, target), value in links.items()
        ],
    }
