import ReactECharts from 'echarts-for-react';
import type { VolatilityItem } from '../../services/analytics';

type Props = {
  data: VolatilityItem[];
};

export function VolatilityChart({ data }: Props) {
  const labels = data.map((item) => item.asset);
  const values = data.map((item) => (item.volatility == null ? 0 : Number((item.volatility * 100).toFixed(2))));

  const option = {
    tooltip: { trigger: 'axis' },
    grid: { left: 36, right: 16, top: 24, bottom: 50 },
    xAxis: { type: 'category', data: labels, axisLabel: { rotate: 25, color: '#8b90b7' } },
    yAxis: {
      type: 'value',
      name: '年化波动率(%)',
      nameTextStyle: { color: '#8b90b7' },
      axisLabel: { color: '#8b90b7' },
      splitLine: { lineStyle: { color: '#eceefd' } },
    },
    series: [
      {
        type: 'bar',
        data: values,
        itemStyle: {
          color: '#6c63ff',
          borderRadius: [6, 6, 0, 0],
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 320 }} />;
}
