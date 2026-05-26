import math


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
    # 预计算每个资产的 returns：原 O(N²) 内层每个 (i,j) 都重复跑
    # `_aligned_pairs + _returns(a) + _returns(b)`，同一个 asset 在 N 行 + N 列
    # 共被 _returns 算 2N 次；先一次性算出 per-asset returns 再 align，
    # 把 (N²-N) 次冗余 _returns 调用直接抹掉。
    # 注意：这里改成「先 returns 后 align」的语义——原算法是「先 align 后 returns」
    # （drop pair 中任一为 None 的同一天，再在压实的密集序列上算 returns）。
    # 新算法对每个 asset 各自算 returns（NaN 表示该位置 None 或 prev<=0），再按
    # 位置 align（双侧都非 NaN 才取）。两者只在「单边 None 之后连续日有数据」
    # 的稀疏场景产生 Pearson 数值差，且新算法更保守（不会跨数据缺口算返回率），
    # 与 CLAUDE.md「N/A 保留」约束方向一致。
    series_list = [asset_series[name] for name in assets]
    returns_per_asset: list[list[float]] = [_returns_with_nan(s) for s in series_list]

    matrix: list[list[float | None]] = []
    for i in range(len(assets)):
        row: list[float | None] = []
        ret_i = returns_per_asset[i]
        for j in range(len(assets)):
            if i == j:
                row.append(1.0)
                continue
            aligned_a, aligned_b = _align_non_nan(ret_i, returns_per_asset[j])
            if len(aligned_a) < 2:
                row.append(None)
                continue
            row.append(_pearson(aligned_a, aligned_b))
        matrix.append(row)

    return {"assets": assets, "matrix": matrix}


def _returns_with_nan(values: list[float | None]) -> list[float]:
    """与 `_returns` 同语义但 None / 非正 prev 位输出 NaN 占位，保留索引对齐。

    输出长度 = len(values) - 1。位置 i 对应 values[i] / values[i-1] - 1。
    """
    result: list[float] = []
    for i in range(1, len(values)):
        prev = values[i - 1]
        curr = values[i]
        if prev is None or curr is None:
            result.append(float("nan"))
            continue
        prev_f = float(prev)
        if prev_f <= 0:
            result.append(float("nan"))
            continue
        result.append((float(curr) / prev_f) - 1)
    return result


def _align_non_nan(a: list[float], b: list[float]) -> tuple[list[float], list[float]]:
    aa: list[float] = []
    bb: list[float] = []
    for av, bv in zip(a, b):
        if math.isnan(av) or math.isnan(bv):
            continue
        aa.append(av)
        bb.append(bv)
    return aa, bb
