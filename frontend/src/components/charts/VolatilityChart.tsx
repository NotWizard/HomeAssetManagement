import { ECharts } from './ECharts';
import { buildVolatilityChartOption } from './chartOptions';
import type { VolatilityItem } from '../../services/analytics';

type Props = {
  data: VolatilityItem[];
};

export function VolatilityChart({ data }: Props) {
  const option = buildVolatilityChartOption(data);

  return <ECharts option={option} style={{ height: 320 }} />;
}
