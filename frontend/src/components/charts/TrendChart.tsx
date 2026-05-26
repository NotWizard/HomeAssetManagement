import { useMemo } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import { ECharts } from './ECharts';
import { buildTrendChartOption } from './chartOptions';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

type Props = {
  dates: string[];
  totalAsset: number[];
  totalLiability: number[];
  netAsset: number[];
};

export function TrendChart({ dates, totalAsset, totalLiability, netAsset }: Props) {
  const option = useMemo(
    () => buildTrendChartOption({ dates, totalAsset, totalLiability, netAsset }),
    [dates, totalAsset, totalLiability, netAsset]
  );

  return <ECharts option={option} style={{ height: 360 }} />;
}
