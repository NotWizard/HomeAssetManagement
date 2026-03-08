import { ECharts } from './ECharts';
import type { CorrelationData } from '../../services/analytics';

type Props = {
  data: CorrelationData;
};

const MISSING_CORRELATION = 2;

export function CorrelationHeatmap({ data }: Props) {
  const matrixData: Array<[number, number, number]> = [];

  data.matrix.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      matrixData.push([colIndex, rowIndex, value ?? MISSING_CORRELATION]);
    });
  });

  const option = {
    tooltip: {
      formatter: (params: { data: [number, number, number] }) => {
        const [x, y, v] = params.data;
        if (v === MISSING_CORRELATION) {
          return `${data.assets[y]} vs ${data.assets[x]}<br/>样本不足`;
        }
        return `${data.assets[y]} vs ${data.assets[x]}<br/>${v.toFixed(4)}`;
      },
    },
    xAxis: { type: 'category', data: data.assets, splitArea: { show: true }, axisLabel: { color: '#8b90b7' } },
    yAxis: { type: 'category', data: data.assets, splitArea: { show: true }, axisLabel: { color: '#8b90b7' } },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: {
        color: ['#3f8efc', '#f7f8ff', '#f76f8e'],
      },
      outOfRange: {
        color: ['#d8dbe8'],
      },
    },
    series: [
      {
        type: 'heatmap',
        data: matrixData,
        label: {
          show: true,
          formatter: (params: { value: [number, number, number] }) =>
            params.value[2] === MISSING_CORRELATION ? 'N/A' : params.value[2].toFixed(2),
        },
      },
    ],
  };

  return <ECharts option={option} style={{ height: 420 }} />;
}
