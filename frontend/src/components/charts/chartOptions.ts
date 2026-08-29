import type {
  CorrelationData,
  CurrencyBreakdownItem,
  CurrencySummary,
  SankeyData,
  VolatilityItem,
} from '../../services/analytics';
import { escapeHtml } from '../../utils/escapeHtml';
import { formatCurrency, formatPercent } from '../../utils/format';
import {
  CORRELATION_HEATMAP_Y_AXIS_LABEL,
  CURRENCY_BREAKDOWN_LABEL,
  CURRENCY_BREAKDOWN_LABEL_LAYOUT,
  CURRENCY_BREAKDOWN_LABEL_LINE,
  CURRENCY_EXPOSURE_CHART_GRID,
  SANKEY_MEMBER_NODE_COLOR,
  SANKEY_SERIES_FRAME,
  TREND_CHART_GRID,
  VOLATILITY_CHART_GRID,
  VOLATILITY_Y_AXIS_NAME_GAP,
} from './chartOptionLayout';

type TrendChartArgs = {
  dates: string[];
  totalAsset: number[];
  totalLiability: number[];
  netAsset: number[];
};

type SankeyNode = SankeyData['nodes'][number];

type LabelParams = {
  name?: string;
  data?: { id?: string };
};

type TooltipParams = {
  dataType?: 'node' | 'edge';
  name?: string;
  value?: number;
  data?: { id?: string; source?: string; target?: string; value?: number };
};

const MISSING_CORRELATION = 2;

// Sankey label formatter 提到模块顶层，避免每个节点都创建一个新闭包 formatter
// （节点数百时这是 N 个 captured-this 函数 + 持有 node 引用，妨碍 GC）。
// 节点 map 时预计算 __label / __displayName 字符串，formatter 只从 params.data 读字段。
type SankeyLabelParamsWithCache = LabelParams & {
  data?: LabelParams['data'] & { __label?: string; __displayName?: string };
};
const sankeyLabelFormatter = (params: SankeyLabelParamsWithCache) =>
  params.data?.__label ?? '';
const sankeyEmphasisLabelFormatter = (params: SankeyLabelParamsWithCache) =>
  params.data?.__displayName ?? '';

function formatAxisValue(value: number): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return '0';
  }

  const abs = Math.abs(numeric);
  if (abs >= 100000000) {
    return `${(numeric / 100000000).toFixed(abs >= 1000000000 ? 0 : 1)}亿`;
  }
  if (abs >= 10000) {
    return `${(numeric / 10000).toFixed(abs >= 100000 ? 0 : 1)}万`;
  }

  return numeric.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function getNodeStage(node: SankeyNode): string {
  if (node.node_type === 'member') return 'member';
  if (node.node_type === 'category') return `${node.holding_type}:category`;
  if (node.node_type === 'holding') return `${node.holding_type}:holding`;
  return 'other';
}

function getNodeColor(node: SankeyNode): string {
  if (node.node_type === 'member') return SANKEY_MEMBER_NODE_COLOR;
  if (node.holding_type === 'liability') {
    return node.node_type === 'category' ? '#fb7185' : '#fecdd3';
  }
  return node.node_type === 'category' ? '#38bdf8' : '#99f6e4';
}

function getNodeBorderColor(node: SankeyNode): string {
  if (node.node_type === 'member') return '#cbd5e1';
  if (node.holding_type === 'liability') {
    return '#fda4af';
  }
  return node.node_type === 'category' ? '#7dd3fc' : '#5eead4';
}

function getLabelPosition(node: SankeyNode): 'left' | 'right' | 'inside' {
  if (node.node_type === 'member') return 'inside';
  if (node.holding_type === 'liability') return 'left';
  return 'right';
}

function getLabelAlign(node: SankeyNode): 'left' | 'right' | 'center' {
  if (node.node_type === 'member') return 'center';
  if (node.holding_type === 'liability') return 'right';
  return 'left';
}

function looksLikeInternalKey(node: SankeyNode, value: string): boolean {
  if (/^(member|asset|liability):/i.test(value)) {
    return true;
  }

  if (node.node_type === 'member') {
    return /^Member\s+\d+$/i.test(value);
  }

  return /^(Asset|Liability)\s+(tail|item|l\d)\b/i.test(value);
}

