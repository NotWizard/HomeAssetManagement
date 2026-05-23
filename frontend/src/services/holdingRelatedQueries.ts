import type { QueryClient, QueryKey } from '@tanstack/react-query';

type QueryClientLike = Pick<QueryClient, 'invalidateQueries'>;
type CategoryType = 'asset' | 'liability';
type AnalyticsDateRange = {
  startDate: string;
  endDate: string;
};

async function invalidateQueryKeys(
  queryClient: QueryClientLike,
  queryKeys: readonly QueryKey[]
) {
  await Promise.all(
    queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  );
}

export const queryKeys = {
  importLogs: {
    all: () => ['import-logs'] as const,
  },
  analyticsDateBounds: {
    all: () => ['analytics-date-bounds'] as const,
  },
  trend: {
    all: () => ['trend'] as const,
    scope: (scope: string) => ['trend', scope] as const,
    range: ({ startDate, endDate }: AnalyticsDateRange) =>
      ['trend', startDate, endDate] as const,
  },
  holdings: {
    all: () => ['holdings'] as const,
    scope: (scope: string) => ['holdings', scope] as const,
  },
  rebalance: {
    all: () => ['rebalance'] as const,
    scope: (scope: string) => ['rebalance', scope] as const,
    range: ({ startDate, endDate }: AnalyticsDateRange) =>
      ['rebalance', startDate, endDate] as const,
  },
  settings: {
    all: () => ['settings'] as const,
    scope: (scope: string) => ['settings', scope] as const,
  },
  members: {
    all: () => ['members'] as const,
  },
  categories: {
    type: (categoryType: CategoryType) => ['categories', categoryType] as const,
  },
  volatility: {
    all: () => ['volatility'] as const,
    range: ({ startDate, endDate }: AnalyticsDateRange) =>
      ['volatility', startDate, endDate] as const,
  },
  correlation: {
    all: () => ['correlation'] as const,
    range: ({ startDate, endDate }: AnalyticsDateRange) =>
      ['correlation', startDate, endDate] as const,
  },
  sankey: {
    all: () => ['sankey'] as const,
    range: ({ startDate, endDate }: AnalyticsDateRange) =>
      ['sankey', startDate, endDate] as const,
  },
  currencyOverview: {
    all: () => ['currency-overview'] as const,
  },
} as const;

export const HOLDING_RELATED_QUERY_KEYS = [
  queryKeys.holdings.all(),
  queryKeys.analyticsDateBounds.all(),
] as const;

/**
 * 涵盖一切 holdings 数据派生 query 的失效集。
 * 仅在「大批量、整表换骨」场景下使用（如 CSV 导入、迁移包恢复、删除全成员等）；
 * 单条 holding 的 create / update / delete 不要用这个——会触发 6+ 重分析端点
 * 同时并发刷新，造成请求雪崩。单条编辑走 HOLDING_RELATED_QUERY_KEYS，
 * 让分析 query 通过 staleTime 自然过期，用户下次切到分析页时再 refetch。
 */
export const ALL_HOLDING_DEPENDENT_QUERY_KEYS = [
  ...HOLDING_RELATED_QUERY_KEYS,
  queryKeys.trend.all(),
  queryKeys.rebalance.all(),
  queryKeys.sankey.all(),
  queryKeys.volatility.all(),
  queryKeys.correlation.all(),
  queryKeys.currencyOverview.all(),
] as const;

export const SETTINGS_QUERY_KEYS = [
  queryKeys.settings.all(),
  ...ALL_HOLDING_DEPENDENT_QUERY_KEYS,
] as const;

/**
 * 轻量 settings 失效集：仅刷新 settings 自身缓存。
 * 用于 base_currency 不变、仅修改阈值等"对持仓估值无影响"的更新，避免雪崩重算 trend / correlation 等重端点。
 */
export const LIGHT_SETTINGS_QUERY_KEYS = [queryKeys.settings.all()] as const;

export const HOLDINGS_QUERY_KEYS = [queryKeys.holdings.all()] as const;

export const MEMBER_QUERY_KEYS = [queryKeys.members.all()] as const;

export const MEMBER_HOLDING_RELATED_QUERY_KEYS = [
  queryKeys.members.all(),
  ...ALL_HOLDING_DEPENDENT_QUERY_KEYS,
] as const;

export const IMPORT_LOG_QUERY_KEYS = [queryKeys.importLogs.all()] as const;

export async function invalidateHoldingRelatedQueries(
  queryClient: QueryClientLike
) {
  await invalidateQueryKeys(queryClient, HOLDING_RELATED_QUERY_KEYS);
}

/**
 * 失效所有 holdings 派生缓存（含全部分析端点）。
 * 仅用于「大批量、整表换骨」场景（CSV 导入、迁移恢复、按成员批量删除等），
 * 避免单条 holding 编辑触发 6+ 重端点并发雪崩。
 */
export async function invalidateAllHoldingDependentQueries(
  queryClient: QueryClientLike
) {
  await invalidateQueryKeys(queryClient, ALL_HOLDING_DEPENDENT_QUERY_KEYS);
}

export async function invalidateSettingsQueries(queryClient: QueryClientLike) {
  await invalidateQueryKeys(queryClient, SETTINGS_QUERY_KEYS);
}

export async function invalidateLightSettingsQueries(
  queryClient: QueryClientLike
) {
  await invalidateQueryKeys(queryClient, LIGHT_SETTINGS_QUERY_KEYS);
}

export async function invalidateHoldingQueries(queryClient: QueryClientLike) {
  await invalidateQueryKeys(queryClient, HOLDINGS_QUERY_KEYS);
}

export async function invalidateMemberQueries(queryClient: QueryClientLike) {
  await invalidateQueryKeys(queryClient, MEMBER_QUERY_KEYS);
}

export async function invalidateMemberHoldingRelatedQueries(
  queryClient: QueryClientLike
) {
  await invalidateQueryKeys(queryClient, MEMBER_HOLDING_RELATED_QUERY_KEYS);
}

export async function invalidateImportLogQueries(queryClient: QueryClientLike) {
  await invalidateQueryKeys(queryClient, IMPORT_LOG_QUERY_KEYS);
}
