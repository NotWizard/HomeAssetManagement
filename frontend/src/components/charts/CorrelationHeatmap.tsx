import { ECharts } from './ECharts';
import { buildCorrelationHeatmapOption } from './chartOptions';
import type { CorrelationData } from '../../services/analytics';

type Props = {
  data: CorrelationData;
};

export function CorrelationHeatmap({ data }: Props) {
  const option = buildCorrelationHeatmapOption(data);

  return <ECharts option={option} style={{ height: 420 }} />;
}
