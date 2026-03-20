export type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
  trace_id: string | null;
};

export type Member = {
  id: number;
  family_id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

export type CategoryNode = {
  id: number;
  type: 'asset' | 'liability';
  level: number;
  parent_id: number | null;
  name: string;
  children: CategoryNode[];
};

export type Holding = {
  id: number;
  family_id: number;
  member_id: number;
  type: 'asset' | 'liability';
  name: string;
  category_l1_id: number;
  category_l2_id: number;
  category_l3_id: number;
  currency: string;
  amount_original: number;
  amount_base: number;
  target_ratio: number | null;
  source: string;
  updated_at: string;
};

export type Settings = {
  base_currency: string;
  timezone: string;
  rebalance_threshold_pct: number;
  fx_provider: string;
};

export type SettingsUpdatePayload = {
  base_currency: string;
  rebalance_threshold_pct: number;
};

export type MigrationImportResult = {
  family_name: string;
  members_count: number;
  holdings_count: number;
  daily_snapshots_count: number;
};
