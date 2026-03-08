from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel
from pydantic import Field


class HoldingBase(BaseModel):
    member_id: int
    type: str = Field(pattern="^(asset|liability)$")
    name: str = Field(min_length=1, max_length=200)
    category_l1_id: int
    category_l2_id: int
    category_l3_id: int
    currency: str = Field(min_length=3, max_length=10)
    amount_original: Decimal = Field(gt=0)
    target_ratio: Decimal | None = None


class HoldingCreate(HoldingBase):
    pass


class HoldingUpdate(HoldingBase):
    pass


class HoldingBulkDelete(BaseModel):
    mode: Literal["ids", "member"]
    holding_ids: list[int] | None = None
    member_id: int | None = None


class HoldingBulkDeleteResult(BaseModel):
    deleted_count: int
    deleted_ids: list[int]
    member_id: int | None = None
    snapshot_refreshed: bool = True


class HoldingOut(BaseModel):
    id: int
    family_id: int
    member_id: int
    type: str
    name: str
    category_l1_id: int
    category_l2_id: int
    category_l3_id: int
    currency: str
    amount_original: Decimal
    amount_base: Decimal
    target_ratio: Decimal | None
    source: str
    updated_at: datetime

    model_config = {"from_attributes": True}
