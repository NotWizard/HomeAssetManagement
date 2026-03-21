import { getJSON } from './apiClient';

export type AnalyticsDateRange = {
  startDate: string;
  endDate: string;
};

export type AnalyticsDateBounds = {
  start_date: string;
  end_date: string;
};

export type TrendData = {
  dates: string[];
  total_asset: number[];
  total_liability: number[];
  net_asset: number[];
  asset_series: Record<string, Array<number | null>>;
  generated_at: string;
};

export type VolatilityItem = {
  asset: string;
  volatility: number | null;
  sample_size: number;
  insufficient_data: boolean;
};

export type CorrelationData = {
  assets: string[];
  matrix: Array<Array<number | null>>;
};

export type SankeyData = {
  nodes: Array<{
    id: string;
    name: string;
    depth: number;
    node_type: 'member' | 'category' | 'holding';
    holding_type?: 'asset' | 'liability';
    amount?: number;
    member_id?: number;
    member_name?: string;
    category_path?: string;
    share_pct?: number | null;
  }>;
  links: Array<{ source: string; target: string; value: number }>;
};

export type RebalanceItem = {
  id: number;
  name: string;
  target_ratio: number;
  current_ratio: number;
  deviation: number;
  status: string;
};

export type CurrencySummary = {
  currency: string;
  total_asset: number;
  total_liability: number;
  net_asset: number;
  total_asset_base: number;
  total_liability_base: number;
  net_asset_base: number;
  asset_count: number;
  liability_count: number;
};

export type CurrencyBreakdownItem = {
  id: number;
  name: string;
  type: 'asset' | 'liability';
  currency: string;
  category_path: string;
  amount_original: number;
  amount_base: number;
  share_pct: number;
};

export type CurrencyOverviewDetail = {
  summary: CurrencySummary;
  asset_breakdown: CurrencyBreakdownItem[];
  liability_breakdown: CurrencyBreakdownItem[];
  items: CurrencyBreakdownItem[];
};

export type CurrencyOverviewData = {
  currencies: CurrencySummary[];
  details: Record<string, CurrencyOverviewDetail>;
};

function buildAnalyticsQuery(filters: number | AnalyticsDateRange): string {
  const params = new URLSearchParams();

  if (typeof filters === 'number') {
    params.set('window', String(filters));
  } else {
    params.set('start_date', filters.startDate);
    params.set('end_date', filters.endDate);
  }

  return params.toString();
}

function buildDateRangeQuery(filters?: AnalyticsDateRange): string {
  if (!filters?.startDate || !filters?.endDate) {
    return '';
  }
  const params = new URLSearchParams();
  params.set('start_date', filters.startDate);
  params.set('end_date', filters.endDate);
  return params.toString();
}

export function fetchTrend(filters: number | AnalyticsDateRange = 90) {
  return getJSON<TrendData>(`/analytics/trend?${buildAnalyticsQuery(filters)}`);
}

export function fetchAnalyticsDateBounds() {
  return getJSON<AnalyticsDateBounds>('/analytics/date-bounds');
}

export function fetchVolatility(filters: number | AnalyticsDateRange = 90) {
  return getJSON<VolatilityItem[]>(`/analytics/volatility?${buildAnalyticsQuery(filters)}`);
}

export function fetchCorrelation(filters: number | AnalyticsDateRange = 90) {
  return getJSON<CorrelationData>(`/analytics/correlation?${buildAnalyticsQuery(filters)}`);
}

export function fetchSankey(filters?: AnalyticsDateRange) {
  const query = buildDateRangeQuery(filters);
  return getJSON<SankeyData>(query ? `/analytics/sankey?${query}` : '/analytics/sankey');
}

export function fetchRebalance(filters?: AnalyticsDateRange) {
  const query = buildDateRangeQuery(filters);
  return getJSON<RebalanceItem[]>(query ? `/analytics/rebalance?${query}` : '/analytics/rebalance');
}

export function fetchCurrencyOverview() {
  return getJSON<CurrencyOverviewData>('/analytics/currency-overview');
}
