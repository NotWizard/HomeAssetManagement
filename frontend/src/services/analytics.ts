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
