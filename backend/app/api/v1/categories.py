from fastapi import APIRouter
from fastapi import Depends
from fastapi import Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import ok
from app.services.category_service import CategoryService

router = APIRouter()


@router.get("")
def get_categories(
    type: str = Query(..., pattern="^(asset|liability)$"),
    db: Session = Depends(get_db),
):
    # Query 的 pattern 已经收口非法值，下面的二次校验是死代码 → 删除
    return ok(CategoryService.get_tree(db, type))
