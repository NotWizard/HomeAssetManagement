import { type ReactNode, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, CalendarDays, Globe, Wallet } from 'lucide-react';

import { TrendChart } from '../components/charts/TrendChart';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { fetchRebalance, fetchTrend } from '../services/analytics';
import { fetchHoldings } from '../services/holdings';
import { formatCurrency, formatPercent } from '../utils/format';

export function OverviewPage() {
  const trendQuery = useQuery({ queryKey: ['trend', 'overview'], queryFn: () => fetchTrend(90) });
  const holdingsQuery = useQuery({ queryKey: ['holdings', 'overview'], queryFn: fetchHoldings });
  const rebalanceQuery = useQuery({ queryKey: ['rebalance', 'overview'], queryFn: fetchRebalance });

  const latest = useMemo(() => {
    if (!trendQuery.data || trendQuery.data.net_asset.length === 0) {
      return { totalAsset: 0, totalLiability: 0, netAsset: 0 };
    }
    const index = trendQuery.data.net_asset.length - 1;
    return {
      totalAsset: trendQuery.data.total_asset[index],
      totalLiability: trendQuery.data.total_liability[index],
      netAsset: trendQuery.data.net_asset[index],
    };
  }, [trendQuery.data]);

  const topAssets = useMemo(() => {
    return (holdingsQuery.data ?? [])
      .filter((row) => row.type === 'asset')
      .sort((a, b) => b.amount_base - a.amount_base)
      .slice(0, 5);
  }, [holdingsQuery.data]);

  const loading = trendQuery.isLoading || holdingsQuery.isLoading;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Overview</h2>
          <p className="text-sm text-muted-foreground">家庭资产与负债关键指标概览</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select
            className="w-full sm:w-36"
            options={[{ label: 'Currency: CNY', value: 'CNY' }, { label: 'Currency: USD', value: 'USD' }]}
            defaultValue="CNY"
          />
          <Select
            className="w-full sm:w-36"
            options={[{ label: 'Assets: All', value: 'all' }, { label: 'Assets: Core', value: 'core' }]}
            defaultValue="all"
          />
          <button className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            最近 90 天
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="净资产" value={formatCurrency(latest.netAsset)} delta="+12.4%" positive icon={<Wallet className="h-4 w-4" />} loading={loading} />
        <MetricCard title="总资产" value={formatCurrency(latest.totalAsset)} delta="+9.8%" positive icon={<ArrowUpRight className="h-4 w-4" />} loading={loading} />
        <MetricCard title="总负债" value={formatCurrency(latest.totalLiability)} delta="-2.1%" positive icon={<ArrowDownRight className="h-4 w-4" />} loading={loading} />
        <MetricCard title="基准币" value="CNY" delta="实时汇率折算" positive icon={<Globe className="h-4 w-4" />} loading={false} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">资产总览趋势</CardTitle>
          </CardHeader>
          <CardContent>
            {trendQuery.data ? (
              <TrendChart
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>资产</TableHead>
                  <TableHead className="text-right">折算金额</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topAssets.length > 0 ? (
                  topAssets.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.currency}</p>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(item.amount_base)}</TableCell>
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
