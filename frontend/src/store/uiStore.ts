import { create } from 'zustand';

export type AnalyticsView = 'overview' | 'risk' | 'currency';

type UIState = {
  analyticsWindow: number;
  analyticsView: AnalyticsView;
  selectedAnalyticsCurrency: string;
  setAnalyticsWindow: (window: number) => void;
  setAnalyticsView: (view: AnalyticsView) => void;
  setSelectedAnalyticsCurrency: (currency: string) => void;
};

export const useUIStore = create<UIState>((set) => ({
  analyticsWindow: 90,
  analyticsView: 'overview',
  selectedAnalyticsCurrency: '',
  setAnalyticsWindow: (window) => set({ analyticsWindow: window }),
  setAnalyticsView: (view) => set({ analyticsView: view }),
  setSelectedAnalyticsCurrency: (currency) => set({ selectedAnalyticsCurrency: currency }),
}));
