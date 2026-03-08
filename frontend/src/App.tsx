import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/layout/AppShell';

const OverviewPage = lazy(() => import('./pages/OverviewPage').then((module) => ({ default: module.OverviewPage })));
const EntryPage = lazy(() => import('./pages/EntryPage').then((module) => ({ default: module.EntryPage })));
const MembersPage = lazy(() => import('./pages/MembersPage').then((module) => ({ default: module.MembersPage })));
const ImportPage = lazy(() => import('./pages/ImportPage').then((module) => ({ default: module.ImportPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      页面加载中...
    </div>
  );
}

export default function App() {
  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/entry" element={<EntryPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
