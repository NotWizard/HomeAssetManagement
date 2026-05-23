import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // 把变化频率不同的库拆到独立 chunk 提升发版后用户 304 命中率：
        // - react / react-dom / react-router-dom / @tanstack/react-query 跟随
        //   主框架版本，变化最慢
        // - lucide-react 跟随图标库版本，独立
        // - echarts / zrender 已有独立 chunk
        // 业务代码迭代时这些 vendor chunk 不变，用户增量下载只命中变化部分。
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('/node_modules/echarts-for-react/')) {
            return 'echarts-react';
          }
          if (id.includes('/node_modules/zrender/')) {
            return 'zrender';
          }
          if (id.includes('/node_modules/echarts/')) {
            return 'echarts-core';
          }
          if (id.includes('/node_modules/lucide-react/')) {
            return 'icons-vendor';
          }
          if (
            id.includes('/node_modules/@tanstack/react-query/') ||
            id.includes('/node_modules/react-router-dom/') ||
            id.includes('/node_modules/react-router/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
}));
