from datetime import date

from fastapi import APIRouter
from fastapi import Depends
from fastapi import Query
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
from app.services.common import get_scoped_member
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
    name_map = {member_id: get_scoped_member(db, int(member_id)).name for member_id in member_ids}
    return ok(build_sankey(payload.get("holdings", []), name_map))


@router.get("/rebalance")
def get_rebalance(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    latest = _load_latest_snapshot(db, start_date, end_date)
    if latest is None:
        return ok([])
    payload = parse_snapshot_payload(latest.payload_json)
    totals = payload.get("totals", {})
    net_asset = float(totals.get("net_asset", 0.0) or 0.0)
    settings = SettingsService.get_settings(db)
    data = compute_rebalance_items(
        payload.get("holdings", []),
        net_asset=net_asset,
        threshold_pct=settings.rebalance_threshold_pct,
    )
    return ok(data)


@router.get("/currency-overview")
def get_currency_overview(db: Session = Depends(get_db)):
    payload = SnapshotService.build_current_payload(db)
    if not payload.get("holdings"):
        return ok({"currencies": [], "details": {}})
    return ok(build_currency_overview(payload.get("holdings", [])))
