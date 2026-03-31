import { Suspense, lazy, type ReactNode } from 'react';
import { Coins } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import type { SankeyData, TrendData } from '../../services/analytics';

const TrendChart = lazy(() => import('../charts/TrendChart').then((module) => ({ default: module.TrendChart })));
const SankeyChart = lazy(() => import('../charts/SankeyChart').then((module) => ({ default: module.SankeyChart })));

type OverviewAnalyticsSectionProps = {
  trendData?: TrendData;
  trendError: unknown;
  trendIsError: boolean;
  sankeyData?: SankeyData;
  sankeyError: unknown;
  sankeyIsError: boolean;
};

export function OverviewAnalyticsSection({
  trendData,
  trendError,
  trendIsError,
  sankeyData,
  sankeyError,
  sankeyIsError,
}: OverviewAnalyticsSectionProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">总资产趋势</CardTitle>
          <CardDescription>从时间维度查看总资产、总负债与净资产的变化。</CardDescription>
        </CardHeader>
        <CardContent>
          {trendIsError ? (
            <ErrorState text={`趋势数据加载失败：${formatError(trendError)}`} />
          ) : (trendData?.dates.length ?? 0) > 0 ? (
            <Suspense fallback={<Skeleton className="h-[360px] w-full" />}>
              <TrendChart
                dates={trendData?.dates ?? []}
                totalAsset={trendData?.total_asset ?? []}
                totalLiability={trendData?.total_liability ?? []}
                netAsset={trendData?.net_asset ?? []}
              />
            </Suspense>
          ) : (
            <EmptyState icon={<Coins className="h-5 w-5 text-primary" />} text="暂无趋势数据，录入资产负债后即可查看。" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">家庭资产负债桑基图</CardTitle>
          <CardDescription>查看资产与负债在家庭结构中的分布流向。</CardDescription>
        </CardHeader>
        <CardContent>
          {sankeyIsError ? (
            <ErrorState text={`结构数据加载失败：${formatError(sankeyError)}`} />
          ) : (sankeyData?.nodes.length ?? 0) > 0 ? (
            <Suspense fallback={<Skeleton className="h-[460px] w-full" />}>
              <SankeyChart data={sankeyData ?? { nodes: [], links: [] }} />
            </Suspense>
          ) : (
            <EmptyState icon={<Coins className="h-5 w-5 text-primary" />} text="暂无结构数据，录入资产负债后即可查看。" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60">{icon}</div>
      {text}
    </div>
  );
}

function ErrorState({ text }: { text: string }) {
  return <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-6 text-center text-sm text-rose-700">{text}</div>;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : '请求失败';
}
