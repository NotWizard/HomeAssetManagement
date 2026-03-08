from datetime import UTC
from datetime import date
from datetime import datetime

from app.analytics.currency_overview import build_currency_overview
from app.analytics.correlation import compute_correlation
from app.analytics.series_builder import build_daily_series
from app.analytics.volatility import compute_volatility
from app.core.database import SessionLocal
from app.services.bootstrap import init_database
from app.services.snapshot_service import SnapshotService


def test_compute_volatility_returns_values_for_sufficient_samples():
    series = {
        "AssetA": [100, 102, 101, 103, 104, 106],
    }
    result = compute_volatility(series)
    assert len(result) == 1
    assert result[0]["asset"] == "AssetA"
    assert result[0]["volatility"] is not None


def test_compute_correlation_has_identity_diagonal():
    series = {
        "A": [100, 110, 121, 133.1],
        "B": [200, 220, 242, 266.2],
    }
    corr = compute_correlation(series)
    assert corr["assets"] == ["A", "B"]
    assert corr["matrix"][0][0] == 1.0
    assert corr["matrix"][1][1] == 1.0
    assert corr["matrix"][0][1] is not None


def test_build_currency_overview_aggregates_currency_totals_and_breakdowns():
    holdings = [
        {
            "id": 1,
            "name": "美元活期",
            "type": "asset",
            "currency": "USD",
            "amount_original": 600.0,
            "category_l1": "现金与存款",
            "category_l2": "银行存款",
            "category_l3": "活期存款",
        },
        {
            "id": 2,
            "name": "标普 ETF",
            "type": "asset",
            "currency": "USD",
            "amount_original": 400.0,
            "category_l1": "权益投资",
            "category_l2": "基金",
            "category_l3": "指数基金/ETF",
        },
        {
            "id": 3,
            "name": "美元信用卡",
            "type": "liability",
            "currency": "USD",
            "amount_original": 200.0,
            "category_l1": "消费负债",
            "category_l2": "信用卡",
            "category_l3": "已出账单",
        },
        {
            "id": 4,
            "name": "人民币活期",
            "type": "asset",
            "currency": "CNY",
            "amount_original": 1000.0,
            "category_l1": "现金与存款",
            "category_l2": "银行存款",
            "category_l3": "活期存款",
        },
        {
            "id": 5,
            "name": "房贷",
            "type": "liability",
            "currency": "CNY",
            "amount_original": 100.0,
            "category_l1": "房屋相关负债",
            "category_l2": "住房贷款",
            "category_l3": "商业房贷",
        },
    ]

    result = build_currency_overview(holdings)

    assert [row["currency"] for row in result["currencies"]] == ["CNY", "USD"]
    assert result["currencies"][0]["total_asset"] == 1000.0
    assert result["currencies"][0]["total_liability"] == 100.0
    assert result["currencies"][0]["net_asset"] == 900.0
    assert result["currencies"][1]["total_asset"] == 1000.0
    assert result["currencies"][1]["total_liability"] == 200.0
    assert result["currencies"][1]["net_asset"] == 800.0

    usd_detail = result["details"]["USD"]
    assert usd_detail["summary"]["asset_count"] == 2
    assert usd_detail["summary"]["liability_count"] == 1
    assert usd_detail["asset_breakdown"][0]["name"] == "美元活期"
    assert usd_detail["asset_breakdown"][0]["share_pct"] == 60.0
    assert usd_detail["asset_breakdown"][1]["share_pct"] == 40.0
    assert usd_detail["liability_breakdown"][0]["share_pct"] == 100.0
    assert usd_detail["items"][0]["category_path"] == "现金与存款 / 银行存款 / 活期存款"
    assert usd_detail["items"][0]["share_pct"] == 60.0
    assert usd_detail["items"][2]["category_path"] == "消费负债 / 信用卡 / 已出账单"


def test_build_currency_overview_returns_zero_share_when_bucket_total_is_zero():
    holdings = [
        {
            "id": 1,
            "name": "待核销应付款",
            "type": "liability",
            "currency": "JPY",
            "amount_original": 0.0,
            "category_l1": "往来及其他负债",
            "category_l2": "其他应付款",
            "category_l3": "税费及其他欠款",
        }
    ]

    result = build_currency_overview(holdings)

    assert result["currencies"][0]["currency"] == "JPY"
    assert result["currencies"][0]["total_asset"] == 0.0
    assert result["currencies"][0]["total_liability"] == 0.0
    assert result["currencies"][0]["net_asset"] == 0.0
    assert result["currencies"][0]["asset_count"] == 0
    assert result["currencies"][0]["liability_count"] == 1
    assert result["details"]["JPY"]["liability_breakdown"][0]["share_pct"] == 0.0
    assert result["details"]["JPY"]["items"][0]["share_pct"] == 0.0



def test_build_daily_series_generated_at_uses_utc_z_suffix():
    init_database()

    with SessionLocal() as session:
        SnapshotService.create_daily_snapshot(session, snapshot_date=date(2026, 3, 8))
        session.commit()

    with SessionLocal() as session:
        result = build_daily_series(session, window=7)

    assert result['generated_at'].endswith('Z')
    parsed = datetime.fromisoformat(result['generated_at'].replace('Z', '+00:00'))
    assert parsed.tzinfo is UTC
