import json
from datetime import date
from datetime import datetime
from decimal import Decimal

from sqlalchemy import and_
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.holding_item import HoldingItem
from app.models.snapshot_daily import SnapshotDaily
from app.models.snapshot_event import SnapshotEvent
from app.core.timezone import business_today
from app.services.common import get_default_family
from app.utils.serialization import decimal_to_float


class SnapshotService:
    @staticmethod
    def create_event_snapshot(session: Session, trigger_type: str, note: str | None = None) -> SnapshotEvent:
        family = get_default_family(session)
        payload = _build_snapshot_payload(session)
        payload["note"] = note

        row = SnapshotEvent(
            family_id=family.id,
            trigger_type=trigger_type,
            snapshot_at=datetime.utcnow(),
            payload_json=json.dumps(payload, ensure_ascii=False),
        )
        session.add(row)
        session.flush()
        return row

    @staticmethod
    def create_daily_snapshot(
        session: Session,
        snapshot_date: date | None = None,
    ) -> SnapshotDaily:
        family = get_default_family(session)
        snapshot_date = snapshot_date or business_today(session)
        payload = _build_snapshot_payload(session)

        row = session.scalar(
            select(SnapshotDaily).where(
                and_(
                    SnapshotDaily.family_id == family.id,
                    SnapshotDaily.snapshot_date == snapshot_date,
                )
            )
        )
        if row is None:
            row = SnapshotDaily(
                family_id=family.id,
                snapshot_date=snapshot_date,
                payload_json=json.dumps(payload, ensure_ascii=False),
            )
            session.add(row)
        else:
            row.payload_json = json.dumps(payload, ensure_ascii=False)

        session.flush()
        return row

    @staticmethod
    def list_event_snapshots(session: Session, limit: int = 100) -> list[dict]:
        rows = list(
            session.scalars(
                select(SnapshotEvent)
                .order_by(SnapshotEvent.snapshot_at.desc())
                .limit(max(1, min(limit, 500)))
            )
        )
        return [
            {
                "id": row.id,
                "family_id": row.family_id,
                "trigger_type": row.trigger_type,
                "snapshot_at": row.snapshot_at.isoformat(),
                "payload": json.loads(row.payload_json),
            }
            for row in rows
        ]

    @staticmethod
    def list_daily_snapshots(session: Session, limit: int = 365) -> list[dict]:
        rows = list(
            session.scalars(
                select(SnapshotDaily)
                .order_by(SnapshotDaily.snapshot_date.desc())
                .limit(max(1, min(limit, 1000)))
            )
        )
        return [
            {
                "id": row.id,
                "family_id": row.family_id,
                "snapshot_date": row.snapshot_date.isoformat(),
                "payload": json.loads(row.payload_json),
            }
            for row in rows
        ]


def _build_snapshot_payload(session: Session) -> dict:
    holdings = list(
        session.scalars(
            select(HoldingItem).where(HoldingItem.is_deleted.is_(False)).order_by(HoldingItem.id.asc())
        )
    )

    category_cache: dict[int, Category] = {}
    def category_name(cid: int) -> str:
        if cid not in category_cache:
            category_cache[cid] = session.get(Category, cid)
        c = category_cache[cid]
        return c.name if c else "未知"

    total_asset = Decimal("0")
    total_liability = Decimal("0")
    items: list[dict] = []

    for h in holdings:
        amount_base = Decimal(h.amount_base)
        if h.type == "asset":
            total_asset += amount_base
        else:
            total_liability += amount_base

        items.append(
            {
                "id": h.id,
                "name": h.name,
                "type": h.type,
                "member_id": h.member_id,
                "currency": h.currency,
                "amount_original": decimal_to_float(Decimal(h.amount_original)),
                "amount_base": decimal_to_float(amount_base),
                "target_ratio": decimal_to_float(Decimal(h.target_ratio)) if h.target_ratio is not None else None,
                "category_l1": category_name(h.category_l1_id),
                "category_l2": category_name(h.category_l2_id),
                "category_l3": category_name(h.category_l3_id),
            }
        )

    net_asset = total_asset - total_liability

    return {
        "totals": {
            "total_asset": decimal_to_float(total_asset),
            "total_liability": decimal_to_float(total_liability),
            "net_asset": decimal_to_float(net_asset),
        },
        "holdings": items,
    }
