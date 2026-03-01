from fastapi import APIRouter
from fastapi import Depends
from fastapi import Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import AppError
from app.core.response import ok
from app.services.category_service import CategoryService

router = APIRouter()


@router.get("")
def get_categories(
    type: str = Query(..., pattern="^(asset|liability)$"),
    db: Session = Depends(get_db),
):
    if type not in ("asset", "liability"):
        raise AppError(4001, "type 必须是 asset 或 liability")
    return ok(CategoryService.get_tree(db, type))
