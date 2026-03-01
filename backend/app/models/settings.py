from sqlalchemy import ForeignKey
from sqlalchemy import String
from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column

from app.core.database import Base


class SettingsModel(Base):
    __tablename__ = "settings"
    __table_args__ = (UniqueConstraint("family_id", name="uq_settings_family"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("family.id"), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(10), default="CNY", nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Shanghai", nullable=False)
    rebalance_threshold_pct: Mapped[float] = mapped_column(nullable=False, default=5.0)
    fx_provider: Mapped[str] = mapped_column(String(100), default="frankfurter", nullable=False)
