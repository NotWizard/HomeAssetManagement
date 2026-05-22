import type { Holding, Member } from '../../types';

export type BulkDeleteSummary = {
  count: number;
  assetCount: number;
  liabilityCount: number;
  totalBase: number;
  previewNames: string[];
};

export type TargetRatioStatus = {
  label: '未达标' | '已达标' | '已超出';
  detail: string;
  badgeClassName: string;
  detailClassName: string;
};

const AMOUNT_PATTERN = /^\d*(?:\.\d{0,2})?$/;
export const TARGET_RATIO_EPSILON = 0.0001;

export function normalizeAmountInput(value: string): string | null {
  if (value === '') {
    return '';
  }
  const normalized = value === '.' ? '0.' : value.startsWith('.') ? `0${value}` : value;
  if (!AMOUNT_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

export function hasValidTwoDecimalAmount(value: string): boolean {
  return /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
}

export function summarizeHoldings(rows: Holding[]): BulkDeleteSummary {
  const assetCount = rows.filter((row) => row.type === 'asset').length;
  return {
    count: rows.length,
    assetCount,
    liabilityCount: rows.length - assetCount,
    totalBase: rows.reduce((sum, row) => sum + Number(row.amount_base ?? 0), 0),
    previewNames: rows.slice(0, 5).map((row) => row.name),
  };
}

export function buildBulkErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return '批量删除失败，请稍后重试';
}

export function sumAssetTargetRatio(rows: Holding[]): number {
  return rows.reduce((sum, row) => {
    if (row.type !== 'asset' || row.target_ratio == null) {
      return sum;
    }
    return sum + Number(row.target_ratio);
  }, 0);
}

export function formatTargetRatio(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatTargetRatioSummary(value: number): string {
  const roundedOneDecimal = Math.round((value + Number.EPSILON) * 10) / 10;
  if (roundedOneDecimal === 100 && Math.abs(value - 100) > TARGET_RATIO_EPSILON) {
    return formatTargetRatio(value, 2);
  }
  return formatTargetRatio(roundedOneDecimal);
}

export function formatTargetRatioDelta(value: number): string {
  const normalized = Math.abs(value);
  if (normalized > TARGET_RATIO_EPSILON && normalized < 0.1) {
    return formatTargetRatio(normalized, 2);
  }
  return formatTargetRatio(normalized);
}

export function buildTargetRatioStatus(totalRatio: number): TargetRatioStatus {
  const delta = 100 - totalRatio;
  if (Math.abs(delta) <= TARGET_RATIO_EPSILON) {
    return {
      label: '已达标',
      detail: '已达到 100.0%',
      badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      detailClassName: 'text-emerald-700',
    };
  }
  if (delta > 0) {
    return {
      label: '未达标',
      detail: `还差 ${formatTargetRatioDelta(delta)}`,
      badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700',
      detailClassName: 'text-amber-700',
    };
  }
  return {
    label: '已超出',
    detail: `超出 ${formatTargetRatioDelta(delta)}`,
    badgeClassName: 'border-rose-200 bg-rose-50 text-rose-700',
    detailClassName: 'text-rose-700',
  };
}

export type MemberAllocationSummary = {
  memberId: number;
  memberName: string;
  assetCount: number;
  withTargetCount: number;
  totalRatio: number;
  status: TargetRatioStatus;
  delta: number;
  needsAdjustment: boolean;
  hasAssets: boolean;
};

export function buildMemberAllocationSummaries(
  holdings: Holding[],
  members: Member[]
): MemberAllocationSummary[] {
  const orderedMembers = [...members].sort((a, b) => a.id - b.id);
  const fallbackIds = new Set(orderedMembers.map((member) => member.id));
  const orphanIds = Array.from(
    new Set(
      holdings
        .filter((row) => row.type === 'asset' && !fallbackIds.has(row.member_id))
        .map((row) => row.member_id)
    )
  ).sort((a, b) => a - b);

  const orphanEntries = orphanIds.map<Member>((memberId) => ({
    id: memberId,
    family_id: 0,
    name: `成员 ${memberId}`,
    created_at: '',
    updated_at: '',
  }));

  return [...orderedMembers, ...orphanEntries].map((member) => {
    const memberAssets = holdings.filter(
      (row) => row.type === 'asset' && row.member_id === member.id
    );
    const totalRatio = sumAssetTargetRatio(memberAssets);
    const status = buildTargetRatioStatus(totalRatio);
    const delta = 100 - totalRatio;
    const withTargetCount = memberAssets.filter((row) => row.target_ratio != null).length;

    return {
      memberId: member.id,
      memberName: member.name,
      assetCount: memberAssets.length,
      withTargetCount,
      totalRatio,
      status,
      delta,
      needsAdjustment: status.label !== '已达标' && memberAssets.length > 0,
      hasAssets: memberAssets.length > 0,
    };
  });
}

export type MemberAllocationOverview = {
  total: number;
  balanced: number;
  underAllocated: number;
  overAllocated: number;
  withoutAssets: number;
};

export function summarizeMemberAllocations(
  summaries: MemberAllocationSummary[]
): MemberAllocationOverview {
  const overview: MemberAllocationOverview = {
    total: summaries.length,
    balanced: 0,
    underAllocated: 0,
    overAllocated: 0,
    withoutAssets: 0,
  };

  summaries.forEach((summary) => {
    if (!summary.hasAssets) {
      overview.withoutAssets += 1;
      return;
    }
    if (summary.status.label === '已达标') {
      overview.balanced += 1;
    } else if (summary.status.label === '未达标') {
      overview.underAllocated += 1;
    } else {
      overview.overAllocated += 1;
    }
  });

  return overview;
}

/**
 * 是否存在成员配比偏离 100% 的情况。
 *
 * 用于驱动「成员目标占比配平」概览区的折叠 / 展开行为：全部达标的稳态下整块返回 null，
 * 出现 未达标 / 已超出 时才把概览展示出来，避免稳态下大量"装饰性"卡片侵占表格视野。
 */
export function hasMemberAllocationImbalance(overview: MemberAllocationOverview): boolean {
  return overview.underAllocated > 0 || overview.overAllocated > 0;
}

/**
 * 把 delta（= 100 - totalRatio）格式化成卡片状态徽章里的偏差量文本：
 *   未达标 → "-3.5%"（少了多少）
 *   已超出 → "+5.2%"（多了多少）
 *   达标   → null（调用方自行决定显示"已达标"还是省略）
 */
export function formatAllocationDeviation(delta: number): string | null {
  if (Math.abs(delta) <= TARGET_RATIO_EPSILON) {
    return null;
  }
  const sign = delta > 0 ? '-' : '+';
  return `${sign}${formatTargetRatioDelta(delta)}`;
}

export type NormalizationItem = {
  id: number;
  name: string;
  current: number | null;
  proposed: number;
  delta: number;
};

export type NormalizationPlan = {
  items: NormalizationItem[];
  beforeTotal: number;
  afterTotal: number;
  reason?: 'all_zero';
};

export const NORMALIZATION_FRACTION_DIGITS = 2;

function roundRatio(value: number, digits = NORMALIZATION_FRACTION_DIGITS): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function buildNormalizationPlan(memberAssets: Holding[]): NormalizationPlan {
  const eligible = memberAssets.filter((row) => row.type === 'asset');
  const beforeTotal = sumAssetTargetRatio(eligible);

  if (eligible.length === 0) {
    return { items: [], beforeTotal: 0, afterTotal: 0 };
  }

  const totalForScaling = eligible.reduce(
    (sum, row) => sum + Math.max(Number(row.target_ratio ?? 0), 0),
    0
  );

  if (totalForScaling <= TARGET_RATIO_EPSILON) {
    const evenShare = roundRatio(100 / eligible.length);
    let remaining = 100;
    const items: NormalizationItem[] = eligible.map((row, index) => {
      const isLast = index === eligible.length - 1;
      const proposed = isLast ? roundRatio(remaining) : evenShare;
      remaining -= proposed;
      const current = row.target_ratio == null ? null : Number(row.target_ratio);
      return {
        id: row.id,
        name: row.name,
        current,
        proposed,
        delta: proposed - (current ?? 0),
      };
    });
    return {
      items,
      beforeTotal,
      afterTotal: items.reduce((sum, item) => sum + item.proposed, 0),
      reason: 'all_zero',
    };
  }

  const scale = 100 / totalForScaling;
  let remaining = 100;
  const items: NormalizationItem[] = eligible.map((row, index) => {
    const original = Math.max(Number(row.target_ratio ?? 0), 0);
    let proposed = roundRatio(original * scale);
    const isLast = index === eligible.length - 1;
    if (isLast) {
      proposed = roundRatio(remaining);
    }
    if (proposed < 0) {
      proposed = 0;
    }
    if (proposed > 100) {
      proposed = 100;
    }
    remaining -= proposed;
    const current = row.target_ratio == null ? null : Number(row.target_ratio);
    return {
      id: row.id,
      name: row.name,
      current,
      proposed,
      delta: proposed - (current ?? 0),
    };
  });

  return {
    items,
    beforeTotal,
    afterTotal: items.reduce((sum, item) => sum + item.proposed, 0),
  };
}
