import type { CategoryNode, Holding } from '../../types';

export type PathOption = {
  key: string;
  label: string;
  l1Id: number;
  l2Id: number;
  l3Id: number;
};

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

export function buildPathOptions(tree: CategoryNode[]): PathOption[] {
  const result: PathOption[] = [];
  for (const l1 of tree) {
    for (const l2 of l1.children ?? []) {
      for (const l3 of l2.children ?? []) {
        result.push({
          key: `${l1.id}|${l2.id}|${l3.id}`,
          label: `${l1.name} / ${l2.name} / ${l3.name}`,
          l1Id: l1.id,
          l2Id: l2.id,
          l3Id: l3.id,
        });
      }
    }
  }
  return result;
}

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
