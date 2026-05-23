import { useMemo } from 'react';

import { ECharts } from './ECharts';
import { buildVolatilityChartOption, getVolatilityChartHeight } from './chartOptions';
import type { VolatilityItem } from '../../services/analytics';

type Props = {
  data: VolatilityItem[];
};

export function VolatilityChart({ data }: Props) {
  const option = useMemo(() => buildVolatilityChartOption(data), [data]);
  const height = useMemo(() => getVolatilityChartHeight(data.length), [data.length]);

  return <ECharts option={option} style={{ height }} />;
}
