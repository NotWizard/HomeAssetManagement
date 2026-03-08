import json

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
from app.core.response import ok
from app.models.member import Member
from app.models.snapshot_daily import SnapshotDaily
from app.services.settings_service import SettingsService
from app.services.snapshot_service import SnapshotService

router = APIRouter()


@router.get("/trend")
def get_trend(window: int = Query(default=90, ge=1, le=3650), db: Session = Depends(get_db)):
    return ok(build_daily_series(db, window=window))


@router.get("/volatility")
def get_volatility(window: int = Query(default=90, ge=2, le=3650), db: Session = Depends(get_db)):
    series = build_daily_series(db, window=window)
    return ok(compute_volatility(series["asset_series"]))


@router.get("/correlation")
def get_correlation(window: int = Query(default=90, ge=2, le=3650), db: Session = Depends(get_db)):
    series = build_daily_series(db, window=window)
    return ok(compute_correlation(series["asset_series"]))


@router.get("/sankey")
def get_sankey(db: Session = Depends(get_db)):
    latest = db.scalar(select(SnapshotDaily).order_by(SnapshotDaily.snapshot_date.desc()).limit(1))
    if latest is None:
        return ok({"nodes": [], "links": []})
    payload = json.loads(latest.payload_json)
    members = list(db.scalars(select(Member)))
    name_map = {m.id: m.name for m in members}
    return ok(build_sankey(payload.get("holdings", []), name_map))


@router.get("/rebalance")
def get_rebalance(db: Session = Depends(get_db)):
    latest = db.scalar(select(SnapshotDaily).order_by(SnapshotDaily.snapshot_date.desc()).limit(1))
    if latest is None:
        return ok([])
    payload = json.loads(latest.payload_json)
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
