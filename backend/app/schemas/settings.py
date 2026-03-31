from pydantic import BaseModel
from pydantic import ConfigDict
from pydantic import Field


class SettingsUpdate(BaseModel):
    """可更新的系统设置字段；timezone 由服务端作为业务时区维护，不允许通过此接口修改。"""

    model_config = ConfigDict(extra="forbid")

    base_currency: str = Field(min_length=3, max_length=10, description="家庭资产负债的统一折算基准币种")
    rebalance_threshold_pct: float = Field(gt=0, lt=100, description="触发再平衡提醒的偏离阈值百分比")


class SettingsOut(BaseModel):
    base_currency: str
    timezone: str
    rebalance_threshold_pct: float
    fx_provider: str
