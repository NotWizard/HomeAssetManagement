import { useMemo } from 'react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GraphicComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import { ECharts } from './ECharts';
import { buildCurrencyExposureChartOption } from './chartOptions';

import type { CurrencySummary } from '../../services/analytics';

echarts.use([BarChart, GraphicComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

type Props = {
  data: CurrencySummary[];
  baseCurrency?: string;
};

export function CurrencyExposureChart({ data, baseCurrency = 'CNY' }: Props) {
  const option = useMemo(
    () => buildCurrencyExposureChartOption(data, baseCurrency),
    [data, baseCurrency]
  );

  return <ECharts option={option} style={{ height: 360 }} />;
}
