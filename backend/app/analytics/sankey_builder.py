def build_sankey(holdings: list[dict], member_names: dict[int, str]) -> dict:
    nodes: dict[str, dict] = {}
    links: dict[tuple[str, str], float] = {}

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
        holding_id = int(item.get("id", 0) or 0)
        holding_type = str(item.get("type", "")).strip()
        item_name = str(item.get("name") or f"条目 {holding_id}")
        l1 = str(item.get("category_l1", "未分类"))
        l2 = str(item.get("category_l2", "未分类"))
        l3 = str(item.get("category_l3", "未分类"))
        category_path = f"{l1} / {l2} / {l3}"

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
            category_key = f"liability:l1:{l1}"
            item_key = f"liability:item:{holding_id}"
            ensure_node(
                category_key,
                label=l1,
                depth=1,
                node_type="category",
                holding_type="liability",
                amount=value,
                category_path=l1,
            )
            ensure_node(
                item_key,
                label=item_name,
                depth=0,
                node_type="holding",
                holding_type="liability",
                amount=value,
                member_id=member_id,
                member_name=member_label,
                category_path=category_path,
            )
            add_link(member_key, category_key, value)
            add_link(category_key, item_key, value)
            continue

        if holding_type != "asset":
            continue

        category_key = f"asset:l1:{l1}"
        item_key = f"asset:item:{holding_id}"
        ensure_node(
            category_key,
            label=l1,
            depth=3,
            node_type="category",
            holding_type="asset",
            amount=value,
            category_path=l1,
        )
        ensure_node(
            item_key,
            label=item_name,
            depth=4,
            node_type="holding",
            holding_type="asset",
            amount=value,
            member_id=member_id,
            member_name=member_label,
            category_path=category_path,
        )
        add_link(member_key, category_key, value)
        add_link(category_key, item_key, value)

    return {
        "nodes": list(nodes.values()),
        "links": [
            {"source": source, "target": target, "value": value}
            for (source, target), value in links.items()
        ],
    }
