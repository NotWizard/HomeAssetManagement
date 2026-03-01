from datetime import datetime

from pydantic import BaseModel
from pydantic import Field


class MemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class MemberUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class MemberOut(BaseModel):
    id: int
    family_id: int
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
