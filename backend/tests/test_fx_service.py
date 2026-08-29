from datetime import date
from decimal import Decimal

import pytest

from sqlalchemy import select

from app.core.config import Settings
from app.core.database import SessionLocal
from app.core.exceptions import AppError
from app.models.fx_rate_daily import FxRateDaily
from app.services.fx_service import FXService


def test_default_fx_urls_use_chinamoney_primary_and_frankfurter_fallback(monkeypatch):
    monkeypatch.delenv("HBS_FX_PRIMARY_URL", raising=False)
    monkeypatch.delenv("HBS_FX_FALLBACK_URL", raising=False)

    settings = Settings(_env_file=None)

    assert settings.fx_primary_url == (
        "https://www.chinamoney.com.cn/ags/ms/cm-u-bk-ccpr/CcprHisNew"
    )
    assert settings.fx_fallback_url == "https://api.frankfurter.dev/v1"


def test_fetch_chinamoney_normalizes_cross_rates(monkeypatch):
    import app.services.fx_service as fx_module

    monkeypatch.setattr(
        fx_module,
        "_fetch_with_retry",
        lambda *_args, **_kwargs: {
            "head": {"rep_code": "200"},
            "data": {"head": ["USD/CNY", "100JPY/CNY", "CNY/MOP"]},
            "records": [
                {
                    "date": "2026-06-26",
                    "values": ["7.20", "4.80", "1.10"],
                }
            ],
        },
    )

    actual_date, rates = fx_module._fetch_chinamoney(date(2026, 6, 28), "USD")
    normalized = {
        currency: rate.quantize(Decimal("0.00000001"))
        for currency, rate in rates.items()
    }

    # 请求 6-28（周日）但记录属于 6-26（周五）：返回记录自带的真实日期
    assert actual_date == date(2026, 6, 26)
    assert normalized == {
        "CNY": Decimal("7.20000000"),
        "JPY": Decimal("150.00000000"),
        "MOP": Decimal("7.92000000"),
    }


def test_fetch_chinamoney_rejects_record_from_future(monkeypatch):
    import app.services.fx_service as fx_module

    monkeypatch.setattr(
        fx_module,
        "_fetch_with_retry",
        lambda *_args, **_kwargs: {
            "head": {"rep_code": "200"},
            "data": {"head": ["USD/CNY"]},
            "records": [{"date": "2026-06-29", "values": ["7.20"]}],
        },
    )

    with pytest.raises(ValueError, match="after requested date"):
        fx_module._fetch_chinamoney(date(2026, 6, 28), "USD")


def test_fetch_chinamoney_rejects_missing_record_date(monkeypatch):
    import app.services.fx_service as fx_module

    monkeypatch.setattr(
        fx_module,
        "_fetch_with_retry",
        lambda *_args, **_kwargs: {
            "head": {"rep_code": "200"},
            "data": {"head": ["USD/CNY"]},
            "records": [{"values": ["7.20"]}],
        },
    )

    with pytest.raises(ValueError, match="date is missing"):
        fx_module._fetch_chinamoney(date(2026, 6, 28), "USD")


def test_fetch_frankfurter_validates_response_date(monkeypatch):
    import app.services.fx_service as fx_module

    # 周末请求返回前一工作日数据：以响应自带的 date 为准
    monkeypatch.setattr(
        fx_module,
        "_fetch_with_retry",
        lambda *_args, **_kwargs: {
            "base": "CNY",
            "date": "2026-06-26",
            "rates": {"USD": 0.14},
        },
    )

    actual_date, rates = fx_module._fetch_frankfurter(date(2026, 6, 28), "CNY")

    assert actual_date == date(2026, 6, 26)
    assert rates == {"USD": Decimal("0.14")}


def test_fetch_frankfurter_rejects_missing_date(monkeypatch):
    import app.services.fx_service as fx_module

    monkeypatch.setattr(
        fx_module,
        "_fetch_with_retry",
        lambda *_args, **_kwargs: {"base": "CNY", "rates": {"USD": 0.14}},
    )

    with pytest.raises(ValueError, match="date is missing"):
        fx_module._fetch_frankfurter(date(2026, 6, 28), "CNY")


