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
          return undefined;
        },
      },
    },
  },
}));
