from datetime import date

from fastapi import APIRouter
from fastapi import Depends
from fastapi import Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import ok
from app.services.fx_service import FXService

router = APIRouter()


@router.get("/rates")
def list_rates(date_str: str | None = Query(default=None, alias="date"), db: Session = Depends(get_db)):
    on_date: date | None = None
    if date_str:
        on_date = date.fromisoformat(date_str)
    rows = FXService.list_rates(db, on_date)
    return ok(
        [
            {
                "id": row.id,
                "rate_date": row.rate_date.isoformat(),
                "base_currency": row.base_currency,
                "quote_currency": row.quote_currency,
                "rate": float(row.rate),
                "provider": row.provider,
                "is_estimated": bool(row.is_estimated),
            }
            for row in rows
        ]
    )


@router.post("/refresh")
def refresh_rates(db: Session = Depends(get_db)):
    count = FXService.refresh_rates(db)
    db.commit()
    return ok({"upserted": count})
