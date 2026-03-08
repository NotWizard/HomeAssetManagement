from fastapi import APIRouter
from fastapi import Depends
from fastapi import Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import ok
from app.schemas.holding import HoldingBulkDelete
from app.schemas.holding import HoldingCreate
from app.schemas.holding import HoldingUpdate
from app.services.holding_service import HoldingService
from app.utils.serialization import decimal_to_float

router = APIRouter()


def _serialize(row) -> dict:
    return {
        "id": row.id,
        "family_id": row.family_id,
        "member_id": row.member_id,
        "type": row.type,
        "name": row.name,
        "category_l1_id": row.category_l1_id,
        "category_l2_id": row.category_l2_id,
        "category_l3_id": row.category_l3_id,
        "currency": row.currency,
        "amount_original": decimal_to_float(row.amount_original),
        "amount_base": decimal_to_float(row.amount_base),
        "target_ratio": decimal_to_float(row.target_ratio),
        "source": row.source,
        "updated_at": row.updated_at.isoformat(),
    }


@router.get("")
def list_holdings(
    member_id: int | None = Query(default=None),
    type: str | None = Query(default=None, pattern="^(asset|liability)$"),
    keyword: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    rows = HoldingService.list_holdings(db, member_id=member_id, holding_type=type, keyword=keyword)
    return ok([_serialize(row) for row in rows])


@router.post("/bulk-delete")
def bulk_delete_holdings(payload: HoldingBulkDelete, db: Session = Depends(get_db)):
    result = HoldingService.bulk_soft_delete(db, payload.model_dump())
    db.commit()
    return ok(result)


@router.post("")
def create_holding(payload: HoldingCreate, db: Session = Depends(get_db)):
    row = HoldingService.create_holding(db, payload.model_dump())
    db.commit()
    db.refresh(row)
    return ok(_serialize(row))


@router.put("/{holding_id}")
def update_holding(holding_id: int, payload: HoldingUpdate, db: Session = Depends(get_db)):
    row = HoldingService.update_holding(db, holding_id, payload.model_dump())
    db.commit()
    db.refresh(row)
    return ok(_serialize(row))


@router.delete("/{holding_id}")
def delete_holding(holding_id: int, db: Session = Depends(get_db)):
    HoldingService.soft_delete_holding(db, holding_id)
    db.commit()
    return ok(True)
