import { type ReactNode, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Globe, Info, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { PageHeader } from '../components/layout/PageHeader';
import { cn } from '../lib/cn';
import { queryKeys } from '../services/holdingRelatedQueries';
import { fetchRebalance, fetchTrend } from '../services/analytics';
import { fetchHoldings } from '../services/holdings';
import { fetchSettings } from '../services/settings';
import { formatCurrency, formatPercent } from '../utils/format';
import { SparklineTrend } from '../components/charts/SparklineTrend';

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

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && /fetch/i.test(error.message)) return true;
  if (error instanceof Error && /network|ECONNREFUSED|Failed to fetch/i.test(error.message)) return true;
  return false;
}

function friendlyError(error: unknown): string {
  if (isNetworkError(error)) return '正在连接本地服务，请稍候…';
  if (error instanceof Error) return error.message;
  return '请求失败';
}

const OVERVIEW_QUERY_OPTIONS = { retry: 3, retryDelay: 1000 } as const;

export function OverviewPage() {
  const navigate = useNavigate();
  const trendQuery = useQuery({ queryKey: queryKeys.trend.scope('overview'), queryFn: () => fetchTrend(90), ...OVERVIEW_QUERY_OPTIONS });
  const holdingsQuery = useQuery({
    queryKey: queryKeys.holdings.all(),
    queryFn: fetchHoldings,
    staleTime: 60_000,
    ...OVERVIEW_QUERY_OPTIONS,
  });
  const rebalanceQuery = useQuery({ queryKey: queryKeys.rebalance.scope('overview'), queryFn: () => fetchRebalance(), ...OVERVIEW_QUERY_OPTIONS });
  const settingsQuery = useQuery({ queryKey: queryKeys.settings.all(), queryFn: fetchSettings, ...OVERVIEW_QUERY_OPTIONS });
  const baseCurrency = settingsQuery.data?.base_currency ?? 'CNY';

  const queries = [trendQuery, holdingsQuery, settingsQuery, rebalanceQuery];
  const anyLoading = queries.some((q) => q.isLoading);
  const anySuccess = queries.some((q) => q.isSuccess);
  const allNetworkError = queries.every((q) => q.isError && isNetworkError(q.error));
  const anyRealError = queries.some((q) => q.isError && !isNetworkError(q.error));
  const anyCachedError = queries.some((q) => q.isError && q.data !== undefined);

  const trendUnavailable = trendQuery.isError && !trendQuery.data;
  const holdingsUnavailable = holdingsQuery.isError && !holdingsQuery.data;
  const settingsUnavailable = settingsQuery.isError && !settingsQuery.data;
  const rebalanceUnavailable = rebalanceQuery.isError && !rebalanceQuery.data;
  const summaryUnavailable = trendUnavailable || settingsUnavailable;
  const baseCurrencyBadge = settingsQuery.data?.base_currency ?? '--';
  const fxProviderBadge = settingsQuery.data?.fx_provider ?? '--';

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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="OVERVIEW"
        title="家庭资产负债总览"
        description="一眼看清净资产、总资产、总负债的关键指标与近期趋势，发现异常即时跟进。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">基准币 {baseCurrencyBadge}</Badge>
            <Badge variant="outline">汇率源 {fxProviderBadge}</Badge>
          </div>
        }
      />

      {allNetworkError && !anyLoading ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-amber-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>正在连接本地服务，请稍候…如持续无法连接，请尝试重启应用。</p>
          </CardContent>
        </Card>
      ) : anyRealError && !anySuccess ? (
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="font-medium">部分数据加载失败，请稍后刷新重试。</p>
          </CardContent>
        </Card>
      ) : anyCachedError ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-amber-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>部分数据刷新失败，当前展示最近一次成功结果。</p>
          </CardContent>
        </Card>
      ) : null}

      {summaryUnavailable && !anyLoading ? (
        <Card className="border-border bg-muted/30">
          <CardContent className="p-4 text-center text-sm text-muted-foreground">
            暂无总览数据，录入资产负债后即可查看。
          </CardContent>
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
            {trendQuery.isError && !isNetworkError(trendQuery.error) ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700">
                <p className="font-medium">趋势数据加载失败</p>
                <p className="mt-1 text-xs text-rose-700/90">{friendlyError(trendQuery.error)}</p>
              </div>
            ) : null}
            {trendUnavailable ? null : trendQuery.data ? (
              <SparklineTrend
                dates={trendQuery.data.dates}
                totalAsset={trendQuery.data.total_asset}
                totalLiability={trendQuery.data.total_liability}
                netAsset={trendQuery.data.net_asset}
              />
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
            {holdingsQuery.isError && !isNetworkError(holdingsQuery.error) ? (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700">
                <p className="font-medium">资产数据加载失败</p>
                <p className="mt-1 text-xs text-rose-700/90">{friendlyError(holdingsQuery.error)}</p>
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
                {holdingsUnavailable ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      暂无数据
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
          {rebalanceQuery.data ? (
            <p className="text-xs text-muted-foreground">
              参与再平衡资产 {formatCurrency(rebalanceQuery.data.participating_amount, baseCurrency)}
              {' · '}
              已排除 {rebalanceQuery.data.excluded_count} 项 {formatCurrency(rebalanceQuery.data.excluded_amount, baseCurrency)}
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          {rebalanceQuery.isError && !isNetworkError(rebalanceQuery.error) ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700">
              <p className="font-medium">再平衡数据加载失败</p>
              <p className="mt-1 text-xs text-rose-700/90">{friendlyError(rebalanceQuery.error)}</p>
            </div>
          ) : null}
          {rebalanceUnavailable ? null : !rebalanceQuery.data?.valid ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
              <p className="font-medium">
                {rebalanceQuery.data?.reason === 'invalid_target_total'
                  ? '目标占比尚未配平'
                  : rebalanceQuery.data?.reason === 'zero_participating_amount'
                    ? '参与再平衡的资产金额为零'
                    : '尚未配置参与再平衡的资产'}
              </p>
              {rebalanceQuery.data?.reason === 'invalid_target_total' ? (
                <div className="mt-1 space-y-1 text-xs text-amber-800">
                  {rebalanceQuery.data.allocations.filter((allocation) => !allocation.valid).map((allocation) => (
                    <p key={allocation.member_id ?? 'family'}>
                      {allocation.member_name}：目标占比合计 {formatPercent(allocation.target_ratio_total)}，
                      {allocation.target_ratio_gap > 0 ? '尚缺' : '超出'} {formatPercent(Math.abs(allocation.target_ratio_gap))}。
                    </p>
                  ))}
                  <p>请修正为 100% 后查看调仓建议。</p>
                </div>
              ) : (
                <p className="mt-1 text-xs text-amber-800">
                  请为需要参与计算的资产设置大于 0% 的目标占比。
                </p>
              )}
              <Button className="mt-3" size="sm" variant="outline" onClick={() => navigate('/entry')}>
                去资产负债录入修正
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {rebalanceQuery.data.items.map((item) => (
                <div
                  key={item.id}
                  className="group rounded-2xl border border-border/60 bg-surface-subtle p-4 transition-all hover:bg-card hover:shadow-card"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <Badge variant={item.status === '超配' ? 'danger' : 'success'}>
                      {item.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.adjustment_amount >= 0 ? '建议增持' : '建议减持'}
                  </p>
                  <p className={cn(
                    'mt-1 text-xl font-semibold tabular-nums',
                    item.adjustment_amount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  )}>
                    {formatCurrency(Math.abs(item.adjustment_amount), baseCurrency)}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
                    <span>当前 {formatPercent(item.current_ratio)}</span>
                    <span>目标 {formatPercent(item.target_ratio)}</span>
                    <span>偏离 {formatPercent(item.deviation)}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs">
                    <div className="rounded-lg bg-background/70 p-2">
                      <p className="text-muted-foreground">当前金额</p>
                      <p className="mt-1 font-medium tabular-nums">
                        {formatCurrency(item.current_amount, baseCurrency)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-background/70 p-2">
                      <p className="text-muted-foreground">目标金额</p>
                      <p className="mt-1 font-medium tabular-nums">
                        {formatCurrency(item.target_amount, baseCurrency)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {rebalanceQuery.data.items.length === 0 ? (
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
    <Card className="surface-card-interactive">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </CardTitle>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-32" />
        ) : (
          <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">{value}</p>
        )}
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-medium',
              positive
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700'
            )}
          >
            {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {delta}
          </span>
          <span className="text-muted-foreground">对比上期</span>
        </div>
      </CardContent>
    </Card>
  );
}
