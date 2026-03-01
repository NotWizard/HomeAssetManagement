from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean
from sqlalchemy import CheckConstraint
from sqlalchemy import DateTime
from sqlalchemy import ForeignKey
from sqlalchemy import Numeric
from sqlalchemy import String
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy.orm import relationship

from app.core.database import Base


class HoldingItem(Base):
    __tablename__ = "holding_item"
    __table_args__ = (
        CheckConstraint("type in ('asset','liability')", name="ck_holding_type"),
        CheckConstraint("source in ('manual','csv')", name="ck_holding_source"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("family.id"), index=True, nullable=False)
    member_id: Mapped[int] = mapped_column(ForeignKey("member.id"), index=True, nullable=False)
    type: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    category_l1_id: Mapped[int] = mapped_column(ForeignKey("category.id"), nullable=False)
    category_l2_id: Mapped[int] = mapped_column(ForeignKey("category.id"), nullable=False)
    category_l3_id: Mapped[int] = mapped_column(ForeignKey("category.id"), nullable=False)

    currency: Mapped[str] = mapped_column(String(10), nullable=False)
    amount_original: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    amount_base: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    target_ratio: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)

    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True
    )

    member = relationship("Member", back_populates="holdings")
