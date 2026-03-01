import { getJSON } from './apiClient';
import type { CategoryNode } from '../types';

export function fetchCategories(type: 'asset' | 'liability') {
  return getJSON<CategoryNode[]>(`/categories?type=${type}`);
}
