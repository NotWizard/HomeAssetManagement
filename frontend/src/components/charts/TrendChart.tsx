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
    legend: { data: ['总资产', '总负债', '净资产'], top: 0, textStyle: { color: '#596087' } },
    grid: { left: 36, right: 20, bottom: 36, top: 42 },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#d6d9ef' } },
      axisLabel: { color: '#8b90b7' },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#eceefd' } },
      axisLabel: { color: '#8b90b7' },
    },
    series: [
      {
        name: '总资产',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2.8, color: '#5856d6' },
        areaStyle: { color: 'rgba(88,86,214,0.12)' },
        data: totalAsset,
      },
      {
        name: '总负债',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2.2, color: '#ef476f' },
        data: totalLiability,
      },
      {
        name: '净资产',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2.4, color: '#009688' },
        data: netAsset,
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 360 }} />;
}
