import { getJSON, putJSON } from './apiClient';
import type { Settings, SettingsUpdatePayload } from '../types';

export function fetchSettings() {
  return getJSON<Settings>('/settings');
}

export function updateSettings(payload: SettingsUpdatePayload) {
  return putJSON<Settings>('/settings', payload);
}
