import { Suspense, lazy } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Sparkles } from 'lucide-react';

import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { fetchCorrelation, fetchRebalance, fetchSankey, fetchTrend, fetchVolatility } from '../services/analytics';
import { useUIStore } from '../store/uiStore';
import { formatPercent } from '../utils/format';

const TrendChart = lazy(() => import('../components/charts/TrendChart').then((module) => ({ default: module.TrendChart })));
const VolatilityChart = lazy(() => import('../components/charts/VolatilityChart').then((module) => ({ default: module.VolatilityChart })));
const CorrelationHeatmap = lazy(() =>
  import('../components/charts/CorrelationHeatmap').then((module) => ({ default: module.CorrelationHeatmap }))
);
const SankeyChart = lazy(() => import('../components/charts/SankeyChart').then((module) => ({ default: module.SankeyChart })));

export function AnalyticsPage() {
  const window = useUIStore((state) => state.analyticsWindow);
  const setWindow = useUIStore((state) => state.setAnalyticsWindow);

  const trendQuery = useQuery({ queryKey: ['trend', window], queryFn: () => fetchTrend(window) });
  const volatilityQuery = useQuery({ queryKey: ['volatility', window], queryFn: () => fetchVolatility(window) });
  const correlationQuery = useQuery({ queryKey: ['correlation', window], queryFn: () => fetchCorrelation(window) });
  const sankeyQuery = useQuery({ queryKey: ['sankey'], queryFn: fetchSankey });
  const rebalanceQuery = useQuery({ queryKey: ['rebalance'], queryFn: fetchRebalance });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">资产分析看板</h2>
          <p className="text-sm text-muted-foreground">波动率、相关性与配置偏离一屏洞察</p>
        </div>
        <Select
          className="w-40"
          value={window}
          onChange={(event) => setWindow(Number(event.target.value))}
          options={[
            { label: '30 天', value: 30 },
            { label: '90 天', value: 90 },
            { label: '180 天', value: 180 },
            { label: '365 天', value: 365 },
          ]}
        />
      </div>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">总资产趋势</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-[360px] w-full" />}>
            <TrendChart
              dates={trendQuery.data?.dates ?? []}
              totalAsset={trendQuery.data?.total_asset ?? []}
              totalLiability={trendQuery.data?.total_liability ?? []}
              netAsset={trendQuery.data?.net_asset ?? []}
            />
          </Suspense>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">资产波动率</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-[320px] w-full" />}>
              <VolatilityChart data={volatilityQuery.data ?? []} />
            </Suspense>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">再平衡提醒</CardTitle>
          </CardHeader>
          <CardContent>
            {(rebalanceQuery.data ?? []).length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                <Sparkles className="mx-auto mb-2 h-5 w-5 text-primary" />
                当前配置在阈值范围内
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>资产</TableHead>
                    <TableHead>目标占比</TableHead>
                    <TableHead>当前占比</TableHead>
                    <TableHead>偏离</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rebalanceQuery.data ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{formatPercent(row.target_ratio)}</TableCell>
                      <TableCell>{formatPercent(row.current_ratio)}</TableCell>
                      <TableCell>{formatPercent(row.deviation)}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === '超配' ? 'danger' : 'success'}>{row.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">相关性矩阵</CardTitle>
          </CardHeader>
          <CardContent>
            {(correlationQuery.data?.assets.length ?? 0) < 2 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-amber-500" />
                数据样本不足，无法计算相关性矩阵
              </div>
            ) : (
              <Suspense fallback={<Skeleton className="h-[420px] w-full" />}>
                <CorrelationHeatmap data={correlationQuery.data!} />
              </Suspense>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">家庭资产负债桑基图</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-[460px] w-full" />}>
              <SankeyChart data={sankeyQuery.data ?? { nodes: [], links: [] }} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
