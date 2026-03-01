from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import ok
from app.schemas.settings import SettingsUpdate
from app.services.settings_service import SettingsService

router = APIRouter()


@router.get("")
def get_settings(db: Session = Depends(get_db)):
    settings = SettingsService.get_settings(db)
    return ok(
        {
            "base_currency": settings.base_currency,
            "timezone": settings.timezone,
            "rebalance_threshold_pct": settings.rebalance_threshold_pct,
            "fx_provider": settings.fx_provider,
        }
    )


@router.put("")
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    settings = SettingsService.update_settings(db, **payload.model_dump())
    db.commit()
    return ok(
        {
            "base_currency": settings.base_currency,
            "timezone": settings.timezone,
            "rebalance_threshold_pct": settings.rebalance_threshold_pct,
            "fx_provider": settings.fx_provider,
        }
    )
