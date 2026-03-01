import math
import statistics


def _daily_returns(values: list[float]) -> list[float]:
    returns: list[float] = []
    for i in range(1, len(values)):
        prev = values[i - 1]
        curr = values[i]
        if prev <= 0:
            continue
        returns.append((curr / prev) - 1)
    return returns


def compute_volatility(asset_series: dict[str, list[float | None]]) -> list[dict]:
    results: list[dict] = []
    for name, series in asset_series.items():
        clean = [float(v) for v in series if v is not None]
        returns = _daily_returns(clean)
        if len(returns) < 2:
            results.append(
                {
                    "asset": name,
                    "volatility": None,
                    "sample_size": len(returns),
                    "insufficient_data": True,
                }
            )
            continue

        vol = statistics.stdev(returns) * math.sqrt(252)
        results.append(
            {
                "asset": name,
                "volatility": vol,
                "sample_size": len(returns),
                "insufficient_data": len(returns) < 30,
            }
        )

    results.sort(key=lambda x: (x["volatility"] is None, -(x["volatility"] or 0)))
    return results
