import type { VolatilityItem } from '../../services/analytics';

/**
 * 把后端波动率项映射为 ECharts bar 数据。
 *
 * 关键不变量：`volatility==null`（样本不足）必须保持为 `null`，让 ECharts 留空不画柱体；
 * 不能强转为 `0`，否则在 UI 上"真零波动"与"样本不足"不可区分（违反与相关性矩阵一致的 N/A 规则）。
 */
export function buildVolatilityValues(
  data: VolatilityItem[]
): Array<number | null> {
  return data.map((item) =>
    item.volatility == null
      ? null
      : Number((item.volatility * 100).toFixed(2))
  );
}

export function formatVolatilityTooltip(
  label: string,
  value: number | null
): string {
  if (value == null) {
    return `${label}<br/>样本不足`;
  }
  return `${label}<br/>${value}%`;
}
