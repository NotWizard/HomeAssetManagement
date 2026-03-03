from pydantic import BaseModel
from pydantic import ConfigDict
from pydantic import Field


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_currency: str = Field(min_length=3, max_length=10)
    timezone: str = Field(min_length=1, max_length=50)
    rebalance_threshold_pct: float = Field(gt=0, lt=100)


class SettingsOut(BaseModel):
    base_currency: str
    timezone: str
    rebalance_threshold_pct: float
    fx_provider: str
