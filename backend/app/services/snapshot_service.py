import json
from datetime import UTC
from datetime import date
from decimal import Decimal

from sqlalchemy import and_
from sqlalchemy import select
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.holding_item import HoldingItem
from app.models.snapshot_daily import SnapshotDaily
from app.models.snapshot_event import SnapshotEvent
from app.core.clock import utc_now_naive
from app.core.timezone import business_today
from app.core.timezone import get_business_tzinfo
from app.services.common import get_default_family
from app.services.common import get_scoped_member
from app.services.fx_service import FXService
from app.utils.fx import convert_to_base_amount
from app.utils.serialization import decimal_to_float

SNAPSHOT_PAYLOAD_SCHEMA_VERSION = 2
LEGACY_SNAPSHOT_PAYLOAD_VERSION = 1


class SnapshotService:
    @staticmethod
    def build_current_payload(session: Session) -> dict:
        family = get_default_family(session)
        return _build_snapshot_payload(session, family.id)

    @staticmethod
    def create_event_snapshot(session: Session, trigger_type: str, note: str | None = None) -> SnapshotEvent:
        family = get_default_family(session)
        payload = SnapshotService.build_current_payload(session)
        payload["note"] = note

        row = SnapshotEvent(
            family_id=family.id,
            trigger_type=trigger_type,
            snapshot_at=utc_now_naive(),
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
        payload = SnapshotService.build_current_payload(session)

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
        family = get_default_family(session)
        rows = list(
            session.scalars(
                select(SnapshotEvent)
                .where(SnapshotEvent.family_id == family.id)
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
                "payload": parse_snapshot_payload(row.payload_json),
            }
            for row in rows
        ]

    @staticmethod
    def list_daily_snapshots(session: Session, limit: int = 365) -> list[dict]:
        family = get_default_family(session)
        rows = list(
            session.scalars(
                select(SnapshotDaily)
                .where(SnapshotDaily.family_id == family.id)
                .order_by(SnapshotDaily.snapshot_date.desc())
                .limit(max(1, min(limit, 1000)))
            )
        )
        return [
            {
                "id": row.id,
                "family_id": row.family_id,
                "snapshot_date": row.snapshot_date.isoformat(),
                "payload": parse_snapshot_payload(row.payload_json),
            }
            for row in rows
        ]

    @staticmethod
    def get_earliest_daily_snapshot_date(session: Session) -> date | None:
        family = get_default_family(session)
        return session.scalar(
            select(SnapshotDaily.snapshot_date)
            .where(SnapshotDaily.family_id == family.id)
            .order_by(SnapshotDaily.snapshot_date.asc())
            .limit(1)
        )

    @staticmethod
    def get_earliest_holding_business_date(session: Session) -> date | None:
        family = get_default_family(session)
        earliest_created_at = session.scalar(
            select(HoldingItem.created_at)
            .where(HoldingItem.family_id == family.id)
            .order_by(HoldingItem.created_at.asc())
            .limit(1)
        )
        if earliest_created_at is None:
            return None

        utc_value = (
            earliest_created_at.replace(tzinfo=UTC)
            if earliest_created_at.tzinfo is None
            else earliest_created_at.astimezone(UTC)
        )
        return utc_value.astimezone(get_business_tzinfo(session)).date()

    @staticmethod
    def get_latest_daily_snapshot(
        session: Session,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> SnapshotDaily | None:
        family = get_default_family(session)
        stmt = select(SnapshotDaily).where(SnapshotDaily.family_id == family.id)
        if start_date is not None:
            stmt = stmt.where(SnapshotDaily.snapshot_date >= start_date)
        if end_date is not None:
            stmt = stmt.where(SnapshotDaily.snapshot_date <= end_date)
        stmt = stmt.order_by(desc(SnapshotDaily.snapshot_date)).limit(1)
        return session.scalar(stmt)

    @staticmethod
    def revalue_all_snapshots(session: Session, base_currency: str) -> None:
        family = get_default_family(session)
        rate_cache: dict[tuple[date, str], Decimal] = {}

        daily_rows = list(
            session.scalars(
                select(SnapshotDaily)
                .where(SnapshotDaily.family_id == family.id)
                .order_by(SnapshotDaily.snapshot_date.asc())
            )
        )
        for row in daily_rows:
            payload = parse_snapshot_payload(row.payload_json)
            row.payload_json = json.dumps(
                _revalue_snapshot_payload(
                    session,
                    payload,
                    base_currency=base_currency,
                    as_of=row.snapshot_date,
                    rate_cache=rate_cache,
                ),
                ensure_ascii=False,
            )

        event_rows = list(
            session.scalars(
                select(SnapshotEvent)
                .where(SnapshotEvent.family_id == family.id)
                .order_by(SnapshotEvent.snapshot_at.asc())
            )
        )
        for row in event_rows:
            payload = parse_snapshot_payload(row.payload_json)
            row.payload_json = json.dumps(
                _revalue_snapshot_payload(
                    session,
                    payload,
                    base_currency=base_currency,
                    as_of=row.snapshot_at.date(),
                    rate_cache=rate_cache,
                ),
                ensure_ascii=False,
            )

        session.flush()


def parse_snapshot_payload(payload_json: str) -> dict:
    payload = json.loads(payload_json)
    if not isinstance(payload, dict):
        return {
            "schema_version": LEGACY_SNAPSHOT_PAYLOAD_VERSION,
            "totals": {},
            "holdings": [],
        }

    return {
        "schema_version": int(payload.get("schema_version") or LEGACY_SNAPSHOT_PAYLOAD_VERSION),
        "totals": payload.get("totals") or {},
        "holdings": payload.get("holdings") or [],
        **{
            key: value
            for key, value in payload.items()
            if key not in {"schema_version", "totals", "holdings"}
        },
    }


def _build_snapshot_payload(session: Session, family_id: int) -> dict:
    holdings = list(
        session.scalars(
            select(HoldingItem)
            .where(HoldingItem.family_id == family_id, HoldingItem.is_deleted.is_(False))
            .order_by(HoldingItem.id.asc())
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
        "schema_version": SNAPSHOT_PAYLOAD_SCHEMA_VERSION,
        "totals": {
            "total_asset": decimal_to_float(total_asset),
            "total_liability": decimal_to_float(total_liability),
            "net_asset": decimal_to_float(net_asset),
        },
        "holdings": items,
    }


def _revalue_snapshot_payload(
    session: Session,
    payload: dict,
    base_currency: str,
    as_of: date,
    rate_cache: dict[tuple[date, str], Decimal],
) -> dict:
    holdings = payload.get("holdings", [])
    total_asset = Decimal("0")
    total_liability = Decimal("0")

    for item in holdings:
        currency = str(item.get("currency") or base_currency).upper()
        amount_original = Decimal(str(item.get("amount_original", item.get("amount_base", 0)) or 0))

        if currency == base_currency:
            amount_base = amount_original
        else:
            cache_key = (as_of, currency)
            if cache_key not in rate_cache:
                rate_cache[cache_key], _ = FXService.resolve_rate(
                    session,
                    quote_currency=currency,
                    base_currency=base_currency,
                    as_of=as_of,
                )
            amount_base = convert_to_base_amount(amount_original, rate_cache[cache_key])

        item["amount_base"] = decimal_to_float(amount_base)
        if item.get("type") == "asset":
            total_asset += amount_base
        else:
            total_liability += amount_base

    payload["schema_version"] = SNAPSHOT_PAYLOAD_SCHEMA_VERSION
    payload["totals"] = {
        "total_asset": decimal_to_float(total_asset),
        "total_liability": decimal_to_float(total_liability),
        "net_asset": decimal_to_float(total_asset - total_liability),
    }
    return payload