function getDisplayName(node?: SankeyNode): string {
  if (!node) {
    return '未命名';
  }

  const rawName = String(node.name ?? '').trim();
  if (rawName && !looksLikeInternalKey(node, rawName)) {
    return rawName;
  }

  if (node.node_type === 'member') {
    const memberName = String(node.member_name ?? '').trim();
    if (memberName) {
      return memberName;
    }
    return node.member_id ? `成员 ${node.member_id}` : '未命名成员';
  }

  const parts = String(node.category_path ?? '').split(' / ').filter(Boolean);
  const categoryName = parts.length > 0 ? parts[parts.length - 1]?.trim() : '';
  return categoryName || rawName || '未命名';
}

function pickVisibleHoldingIds(nodes: SankeyNode[]): Set<string> {
  const visibleIds = new Set<string>();

  (['asset', 'liability'] as const).forEach((holdingType) => {
    const items = nodes
      .filter((node) => node.node_type === 'holding' && node.holding_type === holdingType)
      .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));

    const total = items.reduce((sum, node) => sum + (node.amount ?? 0), 0);

    items.forEach((node, index) => {
      const share = total > 0 ? (node.amount ?? 0) / total : 0;
      if (index < 6 || share >= 0.12) {
        visibleIds.add(node.id);
      }
    });
  });

  return visibleIds;
}

function formatSankeyValue(value: unknown): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '0';
}

function formatSankeyPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '0%';
  }
  const digits = value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)}%`;
}

function getDefaultLabel(node: SankeyNode): string {
  const name = getDisplayName(node);
  if (node.node_type === 'category' && (node.share_pct ?? 0) >= 20) {
    return `${name}\n${formatSankeyPercent(node.share_pct)}`;
  }
  return name;
}

function getSankeyLayout(nodes: SankeyNode[]) {
  const stageCounts = new Map<string, number>();

  nodes.forEach((node) => {
    const stage = getNodeStage(node);
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
  });

  const maxStageNodes = Math.max(0, ...Array.from(stageCounts.values()));

  return {
    chartHeight: Math.min(460, Math.max(400, 180 + maxStageNodes * 16)),
    nodeGap: maxStageNodes >= 24 ? 4 : maxStageNodes >= 16 ? 6 : 10,
    nodeWidth: maxStageNodes >= 24 ? 10 : maxStageNodes >= 16 ? 12 : 14,
  };
}

export function getSankeyChartHeight(data: SankeyData): number {
  return getSankeyLayout(data.nodes).chartHeight;
}

export function buildTrendChartOption({
  dates,
  totalAsset,
  totalLiability,
  netAsset,
}: TrendChartArgs) {
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['总资产', '总负债', '净资产'], top: 6, textStyle: { color: '#596087' } },
    grid: TREND_CHART_GRID,
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#d6d9ef' } },
      axisLabel: { color: '#8b90b7', hideOverlap: true, margin: 12 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#eceefd' } },
      axisLabel: {
        color: '#8b90b7',
        formatter: (value: number) => formatAxisValue(value),
        margin: 12,
      },
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
}

export {
  buildVolatilityValues,
  formatVolatilityTooltip,
} from './volatilityValues';
import {
  buildVolatilityValues,
  formatVolatilityTooltip,
} from './volatilityValues';

export function buildVolatilityChartOption(data: VolatilityItem[]) {
  const labels = data.map((item) => item.asset);
  const values = buildVolatilityValues(data);
  const count = data.length;
  // 数据项越多，标签越拥挤——动态收紧字体并加大旋转角度。
  const labelFontSize = count >= 20 ? 9 : count >= 14 ? 10 : 11;
  const labelRotate = count >= 20 ? 38 : count >= 14 ? 30 : 22;
  const labelWidth = count >= 20 ? 70 : count >= 14 ? 80 : 92;

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (
        params: Array<{ axisValueLabel?: string; name?: string; value: number | null }>
      ) => {
        const head = params[0];
        if (!head) {
          return '';
        }
        // label 是资产名（用户输入），tooltip renderMode 为 html，必须转义
        const label = escapeHtml(head.axisValueLabel ?? head.name ?? '');
        return formatVolatilityTooltip(label, head.value);
      },
    },
    grid: VOLATILITY_CHART_GRID,
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: {
        rotate: labelRotate,
        color: '#8b90b7',
        interval: 0,
        width: labelWidth,
        overflow: 'break',
        lineHeight: 13,
        fontSize: labelFontSize,
      },
    },
    yAxis: {
      type: 'value',
      name: '年化波动率(%)',
      nameLocation: 'middle',
      nameGap: VOLATILITY_Y_AXIS_NAME_GAP,
      nameTextStyle: { color: '#8b90b7' },
      axisLabel: {
        color: '#8b90b7',
        formatter: (value: number) => formatAxisValue(value),
        margin: 12,
      },
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
}

export function buildCorrelationHeatmapOption(data: CorrelationData) {
  const matrixData: Array<[number, number, number]> = [];

  data.matrix.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      matrixData.push([colIndex, rowIndex, value ?? MISSING_CORRELATION]);
    });
  });

  const count = data.assets.length;
  // 资产数量较多时缩字号、加大旋转角度，并隐藏单元格内的数值标签——避免拥挤；
  // tooltip 仍保留精确数值，光标悬停可见。
  const axisFontSize = count >= 18 ? 9 : count >= 12 ? 10 : 11;
  const xRotate = count >= 18 ? 50 : count >= 12 ? 36 : 24;
  const showCellLabel = count <= 12;

  return {
    tooltip: {
      formatter: (params: { data: [number, number, number] }) => {
        const [x, y, v] = params.data;
        // 资产名是用户输入，tooltip renderMode 为 html，必须转义
        const yName = escapeHtml(data.assets[y]);
        const xName = escapeHtml(data.assets[x]);
        if (v === MISSING_CORRELATION) {
          return `${yName} vs ${xName}<br/>样本不足`;
        }
        return `${yName} vs ${xName}<br/>${v.toFixed(4)}`;
      },
    },
    grid: {
      left: 88,
      right: 16,
      top: 8,
      bottom: 92,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: data.assets,
      splitArea: { show: true },
      axisLabel: {
        color: '#8b90b7',
        interval: 0,
        rotate: xRotate,
        width: 104,
        overflow: 'break',
        lineHeight: 13,
        fontSize: axisFontSize,
      },
    },
    yAxis: {
      type: 'category',
      data: data.assets,
      splitArea: { show: true },
      axisLabel: { ...CORRELATION_HEATMAP_Y_AXIS_LABEL, fontSize: axisFontSize },
    },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 12,
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
          show: showCellLabel,
          fontSize: 10,
          formatter: (params: { value: [number, number, number] }) =>
            params.value[2] === MISSING_CORRELATION ? 'N/A' : params.value[2].toFixed(2),
        },
      },
    ],
  };
}

export function getCorrelationHeatmapHeight(assetCount: number): number {
  // 单元格至少 22px，再加上 X 轴旋转标签所需的底部空间和上下间距。
  // 资产数较多时高度自适应增长，避免单元格被压成一条线、Y 轴标签互相遮挡。
  const cellSize = assetCount >= 18 ? 22 : assetCount >= 12 ? 26 : 32;
  const reserved = 200; // 顶部 + 底部 axis label + visualMap
  return Math.min(820, Math.max(420, assetCount * cellSize + reserved));
}

export function getVolatilityChartHeight(itemCount: number): number {
  // 标签鸡毛蒜皮地堆在 X 轴时也能露出 y 轴和柱体——通过抬高图表高度给标签留白。
  if (itemCount >= 20) return 420;
  if (itemCount >= 14) return 380;
  return 320;
}

export function buildCurrencyExposureChartOption(data: CurrencySummary[], baseCurrency = 'CNY') {
  const labels = data.map((item) => item.currency);

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ seriesName: string; value: number; axisValue: string }>) => {
        if (!params.length) {
          return '';
        }
        // axisValue 是用户录入的币种代码，需转义；seriesName 为固定中文文案
        const lines = [escapeHtml(`${params[0].axisValue}`)];
        for (const item of params) {
          lines.push(`${item.seriesName}：${formatCurrency(item.value, baseCurrency)}`);
        }
        return lines.join('<br/>');
      },
    },
    legend: { data: ['资产', '负债', '净资产'], top: 6, textStyle: { color: '#596087' } },
    grid: CURRENCY_EXPOSURE_CHART_GRID,
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#8b90b7', margin: 12 },
      axisLine: { lineStyle: { color: '#d6d9ef' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#8b90b7',
        formatter: (value: number) => formatAxisValue(value),
        margin: 12,
      },
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
}

export function buildCurrencyBreakdownChartOption(
  currency: string,
  items: CurrencyBreakdownItem[],
  emptyText: string
) {
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: { name: string; value: number; data: CurrencyBreakdownItem }) => {
        return [
          escapeHtml(params.name),
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
        center: ['50%', '40%'],
        avoidLabelOverlap: true,
        label: {
          ...CURRENCY_BREAKDOWN_LABEL,
          formatter: ({ name, percent }: { name: string; percent: number }) => `${name}\n${percent.toFixed(1)}%`,
        },
        labelLayout: CURRENCY_BREAKDOWN_LABEL_LAYOUT,
        labelLine: CURRENCY_BREAKDOWN_LABEL_LINE,
        data: items.map((item) => ({ ...item, value: item.amount_original, name: item.name })),
      },
    ],
  };
}

export function buildSankeyChartOption(data: SankeyData) {
  const layout = getSankeyLayout(data.nodes);
  const nodeMap = new Map(data.nodes.map((node) => [node.id, node]));
  const memberNodeIds = new Set(data.nodes.filter((node) => node.node_type === 'member').map((node) => node.id));
  const visibleHoldingIds = pickVisibleHoldingIds(data.nodes);

  const getNodeByParams = (params: LabelParams | TooltipParams) => {
    const nodeId = params.data?.id ?? params.name ?? '';
    return nodeMap.get(nodeId);
  };

  const echartsNodes = data.nodes.map((node) => {
    const isMember = node.node_type === 'member';
    const isCategory = node.node_type === 'category';
    const isHolding = node.node_type === 'holding';
    const showLabel = isMember || isCategory || visibleHoldingIds.has(node.id);

    return {
      ...node,
      name: node.id,
      value: node.amount ?? 0,
      draggable: false,
      __label: getDefaultLabel(node),
      __displayName: getDisplayName(node),
      itemStyle: {
        color: getNodeColor(node),
        borderColor: getNodeBorderColor(node),
        borderWidth: isMember ? 1.2 : 1,
      },
      label: {
        show: showLabel,
        position: getLabelPosition(node),
        align: getLabelAlign(node),
        color: isMember ? '#0f172a' : node.holding_type === 'liability' ? '#881337' : '#0f4c81',
        backgroundColor: isMember ? 'rgba(248,250,252,0.96)' : 'transparent',
        borderColor: isMember ? '#334155' : 'transparent',
        borderWidth: isMember ? 1 : 0,
        borderRadius: isMember ? 999 : 0,
        padding: isMember ? [4, 8] : 0,
        fontWeight: isMember ? 700 : isCategory ? 600 : 500,
        fontSize: isMember ? 12 : 10,
        lineHeight: isMember ? 16 : 14,
        distance: isMember ? 0 : 10,
        width: isMember ? 112 : isCategory ? 156 : 148,
        overflow: 'break',
        formatter: sankeyLabelFormatter,
      },
      emphasis: {
        label: {
          show: isHolding || isCategory || isMember,
          width: 168,
          overflow: 'break',
          formatter: sankeyEmphasisLabelFormatter,
        },
      },
    };
  });

  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: TooltipParams) => {
        if (params.dataType === 'edge') {
          const sourceNode = nodeMap.get(params.data?.source ?? '');
          const targetNode = nodeMap.get(params.data?.target ?? '');
          const lines = [
            `${escapeHtml(getDisplayName(sourceNode))} → ${escapeHtml(getDisplayName(targetNode))}`,
            `金额：${formatSankeyValue(params.data?.value)}`,
          ];
          if (targetNode?.holding_type && targetNode.share_pct != null) {
            lines.push(`占比：${formatSankeyPercent(targetNode.share_pct)}`);
          }
          return lines.join('<br/>');
        }

        const node = getNodeByParams(params);
        if (!node) {
          return `${escapeHtml(params.name ?? '未命名节点')}<br/>金额：${formatSankeyValue(params.value)}`;
        }

        const lines = [
          escapeHtml(getDisplayName(node)),
          `金额：${formatSankeyValue(node.amount)}`,
        ];
        if (node.member_name && !memberNodeIds.has(node.id)) {
          lines.push(`成员：${escapeHtml(node.member_name)}`);
        }
        if (node.holding_type) {
          lines.push(`类型：${node.holding_type === 'asset' ? '资产' : '负债'}`);
        }
        if (node.category_path) {
          lines.push(`分类：${escapeHtml(node.category_path)}`);
        }
        if (node.holding_type && node.share_pct != null) {
          lines.push(`占比：${formatSankeyPercent(node.share_pct)}`);
        }
        return lines.join('<br/>');
      },
    },
    series: [
      {
        type: 'sankey',
        ...SANKEY_SERIES_FRAME,
        nodeAlign: 'justify',
        layoutIterations: 0,
        draggable: false,
        data: echartsNodes,
        links: data.links,
        emphasis: { focus: 'adjacency' },
        lineStyle: {
          color: 'gradient',
          curveness: 0.44,
          opacity: 0.22,
        },
        nodeGap: layout.nodeGap,
        nodeWidth: layout.nodeWidth,
        label: { show: false },
      },
    ],
  };
}
