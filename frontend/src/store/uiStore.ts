import { create } from 'zustand';

import type { AnalyticsDateRange } from '../services/analytics';

export type AnalyticsView = 'overview' | 'risk' | 'currency';

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultAnalyticsDateRange(): AnalyticsDateRange {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 89);

  return {
    startDate: formatDateInputValue(startDate),
    endDate: formatDateInputValue(endDate),
  };
}

type UIState = {
  analyticsDateRange: AnalyticsDateRange;
  analyticsView: AnalyticsView;
  selectedAnalyticsCurrency: string;
  setAnalyticsDateRange: (dateRange: AnalyticsDateRange) => void;
  setAnalyticsView: (view: AnalyticsView) => void;
  setSelectedAnalyticsCurrency: (currency: string) => void;
};

export const useUIStore = create<UIState>((set) => ({
  analyticsDateRange: getDefaultAnalyticsDateRange(),
  analyticsView: 'overview',
  selectedAnalyticsCurrency: '',
  setAnalyticsDateRange: (analyticsDateRange) => set({ analyticsDateRange }),
  setAnalyticsView: (view) => set({ analyticsView: view }),
  setSelectedAnalyticsCurrency: (currency) => set({ selectedAnalyticsCurrency: currency }),
}));
