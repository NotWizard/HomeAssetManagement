import { getJSON, putJSON } from './apiClient';
import type { Settings } from '../types';

export function fetchSettings() {
  return getJSON<Settings>('/settings');
}

export function updateSettings(payload: Settings) {
  return putJSON<Settings>('/settings', payload);
}
