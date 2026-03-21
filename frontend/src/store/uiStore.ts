import { create } from 'zustand';

import type { AnalyticsDateRange } from '../services/analytics';

export type AnalyticsView = 'overview' | 'risk' | 'currency';

function getDefaultAnalyticsDateRange(): AnalyticsDateRange {
  return {
    startDate: '',
    endDate: '',
  };
}

type UIState = {
  analyticsDateRange: AnalyticsDateRange;
  analyticsDateRangeInitialized: boolean;
  analyticsView: AnalyticsView;
  selectedAnalyticsCurrency: string;
  setAnalyticsDateRange: (dateRange: AnalyticsDateRange) => void;
  setAnalyticsView: (view: AnalyticsView) => void;
  setSelectedAnalyticsCurrency: (currency: string) => void;
};

export const useUIStore = create<UIState>((set) => ({
  analyticsDateRange: getDefaultAnalyticsDateRange(),
  analyticsDateRangeInitialized: false,
  analyticsView: 'overview',
  selectedAnalyticsCurrency: '',
  setAnalyticsDateRange: (analyticsDateRange) => set({ analyticsDateRange, analyticsDateRangeInitialized: true }),
  setAnalyticsView: (view) => set({ analyticsView: view }),
  setSelectedAnalyticsCurrency: (currency) => set({ selectedAnalyticsCurrency: currency }),
}));
