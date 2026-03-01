from datetime import date
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Date
from sqlalchemy import DateTime
from sqlalchemy import Numeric
from sqlalchemy import String
from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column

from app.core.database import Base


class FxRateDaily(Base):
    __tablename__ = "fx_rate_daily"
    __table_args__ = (
        UniqueConstraint(
            "rate_date", "base_currency", "quote_currency", name="uq_fx_rate_daily"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    rate_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    base_currency: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    quote_currency: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    rate: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    is_estimated: Mapped[bool] = mapped_column(default=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
