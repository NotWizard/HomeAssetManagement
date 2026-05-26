from datetime import date
from datetime import datetime

from sqlalchemy import Date
from sqlalchemy import DateTime
from sqlalchemy import ForeignKey
from sqlalchemy import Text
from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column

from app.core.database import Base
from app.core.clock import utc_now_naive


class SnapshotDaily(Base):
    __tablename__ = "snapshot_daily"
    __table_args__ = (UniqueConstraint("family_id", "snapshot_date", name="uq_snapshot_daily"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("family.id"), nullable=False, index=True)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # payload_json 默认 deferred：list_daily_snapshots / list_event_summaries 等元数据端点
    # 不再附带数 MB 的反序列化负担。需要 payload 的路径（get_daily_snapshot / build_daily_series /
    # revalue_all_snapshots / migration export / get_latest_daily_snapshot）显式 .options(undefer(...))。
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, deferred=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now_naive)
