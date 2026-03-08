import { useMemo } from 'react';

import { ECharts } from './ECharts';
import type { SankeyData } from '../../services/analytics';

type Props = {
  data: SankeyData;
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

function getNodeStage(node: SankeyNode): string {
  if (node.node_type === 'member') return 'member';
  if (node.node_type === 'category') return `${node.holding_type}:category`;
  if (node.node_type === 'holding') return `${node.holding_type}:holding`;
  return 'other';
}

function getNodeColor(node: SankeyNode): string {
  if (node.node_type === 'member') return '#334155';
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

function formatValue(value: unknown): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '0';
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '0%';
  }
  const digits = value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)}%`;
}

function getDefaultLabel(node: SankeyNode): string {
  const name = getDisplayName(node);
  if (node.node_type === 'category' && (node.share_pct ?? 0) >= 20) {
    return `${name}\n${formatPercent(node.share_pct)}`;
  }
  return name;
}

export function SankeyChart({ data }: Props) {
  const layout = useMemo(() => {
    const stageCounts = new Map<string, number>();

    data.nodes.forEach((node) => {
      const stage = getNodeStage(node);
      stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
    });

    const maxStageNodes = Math.max(0, ...Array.from(stageCounts.values()));

    return {
      chartHeight: Math.min(460, Math.max(400, 180 + maxStageNodes * 16)),
      nodeGap: maxStageNodes >= 24 ? 4 : maxStageNodes >= 16 ? 6 : 10,
      nodeWidth: maxStageNodes >= 24 ? 10 : maxStageNodes >= 16 ? 12 : 14,
    };
  }, [data.nodes]);

  const option = useMemo(() => {
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
        itemStyle: {
          color: getNodeColor(node),
          borderColor: getNodeBorderColor(node),
          borderWidth: isMember ? 1.2 : 1,
        },
        label: {
          show: showLabel,
          position: getLabelPosition(node),
          color: isMember ? '#f8fafc' : node.holding_type === 'liability' ? '#881337' : '#0f4c81',
          fontWeight: isMember ? 700 : isCategory ? 600 : 500,
          fontSize: isMember ? 12 : 10,
          lineHeight: isMember ? 15 : 13,
          distance: isMember ? 0 : 8,
          width: isMember ? 80 : isCategory ? 118 : 96,
          overflow: 'truncate',
          ellipsis: '…',
          formatter: () => getDefaultLabel(node),
        },
        emphasis: {
          label: {
            show: isHolding || isCategory,
            width: 144,
            overflow: 'truncate',
            ellipsis: '…',
            formatter: () => getDisplayName(node),
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
              `${getDisplayName(sourceNode)} → ${getDisplayName(targetNode)}`,
              `金额：${formatValue(params.data?.value)}`,
            ];
            if (targetNode?.holding_type && targetNode.share_pct != null) {
              lines.push(`占比：${formatPercent(targetNode.share_pct)}`);
            }
            return lines.join('<br/>');
          }

          const node = getNodeByParams(params);
          if (!node) {
            return `${params.name ?? '未命名节点'}<br/>金额：${formatValue(params.value)}`;
          }

          const lines = [getDisplayName(node), `金额：${formatValue(node.amount)}`];
          if (node.member_name && !memberNodeIds.has(node.id)) {
            lines.push(`成员：${node.member_name}`);
          }
          if (node.holding_type) {
            lines.push(`类型：${node.holding_type === 'asset' ? '资产' : '负债'}`);
          }
          if (node.category_path) {
            lines.push(`分类：${node.category_path}`);
          }
          if (node.holding_type && node.share_pct != null) {
            lines.push(`占比：${formatPercent(node.share_pct)}`);
          }
          return lines.join('<br/>');
        },
      },
      series: [
        {
          type: 'sankey',
          left: '4%',
          right: '4%',
          top: '3%',
          bottom: '3%',
          nodeAlign: 'justify',
          layoutIterations: 64,
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
  }, [data.links, data.nodes, layout.nodeGap, layout.nodeWidth]);

  return <ECharts option={option} style={{ height: layout.chartHeight }} />;
}
