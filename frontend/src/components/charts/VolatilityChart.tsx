import { useMemo } from 'react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import { ECharts } from './ECharts';
import { buildVolatilityChartOption, getVolatilityChartHeight } from './chartOptions';
import type { VolatilityItem } from '../../services/analytics';

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

type Props = {
  data: VolatilityItem[];
};

export function VolatilityChart({ data }: Props) {
  const option = useMemo(() => buildVolatilityChartOption(data), [data]);
  const height = useMemo(() => getVolatilityChartHeight(data.length), [data.length]);

  return <ECharts option={option} style={{ height }} />;
}
