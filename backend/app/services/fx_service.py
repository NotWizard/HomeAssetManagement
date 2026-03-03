from datetime import date
from datetime import datetime
from decimal import Decimal

import httpx
from sqlalchemy import and_
from sqlalchemy import desc
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.timezone import business_today
from app.models.fx_rate_daily import FxRateDaily
from app.services.settings_service import SettingsService

logger = get_logger(__name__)


class FXService:
    @staticmethod
    def refresh_rates(
        session: Session,
        rate_date: date | None = None,
        base_currency: str | None = None,
    ) -> int:
        if rate_date is None:
            rate_date = business_today(session)

        settings = SettingsService.get_settings(session)
        base = (base_currency or settings.base_currency).upper()

        providers = [
            ("frankfurter", _fetch_frankfurter),
            ("exchangerate_host", _fetch_exchangerate_host),
        ]

        latest_rates: dict[str, Decimal] | None = None
        provider_name = ""
        for name, fn in providers:
            try:
                latest_rates = fn(rate_date, base)
                provider_name = name
                break
            except Exception as exc:  # noqa: BLE001
                logger.warning("fx provider %s failed: %s", name, exc)

        if latest_rates is None:
            return 0

        upserts = 0
        for quote, rate in latest_rates.items():
            existing = session.scalar(
                select(FxRateDaily).where(
                    and_(
                        FxRateDaily.rate_date == rate_date,
                        FxRateDaily.base_currency == base,
                        FxRateDaily.quote_currency == quote,
                    )
                )
            )
            if existing is None:
                existing = FxRateDaily(
                    rate_date=rate_date,
                    base_currency=base,
                    quote_currency=quote,
                    rate=rate,
                    provider=provider_name,
                    is_estimated=False,
                    fetched_at=datetime.utcnow(),
                )
                session.add(existing)
            else:
                existing.rate = rate
                existing.provider = provider_name
                existing.is_estimated = False
                existing.fetched_at = datetime.utcnow()
            upserts += 1

        # ensure base currency itself exists
        base_row = session.scalar(
            select(FxRateDaily).where(
                and_(
                    FxRateDaily.rate_date == rate_date,
                    FxRateDaily.base_currency == base,
                    FxRateDaily.quote_currency == base,
                )
            )
        )
        if base_row is None:
            session.add(
                FxRateDaily(
                    rate_date=rate_date,
                    base_currency=base,
                    quote_currency=base,
                    rate=Decimal("1"),
                    provider=provider_name,
                    is_estimated=False,
                    fetched_at=datetime.utcnow(),
                )
            )
            upserts += 1

        session.flush()
        return upserts

    @staticmethod
    def resolve_rate(
        session: Session,
        quote_currency: str,
        base_currency: str | None = None,
        as_of: date | None = None,
    ) -> tuple[Decimal, bool]:
        settings = SettingsService.get_settings(session)
        base = (base_currency or settings.base_currency).upper()
        quote = quote_currency.upper()
        as_of_date = as_of or business_today(session)

        if quote == base:
            return Decimal("1"), False

        exact = session.scalar(
            select(FxRateDaily).where(
                and_(
                    FxRateDaily.rate_date == as_of_date,
                    FxRateDaily.base_currency == base,
                    FxRateDaily.quote_currency == quote,
                )
            )
        )
        if exact:
            return Decimal(exact.rate), exact.is_estimated

        # Try to pull fresh rates for the date.
        FXService.refresh_rates(session, as_of_date, base)

        exact = session.scalar(
            select(FxRateDaily).where(
                and_(
                    FxRateDaily.rate_date == as_of_date,
                    FxRateDaily.base_currency == base,
                    FxRateDaily.quote_currency == quote,
                )
            )
        )
        if exact:
            return Decimal(exact.rate), exact.is_estimated

        fallback = session.scalar(
            select(FxRateDaily)
            .where(
                and_(
                    FxRateDaily.rate_date <= as_of_date,
                    FxRateDaily.base_currency == base,
                    FxRateDaily.quote_currency == quote,
                )
            )
            .order_by(desc(FxRateDaily.rate_date))
            .limit(1)
        )
        if fallback:
            return Decimal(fallback.rate), True

        raise ValueError(f"无法获取汇率: {base}->{quote} ({as_of_date})")

    @staticmethod
    def list_rates(session: Session, on_date: date | None = None) -> list[FxRateDaily]:
        target_date = on_date or business_today(session)
        settings = SettingsService.get_settings(session)
        base = settings.base_currency.upper()
        rows = list(
            session.scalars(
                select(FxRateDaily)
                .where(
                    and_(
                        FxRateDaily.rate_date == target_date,
                        FxRateDaily.base_currency == base,
                    )
                )
                .order_by(FxRateDaily.quote_currency.asc())
            )
        )
        if rows:
            return rows
        return list(
            session.scalars(
                select(FxRateDaily)
                .where(FxRateDaily.base_currency == base)
                .order_by(desc(FxRateDaily.rate_date), FxRateDaily.quote_currency.asc())
            )
        )


def _fetch_frankfurter(rate_date: date, base: str) -> dict[str, Decimal]:
    settings = get_settings()
    url = f"{settings.fx_primary_url}/{rate_date.isoformat()}"
    response = httpx.get(url, params={"from": base}, timeout=10.0)
    response.raise_for_status()
    data = response.json()
    rates = data.get("rates", {})
    if not isinstance(rates, dict) or not rates:
        raise ValueError("frankfurter rates is empty")
    parsed = {k.upper(): Decimal(str(v)) for k, v in rates.items()}
    parsed[base] = Decimal("1")
    return parsed


def _fetch_exchangerate_host(rate_date: date, base: str) -> dict[str, Decimal]:
    settings = get_settings()
    url = f"{settings.fx_fallback_url}/{rate_date.isoformat()}"
    response = httpx.get(url, params={"base": base}, timeout=10.0)
    response.raise_for_status()
    data = response.json()
    rates = data.get("rates", {})
    if not isinstance(rates, dict) or not rates:
        raise ValueError("exchangerate.host rates is empty")
    parsed = {k.upper(): Decimal(str(v)) for k, v in rates.items()}
    parsed[base] = Decimal("1")
    return parsed
