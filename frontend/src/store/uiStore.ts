import { create } from 'zustand';

type UIState = {
  analyticsWindow: number;
  setAnalyticsWindow: (window: number) => void;
};

export const useUIStore = create<UIState>((set) => ({
  analyticsWindow: 90,
  setAnalyticsWindow: (window) => set({ analyticsWindow: window }),
}));
