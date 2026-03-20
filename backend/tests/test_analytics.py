import json
from datetime import UTC
from datetime import date
from datetime import datetime

from fastapi.testclient import TestClient

from app.analytics.currency_overview import build_currency_overview
from app.analytics.correlation import compute_correlation
from app.analytics.sankey_builder import build_sankey
from app.analytics.series_builder import build_daily_series
from app.analytics.volatility import compute_volatility
from app.core.database import SessionLocal
from app.main import app
from app.models.snapshot_daily import SnapshotDaily
from app.services.bootstrap import init_database
from app.services.common import get_default_family
from app.services.snapshot_service import SnapshotService


def _reset_daily_snapshots() -> None:
    init_database()
    with SessionLocal() as session:
        session.query(SnapshotDaily).delete()
        session.commit()


def _snapshot_payload(total_asset: float, total_liability: float, holding_name: str = '现金') -> dict:
    return {
        'totals': {
            'total_asset': total_asset,
            'total_liability': total_liability,
            'net_asset': total_asset - total_liability,
        },
        'holdings': [
            {
                'id': 1,
                'name': holding_name,
                'type': 'asset',
                'amount_base': total_asset,
            }
        ]
        if total_asset > 0
        else [],
    }


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


def test_build_sankey_places_liabilities_left_members_center_assets_right():
    holdings = [
        {
            'id': 1,
            'name': '招商银行工资卡',
            'type': 'asset',
            'member_id': 7,
            'amount_base': 120.0,
            'category_l1': '现金与存款',
            'category_l2': '银行存款',
            'category_l3': '活期存款',
        },
        {
            'id': 2,
            'name': '信用卡已出账单',
            'type': 'liability',
            'member_id': 7,
            'amount_base': 35.0,
            'category_l1': '消费负债',
            'category_l2': '信用卡',
            'category_l3': '已出账单',
        },
        {
            'id': 3,
            'name': '公积金账户',
            'type': 'asset',
            'member_id': 7,
            'amount_base': 30.0,
            'category_l1': '现金与存款',
            'category_l2': '银行存款',
            'category_l3': '定期存款',
        },
    ]

    result = build_sankey(holdings, {7: 'Alice'})

    node_map = {node['id']: node for node in result['nodes']}
    link_map = {(link['source'], link['target']): link['value'] for link in result['links']}

    assert node_map['liability:l3:7:消费负债/信用卡/已出账单']['depth'] == 0
    assert node_map['liability:l3:7:消费负债/信用卡/已出账单']['name'] == '已出账单'
    assert node_map['liability:l3:7:消费负债/信用卡/已出账单']['category_path'] == '消费负债 / 信用卡 / 已出账单'
    assert node_map['liability:l3:7:消费负债/信用卡/已出账单']['share_pct'] == 100.0
    assert node_map['liability:l2:7:消费负债/信用卡']['depth'] == 1
    assert node_map['liability:l2:7:消费负债/信用卡']['name'] == '信用卡'
    assert node_map['liability:l2:7:消费负债/信用卡']['share_pct'] == 100.0
    assert node_map['member:7']['depth'] == 2
    assert node_map['member:7']['name'] == 'Alice'
    assert node_map['asset:l2:7:现金与存款/银行存款']['depth'] == 3
    assert node_map['asset:l2:7:现金与存款/银行存款']['name'] == '银行存款'
    assert node_map['asset:l2:7:现金与存款/银行存款']['share_pct'] == 100.0
    assert node_map['asset:l3:7:现金与存款/银行存款/活期存款']['depth'] == 4
    assert node_map['asset:l3:7:现金与存款/银行存款/活期存款']['name'] == '活期存款'
    assert node_map['asset:l3:7:现金与存款/银行存款/活期存款']['category_path'] == '现金与存款 / 银行存款 / 活期存款'
    assert node_map['asset:l3:7:现金与存款/银行存款/活期存款']['share_pct'] == 80.0
    assert node_map['asset:l3:7:现金与存款/银行存款/定期存款']['name'] == '定期存款'
    assert node_map['asset:l3:7:现金与存款/银行存款/定期存款']['share_pct'] == 20.0

    assert link_map[('member:7', 'liability:l2:7:消费负债/信用卡')] == 35.0
    assert link_map[('liability:l2:7:消费负债/信用卡', 'liability:l3:7:消费负债/信用卡/已出账单')] == 35.0
    assert link_map[('member:7', 'asset:l2:7:现金与存款/银行存款')] == 150.0
    assert link_map[('asset:l2:7:现金与存款/银行存款', 'asset:l3:7:现金与存款/银行存款/活期存款')] == 120.0
    assert link_map[('asset:l2:7:现金与存款/银行存款', 'asset:l3:7:现金与存款/银行存款/定期存款')] == 30.0



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


def test_build_daily_series_aggregates_duplicate_asset_names_within_same_day():
    _reset_daily_snapshots()

    payload = {
        "totals": {
            "total_asset": 300.0,
            "total_liability": 0.0,
            "net_asset": 300.0,
        },
        "holdings": [
            {
                "id": 1,
                "name": "沪深300ETF",
                "type": "asset",
                "amount_base": 100.0,
            },
            {
                "id": 2,
                "name": "沪深300ETF",
                "type": "asset",
                "amount_base": 200.0,
            },
        ],
    }

    with SessionLocal() as session:
        family = get_default_family(session)
        session.add(
            SnapshotDaily(
                family_id=family.id,
                snapshot_date=date(2026, 3, 20),
                payload_json=json.dumps(payload, ensure_ascii=False),
            )
        )
        session.commit()

    with SessionLocal() as session:
        result = build_daily_series(session, window=7)

    assert result["dates"] == ["2026-03-20"]
    assert result["asset_series"] == {"沪深300ETF": [300.0]}


def test_trend_api_supports_date_range_filters():
    _reset_daily_snapshots()

    with SessionLocal() as session:
        family = get_default_family(session)
        session.add_all(
            [
                SnapshotDaily(
                    family_id=family.id,
                    snapshot_date=date(2026, 3, 1),
                    payload_json=json.dumps(_snapshot_payload(100.0, 0.0), ensure_ascii=False),
                ),
                SnapshotDaily(
                    family_id=family.id,
                    snapshot_date=date(2026, 3, 2),
                    payload_json=json.dumps(_snapshot_payload(200.0, 10.0), ensure_ascii=False),
                ),
                SnapshotDaily(
                    family_id=family.id,
                    snapshot_date=date(2026, 3, 3),
                    payload_json=json.dumps(_snapshot_payload(300.0, 20.0), ensure_ascii=False),
                ),
            ]
        )
        session.commit()

    with TestClient(app) as client:
        response = client.get(
            '/api/v1/analytics/trend',
            params={
                'start_date': '2026-03-02',
                'end_date': '2026-03-03',
            },
        )

    assert response.status_code == 200
    payload = response.json()['data']
    assert payload['dates'] == ['2026-03-02', '2026-03-03']
    assert payload['total_asset'] == [200.0, 300.0]
    assert payload['total_liability'] == [10.0, 20.0]
    assert payload['asset_series']['现金'] == [200.0, 300.0]
