import ReactECharts from 'echarts-for-react';

import type { CurrencySummary } from '../../services/analytics';
import { formatCurrency } from '../../utils/format';

type Props = {
  data: CurrencySummary[];
  baseCurrency?: string;
};

export function CurrencyExposureChart({ data, baseCurrency = 'CNY' }: Props) {
  const labels = data.map((item) => item.currency);

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ seriesName: string; value: number; axisValue: string }>) => {
        if (!params.length) {
          return '';
        }
        const lines = [`${params[0].axisValue}`];
        for (const item of params) {
          lines.push(`${item.seriesName}：${formatCurrency(item.value, baseCurrency)}`);
        }
        return lines.join('<br/>');
      },
    },
    legend: { data: ['资产', '负债', '净资产'], top: 0, textStyle: { color: '#596087' } },
    grid: { left: 36, right: 20, top: 42, bottom: 36, containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#8b90b7' },
      axisLine: { lineStyle: { color: '#d6d9ef' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#8b90b7' },
      splitLine: { lineStyle: { color: '#eceefd' } },
    },
    graphic: data.length
      ? undefined
      : {
          type: 'text',
          left: 'center',
          top: 'middle',
          style: { text: '暂无可展示的币种汇总', fill: '#8b90b7', fontSize: 14 },
        },
    series: [
      {
        name: '资产',
        type: 'bar',
        data: data.map((item) => item.total_asset_base),
        itemStyle: { color: '#5856d6', borderRadius: [6, 6, 0, 0] },
      },
      {
        name: '负债',
        type: 'bar',
        data: data.map((item) => item.total_liability_base),
        itemStyle: { color: '#ef476f', borderRadius: [6, 6, 0, 0] },
      },
      {
        name: '净资产',
        type: 'bar',
        data: data.map((item) => item.net_asset_base),
        itemStyle: { color: '#009688', borderRadius: [6, 6, 0, 0] },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 360 }} />;
}
