import ReactECharts from 'echarts-for-react';
import type { CorrelationData } from '../../services/analytics';

type Props = {
  data: CorrelationData;
};

export function CorrelationHeatmap({ data }: Props) {
  const matrixData: Array<[number, number, number]> = [];

  data.matrix.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      matrixData.push([colIndex, rowIndex, value ?? 0]);
    });
  });

  const option = {
    tooltip: {
      formatter: (params: { data: [number, number, number] }) => {
        const [x, y, v] = params.data;
        return `${data.assets[y]} vs ${data.assets[x]}<br/>${v.toFixed(4)}`;
      },
    },
    xAxis: { type: 'category', data: data.assets, splitArea: { show: true } },
    yAxis: { type: 'category', data: data.assets, splitArea: { show: true } },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
    },
    series: [
      {
        type: 'heatmap',
        data: matrixData,
        label: {
          show: true,
          formatter: (params: { value: [number, number, number] }) => params.value[2].toFixed(2),
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 420 }} />;
}
