from datetime import date

from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm import undefer

from app.core.clock import format_utc_iso_z
from app.models.daily_total import DailyTotal
from app.models.snapshot_daily import SnapshotDaily
from app.services.common import get_default_family
from app.services.snapshot_service import parse_snapshot_payload


# Process-level 结果缓存。键：(family_id, window, start_date_iso, end_date_iso)；
# 值：(version, result)。版本指纹直接绑 daily_totals 表（snapshot_service 写
# snapshot_daily 时双写 daily_totals）：任一新 snapshot 写入或 totals 重算都
# 体现在 (MAX(snapshot_date), COUNT, MAX(generated_at)) 三元组中。
# 原指纹绑 holdings.updated_at 实际是"间接信号"——还要额外 SELECT holdings 表，
# 现在 fingerprint 与读取的真实源 (snapshot_daily) 站在同一张派生表上，
# 省去 holdings SELECT 且语义更精准。
# trend / volatility / correlation 同一会话内重复打开分析页几乎 100% 命中。
_cache: dict[tuple, tuple[tuple, dict]] = {}
_CACHE_MAX_ENTRIES = 32


def _compute_series_version(session: Session, family_id: int) -> tuple:
    row = session.execute(
        select(
            func.max(DailyTotal.snapshot_date),
            func.count(DailyTotal.id),
            func.max(DailyTotal.generated_at),
        ).where(DailyTotal.family_id == family_id)
    ).one()
    return (
        str(row[0]) if row[0] is not None else "",
        int(row[1] or 0),
        str(row[2]) if row[2] is not None else "",
    )


def clear_daily_series_cache() -> None:
    """测试用：清空 process-level cache 防跨用例污染。"""
    _cache.clear()


def build_daily_series(
    session: Session,
    window: int = 90,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    family = get_default_family(session)
    cache_key = (
        family.id,
        window,
        start_date.isoformat() if start_date is not None else None,
        end_date.isoformat() if end_date is not None else None,
    )
    version = _compute_series_version(session, family.id)
    cached = _cache.get(cache_key)
    if cached is not None and cached[0] == version:
        return cached[1]

    result = _build_daily_series_uncached(session, family.id, window, start_date, end_date)
    _cache[cache_key] = (version, result)
    # LRU 淘汰：dict 保 insertion order，超 max 时弹最早 entry
    while len(_cache) > _CACHE_MAX_ENTRIES:
        oldest_key = next(iter(_cache))
        del _cache[oldest_key]
    return result


def _build_daily_series_uncached(
    session: Session,
    family_id: int,
    window: int,
    start_date: date | None,
    end_date: date | None,
) -> dict:
    stmt = (
        select(SnapshotDaily)
        .options(undefer(SnapshotDaily.payload_json))
        .where(SnapshotDaily.family_id == family_id)
    )
    if start_date is not None:
        stmt = stmt.where(SnapshotDaily.snapshot_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(SnapshotDaily.snapshot_date <= end_date)
    stmt = stmt.order_by(SnapshotDaily.snapshot_date.desc())
    if start_date is None and end_date is None:
        stmt = stmt.limit(max(1, window))

    rows = list(session.scalars(stmt))
    rows.reverse()

    dates: list[str] = []
    total_asset: list[float] = []
    total_liability: list[float] = []
    net_asset: list[float] = []
    per_asset: dict[str, list[float | None]] = {}

    for index, row in enumerate(rows):
        payload = parse_snapshot_payload(row.payload_json)
        dates.append(row.snapshot_date.isoformat())
        totals = payload.get("totals", {})
        total_asset.append(float(totals.get("total_asset", 0.0)))
        total_liability.append(float(totals.get("total_liability", 0.0)))
        net_asset.append(float(totals.get("net_asset", 0.0)))

        seen_assets: set[str] = set()
        day_asset_totals: dict[str, float] = {}
        for item in payload.get("holdings", []):
            if item.get("type") != "asset":
                continue
            name = item.get("name") or f"asset_{item.get('id')}"
            seen_assets.add(name)
            day_asset_totals[name] = day_asset_totals.get(name, 0.0) + float(item.get("amount_base", 0.0))

        for name, amount_base in day_asset_totals.items():
            per_asset.setdefault(name, [None] * index)
            per_asset[name].append(amount_base)

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
