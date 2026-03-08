import json
from datetime import date
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import format_utc_iso_z
from app.models.snapshot_daily import SnapshotDaily


def build_daily_series(session: Session, window: int = 90) -> dict:
    rows = list(
        session.scalars(
            select(SnapshotDaily).order_by(SnapshotDaily.snapshot_date.desc()).limit(max(1, window))
        )
    )
    rows.reverse()

    dates: list[str] = []
    total_asset: list[float] = []
    total_liability: list[float] = []
    net_asset: list[float] = []
    per_asset: dict[str, list[float | None]] = {}

    for index, row in enumerate(rows):
        payload = json.loads(row.payload_json)
        dates.append(row.snapshot_date.isoformat())
        totals = payload.get("totals", {})
        total_asset.append(float(totals.get("total_asset", 0.0)))
        total_liability.append(float(totals.get("total_liability", 0.0)))
        net_asset.append(float(totals.get("net_asset", 0.0)))

        seen_assets: set[str] = set()
        for item in payload.get("holdings", []):
            if item.get("type") != "asset":
                continue
            name = item.get("name") or f"asset_{item.get('id')}"
            seen_assets.add(name)
            per_asset.setdefault(name, [None] * index)
            per_asset[name].append(float(item.get("amount_base", 0.0)))

        for name, values in per_asset.items():
            if name not in seen_assets and len(values) == index:
                values.append(None)

    return {
        "dates": dates,
        "total_asset": total_asset,
        "total_liability": total_liability,
        "net_asset": net_asset,
        "asset_series": per_asset,
        "generated_at": format_utc_iso_z(),
    }
