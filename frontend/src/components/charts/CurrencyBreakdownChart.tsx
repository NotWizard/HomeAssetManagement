import ReactECharts from 'echarts-for-react';

import type { CurrencyBreakdownItem } from '../../services/analytics';
import { formatCurrency, formatPercent } from '../../utils/format';

type Props = {
  currency: string;
  items: CurrencyBreakdownItem[];
  emptyText: string;
};

export function CurrencyBreakdownChart({ currency, items, emptyText }: Props) {
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: (params: { name: string; value: number; data: CurrencyBreakdownItem }) => {
        return [
          params.name,
          `金额：${formatCurrency(params.value, currency)}`,
          `占比：${formatPercent(params.data.share_pct)}`,
        ].join('<br/>');
      },
    },
    legend: {
      bottom: 0,
      type: 'scroll',
      textStyle: { color: '#596087' },
    },
    graphic: items.length
      ? undefined
      : {
          type: 'text',
          left: 'center',
          top: 'middle',
          style: { text: emptyText, fill: '#8b90b7', fontSize: 14 },
        },
    series: [
      {
        type: 'pie',
        radius: ['46%', '72%'],
        center: ['50%', '42%'],
        avoidLabelOverlap: true,
        label: {
          color: '#4b5070',
          formatter: ({ name, percent }: { name: string; percent: number }) => `${name}\n${percent.toFixed(1)}%`,
        },
        labelLine: { length: 12, length2: 10 },
        data: items.map((item) => ({ ...item, value: item.amount_original, name: item.name })),
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 360 }} />;
}
