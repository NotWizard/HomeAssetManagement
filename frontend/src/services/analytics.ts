import { getJSON } from './apiClient';

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
  nodes: Array<{ id: string; name: string }>;
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

export function fetchTrend(window = 90) {
  return getJSON<TrendData>(`/analytics/trend?window=${window}`);
}

export function fetchVolatility(window = 90) {
  return getJSON<VolatilityItem[]>(`/analytics/volatility?window=${window}`);
}

export function fetchCorrelation(window = 90) {
  return getJSON<CorrelationData>(`/analytics/correlation?window=${window}`);
}

export function fetchSankey() {
  return getJSON<SankeyData>('/analytics/sankey');
}

export function fetchRebalance() {
  return getJSON<RebalanceItem[]>('/analytics/rebalance');
}

export function fetchCurrencyOverview() {
  return getJSON<CurrencyOverviewData>('/analytics/currency-overview');
}
