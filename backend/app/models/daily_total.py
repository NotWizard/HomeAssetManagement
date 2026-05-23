from datetime import date
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Date
from sqlalchemy import DateTime
from sqlalchemy import ForeignKey
from sqlalchemy import Numeric
from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column

from app.core.database import Base
from app.core.clock import utc_now_naive


class DailyTotal(Base):
    """每天的汇总快照（slim 副本）。

    与 `snapshot_daily` 共存：
      - `snapshot_daily.payload_json` 仍是 holding 粒度的真理源
        （sankey / rebalance / currency-overview 反序列化全靠它）
      - `daily_totals` 只存 (total_asset, total_liability, net_asset)，
        让 trend / 净资产单线图等 totals-only 端点可以读这张表，省去
        反序列化 N 天 payload 的成本（cold path，cache miss 场景）

    写入路径：`SnapshotService.create_daily_snapshot` 在 upsert
    snapshot_daily 的同时双写这张表。
    """

    __tablename__ = "daily_totals"
    __table_args__ = (UniqueConstraint("family_id", "snapshot_date", name="uq_daily_totals"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("family.id"), nullable=False, index=True)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_asset: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False, default=Decimal("0"))
    total_liability: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False, default=Decimal("0"))
    net_asset: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False, default=Decimal("0"))
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now_naive)
