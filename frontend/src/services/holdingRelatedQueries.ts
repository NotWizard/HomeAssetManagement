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
  queryKeys.trend.all(),
  queryKeys.rebalance.all(),
  queryKeys.sankey.all(),
  queryKeys.volatility.all(),
  queryKeys.correlation.all(),
  queryKeys.currencyOverview.all(),
] as const;

export const SETTINGS_QUERY_KEYS = [
  queryKeys.settings.all(),
  ...HOLDING_RELATED_QUERY_KEYS,
] as const;

export const HOLDINGS_QUERY_KEYS = [queryKeys.holdings.all()] as const;

export const MEMBER_QUERY_KEYS = [queryKeys.members.all()] as const;

export const MEMBER_HOLDING_RELATED_QUERY_KEYS = [
  queryKeys.members.all(),
  ...HOLDING_RELATED_QUERY_KEYS,
] as const;

export const IMPORT_LOG_QUERY_KEYS = [queryKeys.importLogs.all()] as const;

export async function invalidateHoldingRelatedQueries(
  queryClient: QueryClientLike
) {
  await invalidateQueryKeys(queryClient, HOLDING_RELATED_QUERY_KEYS);
}

export async function invalidateSettingsQueries(queryClient: QueryClientLike) {
  await invalidateQueryKeys(queryClient, SETTINGS_QUERY_KEYS);
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
