import json
from datetime import UTC
from datetime import date
from decimal import Decimal

from sqlalchemy import and_
from sqlalchemy import select
from sqlalchemy import desc
from sqlalchemy.orm import Session
from sqlalchemy.orm import undefer

from app.models.category import Category
from app.models.daily_total import DailyTotal
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

        # 双写 daily_totals（slim 副本，给 totals-only 端点用）
        _upsert_daily_total(session, family.id, snapshot_date, payload.get("totals") or {})

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
        """每日快照元数据列表（payload_json deferred 不加载）。

        历史上返回 `payload` 反序列化完整 holdings 数组，但 grep 全仓库前端 /
        脚本均无消费方使用该字段，每次返几 MB 是纯浪费。改为只回 id /
        family_id / snapshot_date 三个 metadata 字段；需要单天完整 payload
        请用 `get_daily_snapshot(snapshot_date)`，需要 totals slim 列表请用
        `list_daily_summaries`（直接读 daily_totals 表）。
        """
        family = get_default_family(session)
        rows = list(
            session.execute(
                select(
                    SnapshotDaily.id,
                    SnapshotDaily.family_id,
                    SnapshotDaily.snapshot_date,
                )
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
            }
            for row in rows
        ]

    @staticmethod
    def get_daily_snapshot(session: Session, snapshot_date: date) -> dict | None:
        """按日期取单天 daily snapshot 完整 payload（显式 undefer payload_json）。"""
        family = get_default_family(session)
        row = session.scalar(
            select(SnapshotDaily)
            .options(undefer(SnapshotDaily.payload_json))
            .where(
                and_(
                    SnapshotDaily.family_id == family.id,
                    SnapshotDaily.snapshot_date == snapshot_date,
                )
            )
        )
        if row is None:
            return None
        return {
            "id": row.id,
            "family_id": row.family_id,
            "snapshot_date": row.snapshot_date.isoformat(),
            "payload": parse_snapshot_payload(row.payload_json),
        }

    @staticmethod
    def list_event_summaries(session: Session, limit: int = 100) -> list[dict]:
        """metadata-only 列表：不反序列化 payload_json，只返关键摘要字段。

        给「快速看历史索引、按需点详情」类 UI 用，避免一次返几 MB 数据。
        详情用 `get_event_snapshot(id)`（待加）按需取。
        """
        family = get_default_family(session)
        rows = list(
            session.execute(
                select(
                    SnapshotEvent.id,
                    SnapshotEvent.family_id,
                    SnapshotEvent.trigger_type,
                    SnapshotEvent.snapshot_at,
                )
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
            }
            for row in rows
        ]

    @staticmethod
    def list_daily_summaries(session: Session, limit: int = 365) -> list[dict]:
        """metadata-only 列表：直接读 daily_totals slim 副本，避免反序列化 N 天 payload。"""
        from app.models.daily_total import DailyTotal

        family = get_default_family(session)
        rows = list(
            session.execute(
                select(
                    DailyTotal.snapshot_date,
                    DailyTotal.total_asset,
                    DailyTotal.total_liability,
                    DailyTotal.net_asset,
                )
                .where(DailyTotal.family_id == family.id)
                .order_by(DailyTotal.snapshot_date.desc())
                .limit(max(1, min(limit, 1000)))
            )
        )
        return [
            {
                "snapshot_date": row.snapshot_date.isoformat(),
                "total_asset": float(row.total_asset),
                "total_liability": float(row.total_liability),
                "net_asset": float(row.net_asset),
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
        # analytics 端点（sankey / rebalance / currency-overview）拿到 row 后立刻访问
        # payload_json，model 默认 deferred 后这里必须 undefer 一并取回，
        # 否则每次访问会触发一次额外 SELECT。
        stmt = (
            select(SnapshotDaily)
            .options(undefer(SnapshotDaily.payload_json))
            .where(SnapshotDaily.family_id == family.id)
        )
        if start_date is not None:
            stmt = stmt.where(SnapshotDaily.snapshot_date >= start_date)
        if end_date is not None:
            stmt = stmt.where(SnapshotDaily.snapshot_date <= end_date)
        stmt = stmt.order_by(desc(SnapshotDaily.snapshot_date)).limit(1)
        return session.scalar(stmt)

    @staticmethod
    def revalue_all_snapshots(
        session: Session,
        base_currency: str,
        *,
        allow_rate_refresh: bool = True,
    ) -> None:
        family = get_default_family(session)
        rate_cache: dict[tuple[date, str], Decimal] = {}

        daily_rows = list(
            session.scalars(
                select(SnapshotDaily)
                .options(undefer(SnapshotDaily.payload_json))
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
                    allow_rate_refresh=allow_rate_refresh,
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
                    allow_rate_refresh=allow_rate_refresh,
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

    # 一次性 IN(...) 预取所有用到的 category，替代之前每条 holding 3 次 session.get(Category)
    # 的 N+1。40 条 holding 把 120 次单查压成 1 次范围查询。
    needed_cids: set[int] = set()
    for h in holdings:
        needed_cids.add(h.category_l1_id)
        needed_cids.add(h.category_l2_id)
        needed_cids.add(h.category_l3_id)
    category_name_by_id: dict[int, str] = {}
    if needed_cids:
        rows = session.scalars(
            select(Category).where(Category.id.in_(needed_cids))
        )
        for row in rows:
            category_name_by_id[row.id] = row.name

    def category_name(cid: int) -> str:
        return category_name_by_id.get(cid, "未知")

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
    *,
    allow_rate_refresh: bool,
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
                rate_cache[cache_key], _ = FXService.resolve_rate_for_pair(
                    session,
                    quote_currency=currency,
                    base_currency=base_currency,
                    as_of=as_of,
                    allow_refresh=allow_rate_refresh,
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


def _upsert_daily_total(
    session: Session,
    family_id: int,
    snapshot_date: date,
    totals: dict,
) -> None:
    """daily_totals 表的 upsert（snapshot 双写副本）。

    snapshot_daily.payload_json 仍是 holding 粒度真理源；这张表只是为
    totals-only 端点（如轻量净资产趋势）省去反序列化的副本。
    """
    row = session.scalar(
        select(DailyTotal).where(
            and_(
                DailyTotal.family_id == family_id,
                DailyTotal.snapshot_date == snapshot_date,
            )
        )
    )
    total_asset = Decimal(str(totals.get("total_asset", 0) or 0))
    total_liability = Decimal(str(totals.get("total_liability", 0) or 0))
    net_asset = Decimal(str(totals.get("net_asset", 0) or 0))
    if row is None:
        session.add(
            DailyTotal(
                family_id=family_id,
                snapshot_date=snapshot_date,
                total_asset=total_asset,
                total_liability=total_liability,
                net_asset=net_asset,
            )
        )
    else:
        row.total_asset = total_asset
        row.total_liability = total_liability
        row.net_asset = net_asset
