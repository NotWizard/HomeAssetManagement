from app.analytics.correlation import compute_correlation
from app.analytics.volatility import compute_volatility


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
