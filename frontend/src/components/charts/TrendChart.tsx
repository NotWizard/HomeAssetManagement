import { ECharts } from './ECharts';
import { buildTrendChartOption } from './chartOptions';

type Props = {
  dates: string[];
  totalAsset: number[];
  totalLiability: number[];
  netAsset: number[];
};

export function TrendChart({ dates, totalAsset, totalLiability, netAsset }: Props) {
  const option = buildTrendChartOption({ dates, totalAsset, totalLiability, netAsset });

  return <ECharts option={option} style={{ height: 360 }} />;
}
