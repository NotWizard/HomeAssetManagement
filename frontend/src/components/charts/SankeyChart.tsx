import { useMemo } from 'react';
import * as echarts from 'echarts/core';
import { SankeyChart as EchartsSankeyChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import { ECharts } from './ECharts';
import { buildSankeyChartOption, getSankeyChartHeight } from './chartOptions';
import type { SankeyData } from '../../services/analytics';

echarts.use([EchartsSankeyChart, TooltipComponent, CanvasRenderer]);

type Props = {
  data: SankeyData;
};

export function SankeyChart({ data }: Props) {
  const chartHeight = useMemo(() => getSankeyChartHeight(data), [data]);
  const option = useMemo(() => buildSankeyChartOption(data), [data]);

  return <ECharts option={option} style={{ height: chartHeight }} />;
}
