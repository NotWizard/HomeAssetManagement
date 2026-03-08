import { deleteJSON, getJSON, postJSON, putJSON } from './apiClient';
import type { Holding } from '../types';

export type HoldingPayload = {
  member_id: number;
  type: 'asset' | 'liability';
  name: string;
  category_l1_id: number;
  category_l2_id: number;
  category_l3_id: number;
  currency: string;
  amount_original: string;
  target_ratio?: string | null;
};

export type HoldingBulkDeletePayload =
  | {
      mode: 'ids';
      holding_ids: number[];
    }
  | {
      mode: 'member';
      member_id: number;
    };

export type HoldingBulkDeleteResult = {
  deleted_count: number;
  deleted_ids: number[];
  member_id?: number | null;
  snapshot_refreshed: boolean;
};

export function fetchHoldings() {
  return getJSON<Holding[]>('/holdings');
}

export function createHolding(payload: HoldingPayload) {
  return postJSON<Holding>('/holdings', payload);
}

export function updateHolding(id: number, payload: HoldingPayload) {
  return putJSON<Holding>(`/holdings/${id}`, payload);
}

export function deleteHolding(id: number) {
  return deleteJSON<boolean>(`/holdings/${id}`);
}

export function bulkDeleteHoldings(payload: HoldingBulkDeletePayload) {
  return postJSON<HoldingBulkDeleteResult>('/holdings/bulk-delete', payload);
}
