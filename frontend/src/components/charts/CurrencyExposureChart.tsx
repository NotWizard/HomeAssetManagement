import { ECharts } from './ECharts';
import { buildCurrencyExposureChartOption } from './chartOptions';

import type { CurrencySummary } from '../../services/analytics';

type Props = {
  data: CurrencySummary[];
  baseCurrency?: string;
};

export function CurrencyExposureChart({ data, baseCurrency = 'CNY' }: Props) {
  const option = buildCurrencyExposureChartOption(data, baseCurrency);

  return <ECharts option={option} style={{ height: 360 }} />;
}
