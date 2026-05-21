import { ECharts } from './ECharts';
import { buildCorrelationHeatmapOption, getCorrelationHeatmapHeight } from './chartOptions';
import type { CorrelationData } from '../../services/analytics';

type Props = {
  data: CorrelationData;
};

export function CorrelationHeatmap({ data }: Props) {
  const option = buildCorrelationHeatmapOption(data);
  const height = getCorrelationHeatmapHeight(data.assets.length);

  return <ECharts option={option} style={{ height }} />;
}
