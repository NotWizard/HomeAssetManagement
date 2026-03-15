import { useMemo } from 'react';

import { ECharts } from './ECharts';
import { buildSankeyChartOption, getSankeyChartHeight } from './chartOptions';
import type { SankeyData } from '../../services/analytics';

type Props = {
  data: SankeyData;
};

export function SankeyChart({ data }: Props) {
  const chartHeight = useMemo(() => getSankeyChartHeight(data), [data]);
  const option = useMemo(() => buildSankeyChartOption(data), [data]);

  return <ECharts option={option} style={{ height: chartHeight }} />;
}
