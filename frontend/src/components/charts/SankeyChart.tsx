import ReactECharts from 'echarts-for-react';
import type { SankeyData } from '../../services/analytics';

type Props = {
  data: SankeyData;
};

export function SankeyChart({ data }: Props) {
  const option = {
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'sankey',
        data: data.nodes,
        links: data.links,
        emphasis: { focus: 'adjacency' },
        lineStyle: { color: 'gradient', curveness: 0.5 },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 460 }} />;
}