def test_fetch_provider_rates_prefers_chinamoney(monkeypatch):
    import app.services.fx_service as fx_module

    monkeypatch.setattr(
        fx_module,
        "_fetch_chinamoney",
        lambda *_args: (date(2026, 6, 26), {"USD": Decimal("0.14")}),
        raising=False,
    )
    monkeypatch.setattr(
        fx_module,
        "_fetch_frankfurter",
        lambda *_args: pytest.fail("不应在主汇率源成功后继续请求备用源"),
    )

    assert fx_module._fetch_provider_rates(date(2026, 6, 28), "CNY") == (
        "chinamoney",
        date(2026, 6, 26),
        {"USD": Decimal("0.14")},
    )


def test_fetch_provider_rates_falls_back_to_frankfurter(monkeypatch):
    import app.services.fx_service as fx_module

    def unavailable(*_args):
        raise ValueError("unavailable")

    monkeypatch.setattr(
        fx_module,
        "_fetch_chinamoney",
        unavailable,
        raising=False,
    )
    monkeypatch.setattr(
        fx_module,
        "_fetch_frankfurter",
        lambda *_args: (date(2026, 6, 26), {"USD": Decimal("0.14")}),
    )

    assert fx_module._fetch_provider_rates(date(2026, 6, 28), "CNY") == (
        "frankfurter",
        date(2026, 6, 26),
        {"USD": Decimal("0.14")},
    )


def test_refresh_rates_stores_weekend_rates_under_actual_trading_date(monkeypatch):
    """周日请求拿到周五数据时，必须以周五落库而不是错标成周日精确值。"""
    import app.services.fx_service as fx_module

    monkeypatch.setattr(
        fx_module,
        "_fetch_with_retry",
        lambda *_args, **_kwargs: {
            "head": {"rep_code": "200"},
            "data": {"head": ["USD/CNY"]},
            "records": [{"date": "2026-06-26", "values": ["8.00"]}],
        },
    )

    with SessionLocal() as session:
        count = FXService.refresh_rates(
            session, rate_date=date(2026, 6, 28), base_currency="CNY"
        )

        assert count == 2  # USD + CNY 自指行
        assert session.scalar(
            select(FxRateDaily).where(FxRateDaily.rate_date == date(2026, 6, 28))
        ) is None
        friday = session.scalar(
            select(FxRateDaily).where(
                FxRateDaily.rate_date == date(2026, 6, 26),
                FxRateDaily.base_currency == "CNY",
                FxRateDaily.quote_currency == "USD",
            )
        )
        assert friday is not None
        assert friday.is_estimated is False
        assert Decimal(friday.rate) == Decimal("0.125")

        # 周日查询走历史 fallback，显式标记估算值而不是伪精确
        rate, is_estimated = FXService.resolve_rate_for_pair(
            session,
            quote_currency="USD",
            base_currency="CNY",
            as_of=date(2026, 6, 28),
            allow_refresh=False,
        )
        assert rate == Decimal("0.125")
        assert is_estimated is True


def test_resolve_rate_cold_start_on_weekend_uses_actual_date_fallback(monkeypatch):
    """空缓存 + 周末冷启动：refresh 落库实际交易日后，递归查询应命中估算 fallback 而非报错。"""
    import app.services.fx_service as fx_module

    monkeypatch.setattr(
        fx_module,
        "_fetch_with_retry",
        lambda *_args, **_kwargs: {
            "head": {"rep_code": "200"},
            "data": {"head": ["USD/CNY"]},
            "records": [{"date": "2026-06-26", "values": ["8.00"]}],
        },
    )

    with SessionLocal() as session:
        rate, is_estimated = FXService.resolve_rate_for_pair(
            session,
            quote_currency="USD",
            base_currency="CNY",
            as_of=date(2026, 6, 28),
            allow_refresh=True,
        )

    assert rate == Decimal("0.125")
    assert is_estimated is True


def test_resolve_rate_returns_app_error_when_all_fx_providers_fail(monkeypatch):
    monkeypatch.setattr(FXService, "refresh_rates", lambda *_args: 0)

    with SessionLocal() as session:
        with pytest.raises(AppError, match="无法获取 CNY→USD 汇率") as exc_info:
            FXService.resolve_rate_for_pair(
                session,
                quote_currency="USD",
                base_currency="CNY",
                as_of=date(2026, 6, 28),
                allow_refresh=True,
            )

    assert exc_info.value.code == 5000
