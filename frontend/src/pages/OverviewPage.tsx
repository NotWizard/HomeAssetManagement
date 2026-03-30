import { type ReactNode, Suspense, lazy, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Globe, Wallet } from 'lucide-react';

import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { queryKeys } from '../services/holdingRelatedQueries';
import { fetchRebalance, fetchTrend } from '../services/analytics';
import { fetchHoldings } from '../services/holdings';
import { fetchSettings } from '../services/settings';
import { formatCurrency, formatPercent } from '../utils/format';

const TrendChart = lazy(() => import('../components/charts/TrendChart').then((module) => ({ default: module.TrendChart })));

function calcChangePct(current: number, previous: number | null): number | null {
  if (previous == null || previous === 0) {
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatDelta(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

export function OverviewPage() {
  const trendQuery = useQuery({ queryKey: queryKeys.trend.scope('overview'), queryFn: () => fetchTrend(90) });
  const holdingsQuery = useQuery({ queryKey: queryKeys.holdings.scope('overview'), queryFn: fetchHoldings });
  const rebalanceQuery = useQuery({ queryKey: queryKeys.rebalance.scope('overview'), queryFn: () => fetchRebalance() });
  const settingsQuery = useQuery({ queryKey: queryKeys.settings.scope('overview'), queryFn: fetchSettings });
  const baseCurrency = settingsQuery.data?.base_currency ?? 'CNY';
  const trendUnavailable = trendQuery.isError && !trendQuery.data;
  const holdingsUnavailable = holdingsQuery.isError && !holdingsQuery.data;
  const settingsUnavailable = settingsQuery.isError && !settingsQuery.data;
  const rebalanceUnavailable = rebalanceQuery.isError && !rebalanceQuery.data;
  const summaryUnavailable = trendUnavailable || settingsUnavailable;
  const hasQueryWarning = trendQuery.isError || holdingsQuery.isError || settingsQuery.isError || rebalanceQuery.isError;
  const baseCurrencyBadge = settingsQuery.data?.base_currency ?? (settingsUnavailable ? '读取失败' : '--');
  const fxProviderBadge = settingsQuery.data?.fx_provider ?? (settingsUnavailable ? '读取失败' : '--');

  const latest = useMemo(() => {
    if (!trendQuery.data || trendQuery.data.net_asset.length === 0) {
      return {
        totalAsset: 0,
        totalLiability: 0,
        netAsset: 0,
        totalAssetDelta: null,
        totalLiabilityDelta: null,
        netAssetDelta: null,
      };
    }
    const index = trendQuery.data.net_asset.length - 1;
    const prevIndex = index > 0 ? index - 1 : null;
    const totalAsset = trendQuery.data.total_asset[index];
    const totalLiability = trendQuery.data.total_liability[index];
    const netAsset = trendQuery.data.net_asset[index];

    return {
      totalAsset,
      totalLiability,
      netAsset,
      totalAssetDelta: calcChangePct(
        totalAsset,
        prevIndex == null ? null : trendQuery.data.total_asset[prevIndex]
      ),
      totalLiabilityDelta: calcChangePct(
        totalLiability,
        prevIndex == null ? null : trendQuery.data.total_liability[prevIndex]
      ),
      netAssetDelta: calcChangePct(
        netAsset,
        prevIndex == null ? null : trendQuery.data.net_asset[prevIndex]
      ),
    };
  }, [trendQuery.data]);

  const topAssets = useMemo(() => {
    return (holdingsQuery.data ?? [])
      .filter((row) => row.type === 'asset')
      .sort((a, b) => b.amount_base - a.amount_base)
      .slice(0, 5);
  }, [holdingsQuery.data]);

  const summaryLoading = trendQuery.isLoading || settingsQuery.isLoading;
  const trendErrorMessage = trendQuery.isError ? (trendQuery.error instanceof Error && trendQuery.error.message) || '请求失败' : null;
  const holdingsErrorMessage = holdingsQuery.isError
    ? (holdingsQuery.error instanceof Error && holdingsQuery.error.message) || '请求失败'
    : null;
  const settingsErrorMessage = settingsQuery.isError
    ? (settingsQuery.error instanceof Error && settingsQuery.error.message) || '请求失败'
    : null;
  const rebalanceErrorMessage = rebalanceQuery.isError
    ? (rebalanceQuery.error instanceof Error && rebalanceQuery.error.message) || '请求失败'
    : null;
  const pageWarningMessage = trendErrorMessage || holdingsErrorMessage || settingsErrorMessage || rebalanceErrorMessage || '请求失败';
  const topAssetsError = holdingsUnavailable ? holdingsErrorMessage ?? '请求失败' : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Overview</h2>
          <p className="text-sm text-muted-foreground">家庭资产与负债关键指标概览</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Badge variant="secondary">基准币 {baseCurrencyBadge}</Badge>
          <Badge variant="secondary">汇率源 {fxProviderBadge}</Badge>
        </div>
      </div>

      {hasQueryWarning ? (
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">部分数据刷新失败</p>
              <p className="mt-1 text-xs text-rose-700/90">
                {summaryUnavailable || holdingsUnavailable || rebalanceUnavailable
                  ? `当前展示最近一次成功结果；无缓存数据的模块暂时不可用。${pageWarningMessage}`
                  : `当前展示最近一次成功结果。${pageWarningMessage}`}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {summaryUnavailable ? (
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-4 text-sm text-rose-700">关键总览数据暂时不可用，请稍后刷新重试。</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="净资产"
            value={formatCurrency(latest.netAsset, baseCurrency)}
            delta={formatDelta(latest.netAssetDelta)}
            positive={(latest.netAssetDelta ?? 0) >= 0}
            icon={<Wallet className="h-4 w-4" />}
            loading={summaryLoading}
          />
          <MetricCard
            title="总资产"
            value={formatCurrency(latest.totalAsset, baseCurrency)}
            delta={formatDelta(latest.totalAssetDelta)}
            positive={(latest.totalAssetDelta ?? 0) >= 0}
            icon={<ArrowUpRight className="h-4 w-4" />}
            loading={summaryLoading}
          />
          <MetricCard
            title="总负债"
            value={formatCurrency(latest.totalLiability, baseCurrency)}
            delta={formatDelta(latest.totalLiabilityDelta)}
            positive={(latest.totalLiabilityDelta ?? 0) <= 0}
            icon={<ArrowDownRight className="h-4 w-4" />}
            loading={summaryLoading}
          />
          <MetricCard
            title="基准币"
            value={settingsQuery.data?.base_currency ?? '--'}
            delta={settingsQuery.data ? `汇率源 ${settingsQuery.data.fx_provider}` : '读取设置中'}
            positive
            icon={<Globe className="h-4 w-4" />}
            loading={settingsQuery.isLoading}
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">资产总览趋势</CardTitle>
          </CardHeader>
          <CardContent>
            {trendQuery.isError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700">
                <p className="font-medium">{trendUnavailable ? '趋势数据加载失败' : '趋势数据刷新失败'}</p>
                <p className="mt-1 text-xs text-rose-700/90">
                  {trendUnavailable ? trendErrorMessage : `当前展示最近一次成功结果：${trendErrorMessage}`}
                </p>
              </div>
            ) : null}
            {trendUnavailable ? null : trendQuery.data ? (
              <Suspense fallback={<Skeleton className="h-72 w-full" />}>
                <TrendChart
                  dates={trendQuery.data.dates}
                  totalAsset={trendQuery.data.total_asset}
                  totalLiability={trendQuery.data.total_liability}
                  netAsset={trendQuery.data.net_asset}
                />
              </Suspense>
            ) : (
              <Skeleton className="h-72 w-full" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Top Assets</CardTitle>
          </CardHeader>
          <CardContent>
            {holdingsQuery.isError ? (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700">
                <p className="font-medium">{holdingsUnavailable ? '资产数据加载失败' : '资产数据刷新失败'}</p>
                <p className="mt-1 text-xs text-rose-700/90">
                  {holdingsUnavailable ? holdingsErrorMessage : `当前展示最近一次成功结果：${holdingsErrorMessage}`}
                </p>
              </div>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>资产</TableHead>
                  <TableHead className="text-right">折算金额</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topAssetsError ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-rose-600">
                      资产数据加载失败：{topAssetsError}
                    </TableCell>
                  </TableRow>
                ) : topAssets.length > 0 ? (
                  topAssets.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.currency}</p>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(item.amount_base, baseCurrency)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">再平衡预警</CardTitle>
        </CardHeader>
        <CardContent>
          {rebalanceQuery.isError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700">
              <p className="font-medium">{rebalanceUnavailable ? '再平衡数据加载失败' : '再平衡数据刷新失败'}</p>
              <p className="mt-1 text-xs text-rose-700/90">
                {rebalanceUnavailable ? rebalanceErrorMessage : `当前展示最近一次成功结果：${rebalanceErrorMessage}`}
              </p>
            </div>
          ) : null}
          {rebalanceUnavailable ? null : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(rebalanceQuery.data ?? []).slice(0, 6).map((item) => (
                <div key={item.id} className="rounded-lg border bg-secondary/45 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-medium">{item.name}</p>
                    <Badge variant={item.status === '超配' ? 'danger' : 'success'}>{item.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">目标占比 {formatPercent(item.target_ratio)}</p>
                  <p className="text-xs text-muted-foreground">当前占比 {formatPercent(item.current_ratio)}</p>
                  <p className="mt-2 text-sm font-semibold">偏离 {formatPercent(item.deviation)}</p>
                </div>
              ))}
              {(rebalanceQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">当前没有超过阈值的资产项。</p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  title,
  value,
  delta,
  positive,
  icon,
  loading,
}: {
  title: string;
  value: string;
  delta: string;
  positive: boolean;
  icon: ReactNode;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div className="rounded-md bg-secondary p-2 text-primary">{icon}</div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-28" /> : <p className="text-2xl font-semibold">{value}</p>}
        <p className="mt-2 text-xs">
          <span className={positive ? 'text-emerald-600' : 'text-rose-600'}>{delta}</span>
          <span className="ml-1 text-muted-foreground">对比上期</span>
        </p>
      </CardContent>
    </Card>
  );
}
