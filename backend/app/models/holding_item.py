from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean
from sqlalchemy import CheckConstraint
from sqlalchemy import DateTime
from sqlalchemy import ForeignKey
from sqlalchemy import Index
from sqlalchemy import Numeric
from sqlalchemy import String
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.core.clock import utc_now_naive


class HoldingItem(Base):
    __tablename__ = "holding_item"
    __table_args__ = (
        CheckConstraint("type in ('asset','liability')", name="ck_holding_type"),
        CheckConstraint("source in ('manual','csv')", name="ck_holding_source"),
        # 复合索引匹配热路径 SELECT：list_holdings (family+is_deleted ORDER BY
        # updated_at) 与 per-member filter (family+member+is_deleted)。
        # 原 baseline 的 ix_holding_item_is_deleted / ix_holding_item_type
        # selectivity 太低，query planner 用不上；在 20260526_000001 migration
        # 一并删除。
        Index(
            "ix_holding_item_family_deleted_updated",
            "family_id",
            "is_deleted",
            "updated_at",
        ),
        Index(
            "ix_holding_item_family_member_deleted",
            "family_id",
            "member_id",
            "is_deleted",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("family.id"), index=True, nullable=False)
    member_id: Mapped[int] = mapped_column(ForeignKey("member.id"), index=True, nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    category_l1_id: Mapped[int] = mapped_column(ForeignKey("category.id"), nullable=False)
    category_l2_id: Mapped[int] = mapped_column(ForeignKey("category.id"), nullable=False)
    category_l3_id: Mapped[int] = mapped_column(ForeignKey("category.id"), nullable=False)

    currency: Mapped[str] = mapped_column(String(10), nullable=False)
    amount_original: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    amount_base: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    target_ratio: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)

    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now_naive)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now_naive, onupdate=utc_now_naive, index=True
    )

    member = relationship("Member", back_populates="holdings")
