import math


def _aligned_pairs(a: list[float | None], b: list[float | None]) -> tuple[list[float], list[float]]:
    aa: list[float] = []
    bb: list[float] = []
    for av, bv in zip(a, b):
        if av is None or bv is None:
            continue
        aa.append(float(av))
        bb.append(float(bv))
    return aa, bb


def _returns(values: list[float]) -> list[float]:
    result: list[float] = []
    for i in range(1, len(values)):
        prev = values[i - 1]
        curr = values[i]
        if prev <= 0:
            continue
        result.append((curr / prev) - 1)
    return result


def _pearson(x: list[float], y: list[float]) -> float | None:
    if len(x) != len(y) or len(x) < 2:
        return None
    n = len(x)
    mean_x = sum(x) / n
    mean_y = sum(y) / n
    cov = sum((a - mean_x) * (b - mean_y) for a, b in zip(x, y))
    var_x = sum((a - mean_x) ** 2 for a in x)
    var_y = sum((b - mean_y) ** 2 for b in y)
    if var_x <= 0 or var_y <= 0:
        return None
    return cov / math.sqrt(var_x * var_y)


def compute_correlation(asset_series: dict[str, list[float | None]]) -> dict:
    assets = sorted(asset_series.keys())
    matrix: list[list[float | None]] = []

    for i, asset_a in enumerate(assets):
        row: list[float | None] = []
        for j, asset_b in enumerate(assets):
            if i == j:
                row.append(1.0)
                continue
            aligned_a, aligned_b = _aligned_pairs(asset_series[asset_a], asset_series[asset_b])
            ret_a = _returns(aligned_a)
            ret_b = _returns(aligned_b)
            size = min(len(ret_a), len(ret_b))
            if size < 2:
                row.append(None)
                continue
            value = _pearson(ret_a[:size], ret_b[:size])
            row.append(value)
        matrix.append(row)

    return {"assets": assets, "matrix": matrix}
