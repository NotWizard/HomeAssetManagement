import { useMemo } from 'react';
import * as echarts from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { GraphicComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import { ECharts } from './ECharts';
import { buildCurrencyBreakdownChartOption } from './chartOptions';

import type { CurrencyBreakdownItem } from '../../services/analytics';

echarts.use([PieChart, GraphicComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

type Props = {
  currency: string;
  items: CurrencyBreakdownItem[];
  emptyText: string;
};

export function CurrencyBreakdownChart({ currency, items, emptyText }: Props) {
  const option = useMemo(
    () => buildCurrencyBreakdownChartOption(currency, items, emptyText),
    [currency, items, emptyText]
  );

  return <ECharts option={option} style={{ height: 360 }} />;
}
