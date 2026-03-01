import ReactECharts from 'echarts-for-react';

type Props = {
  dates: string[];
  totalAsset: number[];
  totalLiability: number[];
  netAsset: number[];
};

export function TrendChart({ dates, totalAsset, totalLiability, netAsset }: Props) {
  const option = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['总资产', '总负债', '净资产'] },
    xAxis: { type: 'category', data: dates },
    yAxis: { type: 'value' },
    series: [
      { name: '总资产', type: 'line', smooth: true, data: totalAsset },
      { name: '总负债', type: 'line', smooth: true, data: totalLiability },
      { name: '净资产', type: 'line', smooth: true, data: netAsset },
    ],
  };

  return <ReactECharts option={option} style={{ height: 360 }} />;
}
