from fastapi import APIRouter
from fastapi import Depends
from fastapi import Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import ok
from app.services.snapshot_service import SnapshotService

router = APIRouter()


@router.get("/events")
def list_event_snapshots(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return ok(SnapshotService.list_event_snapshots(db, limit))


@router.get("/daily")
def list_daily_snapshots(
    limit: int = Query(default=365, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    return ok(SnapshotService.list_daily_snapshots(db, limit))
