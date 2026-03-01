def build_sankey(holdings: list[dict], member_names: dict[int, str]) -> dict:
    nodes: dict[str, dict] = {}
    links: dict[tuple[str, str], float] = {}

    def add_node(key: str, label: str) -> None:
        if key not in nodes:
            nodes[key] = {"id": key, "name": label}

    def add_link(source: str, target: str, value: float) -> None:
        if value <= 0:
            return
        pair = (source, target)
        links[pair] = links.get(pair, 0.0) + value

    for item in holdings:
        value = float(item.get("amount_base", 0.0) or 0.0)
        if value <= 0:
            continue

        member_label = member_names.get(int(item.get("member_id", 0)), "未知成员")
        l1 = str(item.get("category_l1", "未知一级"))
        l2 = str(item.get("category_l2", "未知二级"))
        l3 = str(item.get("category_l3", "未知三级"))
        tail = "资产" if item.get("type") == "asset" else "负债"

        n_member = f"member:{member_label}"
        n_l1 = f"l1:{l1}"
        n_l2 = f"l2:{l1}/{l2}"
        n_l3 = f"l3:{l1}/{l2}/{l3}"
        n_tail = f"tail:{tail}"

        add_node(n_member, member_label)
        add_node(n_l1, l1)
        add_node(n_l2, l2)
        add_node(n_l3, l3)
        add_node(n_tail, tail)

        add_link(n_member, n_l1, value)
        add_link(n_l1, n_l2, value)
        add_link(n_l2, n_l3, value)
        add_link(n_l3, n_tail, value)

    return {
        "nodes": list(nodes.values()),
        "links": [
            {"source": source, "target": target, "value": value}
            for (source, target), value in links.items()
        ],
    }
