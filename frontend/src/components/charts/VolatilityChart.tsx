import { ECharts } from './ECharts';
import { buildVolatilityChartOption, getVolatilityChartHeight } from './chartOptions';
import type { VolatilityItem } from '../../services/analytics';

type Props = {
  data: VolatilityItem[];
};

export function VolatilityChart({ data }: Props) {
  const option = buildVolatilityChartOption(data);
  const height = getVolatilityChartHeight(data.length);

  return <ECharts option={option} style={{ height }} />;
}
