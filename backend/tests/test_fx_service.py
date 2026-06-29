from datetime import date
from decimal import Decimal

import pytest

from app.core.config import Settings
from app.core.database import SessionLocal
from app.core.exceptions import AppError
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

    rates = fx_module._fetch_chinamoney(date(2026, 6, 28), "USD")
    normalized = {
        currency: rate.quantize(Decimal("0.00000001"))
        for currency, rate in rates.items()
    }

    assert normalized == {
        "CNY": Decimal("7.20000000"),
        "JPY": Decimal("150.00000000"),
        "MOP": Decimal("7.92000000"),
    }


def test_fetch_provider_rates_prefers_chinamoney(monkeypatch):
    import app.services.fx_service as fx_module

    monkeypatch.setattr(
        fx_module,
        "_fetch_chinamoney",
        lambda *_args: {"USD": Decimal("0.14")},
        raising=False,
    )
    monkeypatch.setattr(
        fx_module,
        "_fetch_frankfurter",
        lambda *_args: pytest.fail("不应在主汇率源成功后继续请求备用源"),
    )

    assert fx_module._fetch_provider_rates(date(2026, 6, 28), "CNY") == (
        "chinamoney",
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
        lambda *_args: {"USD": Decimal("0.14")},
    )

    assert fx_module._fetch_provider_rates(date(2026, 6, 28), "CNY") == (
        "frankfurter",
        {"USD": Decimal("0.14")},
    )


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
