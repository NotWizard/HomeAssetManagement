import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';

import App from './App';
import { ROUTER_FUTURE_FLAGS, resolveRouterKind } from './app/routerConfig';
import { isDesktopRuntime } from './config/runtime';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const Router =
  resolveRouterKind(isDesktopRuntime()) === 'hash' ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router
        future={ROUTER_FUTURE_FLAGS}
      >
        <App />
      </Router>
    </QueryClientProvider>
  </React.StrictMode>
);
