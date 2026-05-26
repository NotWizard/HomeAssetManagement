import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

// persist 中间件：把 UI 选择（分析时间段 / view / 选中币种）写 localStorage，
// 跨刷新 / 重启保留用户上次选择。setter 不需要持久化，由 partialize 显式过滤。
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      analyticsDateRange: getDefaultAnalyticsDateRange(),
      analyticsDateRangeInitialized: false,
      analyticsView: 'overview',
      selectedAnalyticsCurrency: '',
      setAnalyticsDateRange: (analyticsDateRange) =>
        set({ analyticsDateRange, analyticsDateRangeInitialized: true }),
      setAnalyticsView: (view) => set({ analyticsView: view }),
      setSelectedAnalyticsCurrency: (currency) => set({ selectedAnalyticsCurrency: currency }),
    }),
    {
      name: 'hbs-ui-store',
      partialize: (state) => ({
        analyticsDateRange: state.analyticsDateRange,
        analyticsDateRangeInitialized: state.analyticsDateRangeInitialized,
        analyticsView: state.analyticsView,
        selectedAnalyticsCurrency: state.selectedAnalyticsCurrency,
      }),
    }
  )
);
