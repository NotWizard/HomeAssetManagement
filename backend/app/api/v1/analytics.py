from datetime import date

from fastapi import APIRouter
from fastapi import Depends
from fastapi import Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.correlation import compute_correlation
from app.analytics.currency_overview import build_currency_overview
from app.analytics.rebalance import compute_rebalance_items
from app.analytics.sankey_builder import build_sankey
from app.analytics.series_builder import build_daily_series
from app.analytics.volatility import compute_volatility
from app.core.database import get_db
from app.core.exceptions import AppError
from app.core.response import ok
from app.core.timezone import business_today
from app.models.member import Member
from app.services.common import get_default_family
from app.services.settings_service import SettingsService
from app.services.snapshot_service import parse_snapshot_payload
from app.services.snapshot_service import SnapshotService

router = APIRouter()


def _load_series(
    db: Session,
    window: int,
    start_date: date | None,
    end_date: date | None,
) -> dict:
    if start_date is not None and end_date is not None and start_date > end_date:
        raise AppError(4002, "开始日期不能晚于结束日期")
    return build_daily_series(db, window=window, start_date=start_date, end_date=end_date)


def _load_latest_snapshot(
    db: Session,
    start_date: date | None,
    end_date: date | None,
):
    if start_date is not None and end_date is not None and start_date > end_date:
        raise AppError(4002, "开始日期不能晚于结束日期")
    return SnapshotService.get_latest_daily_snapshot(db, start_date=start_date, end_date=end_date)


@router.get("/date-bounds")
def get_date_bounds(db: Session = Depends(get_db)):
    today = business_today(db)
    earliest = SnapshotService.get_earliest_holding_business_date(db) or SnapshotService.get_earliest_daily_snapshot_date(db)
    return ok(
        {
            "start_date": (earliest or today).isoformat(),
            "end_date": today.isoformat(),
        }
    )


@router.get("/trend")
def get_trend(
    window: int = Query(default=90, ge=1, le=3650),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return ok(_load_series(db, window, start_date, end_date))


@router.get("/volatility")
def get_volatility(
    window: int = Query(default=90, ge=2, le=3650),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    series = _load_series(db, window, start_date, end_date)
    return ok(compute_volatility(series["asset_series"]))


@router.get("/correlation")
def get_correlation(
    window: int = Query(default=90, ge=2, le=3650),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    series = _load_series(db, window, start_date, end_date)
    return ok(compute_correlation(series["asset_series"]))


@router.get("/sankey")
def get_sankey(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    latest = _load_latest_snapshot(db, start_date, end_date)
    if latest is None:
        return ok({"nodes": [], "links": []})
    payload = parse_snapshot_payload(latest.payload_json)
    member_ids = {item.get("member_id") for item in payload.get("holdings", []) if item.get("member_id") is not None}
    # 一次 IN(...) batch 查名 + 校验 family scope，替代原 N 次 get_scoped_member
    # （每个成员都跑 get_default_family + 单条 SELECT）。
    family = get_default_family(db)
    name_map: dict[int, str] = {}
    if member_ids:
        rows = db.scalars(
            select(Member).where(
                Member.id.in_(member_ids),
                Member.family_id == family.id,
            )
        )
        for row in rows:
            name_map[row.id] = row.name
    return ok(build_sankey(payload.get("holdings", []), name_map))


@router.get("/rebalance")
def get_rebalance(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    latest = _load_latest_snapshot(db, start_date, end_date)
    if latest is None:
        return ok(compute_rebalance_items([], threshold_pct=0))
    payload = parse_snapshot_payload(latest.payload_json)
    settings = SettingsService.get_settings(db)
    data = compute_rebalance_items(
        payload.get("holdings", []),
        threshold_pct=settings.rebalance_threshold_pct,
    )
    member_ids = {
        row.get("member_id")
        for row in [*data["allocations"], *data["items"]]
        if row.get("member_id") is not None
    }
    member_name_by_id: dict[int, str] = {}
    if member_ids:
        family = get_default_family(db)
        members = db.scalars(
            select(Member).where(
                Member.id.in_(member_ids),
                Member.family_id == family.id,
            )
        )
        member_name_by_id = {member.id: member.name for member in members}
    for row in [*data["allocations"], *data["items"]]:
        member_id = row.get("member_id")
        row["member_name"] = (
            member_name_by_id.get(member_id, f"成员 {member_id}")
            if member_id is not None
            else "家庭"
        )
    return ok(data)


@router.get("/currency-overview")
def get_currency_overview(db: Session = Depends(get_db)):
    # 跟 sankey / rebalance 一致，读最新 daily snapshot 现成 payload，
    # 避免 build_current_payload 每次重新跑「全表 SELECT + N+1 categories
    # + JSON 重建」；新数据由 holdings 写路径触发 _refresh_snapshots 落到
    # 最新 snapshot，时延上是「数据已落到 snapshot」与「请求触发重建」
    # 两条等价路径，前者直接读现成结果。
    latest = SnapshotService.get_latest_daily_snapshot(db)
    if latest is None:
        return ok({"currencies": [], "details": {}})
    payload = parse_snapshot_payload(latest.payload_json)
    if not payload.get("holdings"):
        return ok({"currencies": [], "details": {}})
    return ok(build_currency_overview(payload.get("holdings", [])))
