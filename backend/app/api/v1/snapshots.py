from fastapi import APIRouter
from fastapi import Depends
from fastapi import Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import ok
from app.services.snapshot_service import SnapshotService

router = APIRouter()


# /events 重端点已退役：无任何前端/脚本消费方，每次响应要反序列化最多 500 条
# 完整 payload（数 MB）。事件列表请用 /events/summary（metadata-only）。


@router.get("/daily")
def list_daily_snapshots(
    limit: int = Query(default=365, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    return ok(SnapshotService.list_daily_snapshots(db, limit))


@router.get("/events/summary")
def list_event_summaries(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """metadata-only 事件快照列表，避免一次返几 MB 的 payload。"""
    return ok(SnapshotService.list_event_summaries(db, limit))


@router.get("/daily/summary")
def list_daily_summaries(
    limit: int = Query(default=365, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """metadata-only 每日快照列表，直接读 daily_totals slim 副本。"""
    return ok(SnapshotService.list_daily_summaries(db, limit))
