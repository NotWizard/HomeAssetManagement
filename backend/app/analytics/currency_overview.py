from decimal import Decimal


def build_currency_overview(holdings: list[dict]) -> dict:
    buckets: dict[str, dict] = {}

    for item in holdings:
        currency = str(item.get("currency", "")).strip().upper()
        if not currency:
            continue

        bucket = buckets.setdefault(
            currency,
            {
                "summary": {
                    "currency": currency,
                    "total_asset": Decimal("0"),
                    "total_liability": Decimal("0"),
                    "total_asset_base": Decimal("0"),
                    "total_liability_base": Decimal("0"),
                    "asset_count": 0,
                    "liability_count": 0,
                },
                "asset_breakdown": [],
                "liability_breakdown": [],
                "items": [],
            },
        )

        holding_type = item.get("type")
        amount_original = Decimal(str(item.get("amount_original", 0) or 0))
        amount_base = Decimal(str(item.get("amount_base", amount_original) or 0))
        category_path = _build_category_path(item)

        record = {
            "id": item.get("id"),
            "name": item.get("name"),
            "type": holding_type,
            "currency": currency,
            "category_path": category_path,
            "amount_original": float(amount_original),
            "amount_base": float(amount_base),
            "share_pct": 0.0,
        }

        if holding_type == "asset":
            bucket["summary"]["total_asset"] += amount_original
            bucket["summary"]["total_asset_base"] += amount_base
            bucket["summary"]["asset_count"] += 1
            bucket["asset_breakdown"].append(record)
        elif holding_type == "liability":
            bucket["summary"]["total_liability"] += amount_original
            bucket["summary"]["total_liability_base"] += amount_base
            bucket["summary"]["liability_count"] += 1
            bucket["liability_breakdown"].append(record)
        else:
            continue

        bucket["items"].append(record)

    currencies: list[dict] = []
    details: dict[str, dict] = {}

    for currency, bucket in buckets.items():
        summary = bucket["summary"]
        total_asset = summary["total_asset"]
        total_liability = summary["total_liability"]
        total_asset_base = summary["total_asset_base"]
        total_liability_base = summary["total_liability_base"]

        _apply_share(bucket["asset_breakdown"], total_asset)
        _apply_share(bucket["liability_breakdown"], total_liability)

        bucket["asset_breakdown"].sort(key=lambda row: (-row["amount_original"], str(row["name"])))
        bucket["liability_breakdown"].sort(key=lambda row: (-row["amount_original"], str(row["name"])))
        bucket["items"].sort(
            key=lambda row: (
                0 if row["type"] == "asset" else 1,
                -row["amount_original"],
                str(row["name"]),
            )
        )

        summary_payload = {
            "currency": currency,
            "total_asset": float(total_asset),
            "total_liability": float(total_liability),
            "net_asset": float(total_asset - total_liability),
            "total_asset_base": float(total_asset_base),
            "total_liability_base": float(total_liability_base),
            "net_asset_base": float(total_asset_base - total_liability_base),
            "asset_count": summary["asset_count"],
            "liability_count": summary["liability_count"],
        }

        currencies.append(summary_payload)
        details[currency] = {
            "summary": summary_payload,
            "asset_breakdown": bucket["asset_breakdown"],
            "liability_breakdown": bucket["liability_breakdown"],
            "items": bucket["items"],
        }

    currencies.sort(key=lambda row: (-row["total_asset_base"], row["currency"]))
    return {"currencies": currencies, "details": details}


def _apply_share(rows: list[dict], total: Decimal) -> None:
    divisor = total if total > 0 else Decimal("0")
    for row in rows:
        if divisor == 0:
            row["share_pct"] = 0.0
            continue
        row["share_pct"] = float((Decimal(str(row["amount_original"])) / divisor) * Decimal("100"))


def _build_category_path(item: dict) -> str:
    parts = [item.get("category_l1"), item.get("category_l2"), item.get("category_l3")]
    clean = [str(part).strip() for part in parts if str(part or "").strip()]
    return " / ".join(clean)
