from datetime import UTC
from datetime import date
from datetime import datetime

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
