import { ECharts } from './ECharts';
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
        lineStyle: { color: 'gradient', curveness: 0.45, opacity: 0.42 },
        nodeGap: 14,
        nodeWidth: 18,
        label: { color: '#4b5070', fontSize: 12 },
      },
    ],
  };

  return <ECharts option={option} style={{ height: 460 }} />;
}
