import { useMemo } from 'react';
import * as echarts from 'echarts/core';
import { HeatmapChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import { ECharts } from './ECharts';
import { buildCorrelationHeatmapOption, getCorrelationHeatmapHeight } from './chartOptions';
import type { CorrelationData } from '../../services/analytics';

echarts.use([HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

type Props = {
  data: CorrelationData;
};

export function CorrelationHeatmap({ data }: Props) {
  const option = useMemo(() => buildCorrelationHeatmapOption(data), [data]);
  const height = useMemo(() => getCorrelationHeatmapHeight(data.assets.length), [data.assets.length]);
  // 相关性矩阵是 N×N 方阵：当外层卡片独占整行（~1170 px 全宽）时，如果不限制宽度，
  // 单元格在 X 方向会被拉得远比 Y 方向长（22 资产时约 2:1，5 资产时甚至 6:1），
  // 破坏热力图"格子"的视觉语义。这里把图表内层 max-width 钉在 height + 160（160 是
  // Y 轴 label + visualMap 的横向预留经验值），让单元格在两个方向都接近正方形；
  // mx-auto 让它在更宽的卡片内居中，左右留白由父容器自然吸收。
  const maxWidth = height + 160;

  return (
    <div className="mx-auto w-full" style={{ maxWidth }}>
      <ECharts option={option} style={{ height }} />
    </div>
  );
}
