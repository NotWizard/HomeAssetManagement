import ReactEChartsCore from 'echarts-for-react/lib/core';
import type { EChartsReactProps } from 'echarts-for-react/lib/types';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, PieChart, SankeyChart } from 'echarts/charts';
import { GraphicComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  BarChart,
  HeatmapChart,
  PieChart,
  SankeyChart,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

type Props = Omit<EChartsReactProps, 'echarts'>;

export function ECharts(props: Props) {
  // 默认 notMerge=true：避免分析筛选切换时残留旧 series；
  // 显式覆盖时 (props.notMerge !== undefined) 使用调用方指定的值。
  return (
    <ReactEChartsCore
      echarts={echarts}
      notMerge
      lazyUpdate
      {...props}
    />
  );
}
