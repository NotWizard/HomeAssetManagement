import { ECharts } from './ECharts';
import { buildCurrencyBreakdownChartOption } from './chartOptions';

import type { CurrencyBreakdownItem } from '../../services/analytics';

type Props = {
  currency: string;
  items: CurrencyBreakdownItem[];
  emptyText: string;
};

export function CurrencyBreakdownChart({ currency, items, emptyText }: Props) {
  const option = buildCurrencyBreakdownChartOption(currency, items, emptyText);

  return <ECharts option={option} style={{ height: 360 }} />;
}
