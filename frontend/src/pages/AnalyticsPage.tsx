import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Coins, Sparkles } from 'lucide-react';

import { AnalyticsDateRangePicker } from '../components/analytics/AnalyticsDateRangePicker';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Select } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  fetchCorrelation,
  fetchCurrencyOverview,
  fetchRebalance,
  fetchSankey,
  fetchTrend,
  fetchVolatility,
} from '../services/analytics';
import { fetchSettings } from '../services/settings';
import { type AnalyticsView, useUIStore } from '../store/uiStore';
import { formatCurrency, formatPercent } from '../utils/format';

const VIEW_OPTIONS: Array<{ value: AnalyticsView; label: string; description: string }> = [
  { value: 'overview', label: '整体概览', description: '查看家庭资产负债全貌，包括趋势变化和结构流向。' },
  { value: 'risk', label: '风险与配置', description: '关注波动、相关性以及当前配置是否偏离目标。' },
  { value: 'currency', label: '币种总览', description: '按币种查看资产、负债、净资产和各项条目的占比。' },
];

const TrendChart = lazy(() => import('../components/charts/TrendChart').then((module) => ({ default: module.TrendChart })));
const VolatilityChart = lazy(() => import('../components/charts/VolatilityChart').then((module) => ({ default: module.VolatilityChart })));
const CorrelationHeatmap = lazy(() =>
  import('../components/charts/CorrelationHeatmap').then((module) => ({ default: module.CorrelationHeatmap }))
);
const SankeyChart = lazy(() => import('../components/charts/SankeyChart').then((module) => ({ default: module.SankeyChart })));
const CurrencyExposureChart = lazy(() =>
  import('../components/charts/CurrencyExposureChart').then((module) => ({ default: module.CurrencyExposureChart }))
);
const CurrencyBreakdownChart = lazy(() =>
  import('../components/charts/CurrencyBreakdownChart').then((module) => ({ default: module.CurrencyBreakdownChart }))
);

const CURRENCY_LABELS: Record<string, string> = {
  CNY: 'CNY（人民币）',
  USD: 'USD（美元）',
  EUR: 'EUR（欧元）',
  HKD: 'HKD（港币）',
  JPY: 'JPY（日元）',
  GBP: 'GBP（英镑）',
  AUD: 'AUD（澳元）',
  CAD: 'CAD（加拿大元）',
  CHF: 'CHF（瑞士法郎）',
  SGD: 'SGD（新加坡元）',
};

export function AnalyticsPage() {
  const analyticsDateRange = useUIStore((state) => state.analyticsDateRange);
  const analyticsView = useUIStore((state) => state.analyticsView);
  const selectedCurrency = useUIStore((state) => state.selectedAnalyticsCurrency);
  const setAnalyticsDateRange = useUIStore((state) => state.setAnalyticsDateRange);
  const setAnalyticsView = useUIStore((state) => state.setAnalyticsView);
  const setSelectedAnalyticsCurrency = useUIStore((state) => state.setSelectedAnalyticsCurrency);

  const handleStartDateChange = (startDate: string) => {
    if (!startDate) {
      return;
    }
    setAnalyticsDateRange({
      startDate,
      endDate: startDate > analyticsDateRange.endDate ? startDate : analyticsDateRange.endDate,
    });
  };

  const handleEndDateChange = (endDate: string) => {
    if (!endDate) {
      return;
    }
    setAnalyticsDateRange({
      startDate: endDate < analyticsDateRange.startDate ? endDate : analyticsDateRange.startDate,
      endDate,
    });
  };

  const trendQuery = useQuery({
    queryKey: ['trend', analyticsDateRange.startDate, analyticsDateRange.endDate],
    queryFn: () => fetchTrend(analyticsDateRange),
    enabled: analyticsView === 'overview',
  });
  const volatilityQuery = useQuery({
    queryKey: ['volatility', analyticsDateRange.startDate, analyticsDateRange.endDate],
    queryFn: () => fetchVolatility(analyticsDateRange),
    enabled: analyticsView === 'risk',
  });
  const correlationQuery = useQuery({
    queryKey: ['correlation', analyticsDateRange.startDate, analyticsDateRange.endDate],
    queryFn: () => fetchCorrelation(analyticsDateRange),
    enabled: analyticsView === 'risk',
  });
  const sankeyQuery = useQuery({
    queryKey: ['sankey'],
    queryFn: fetchSankey,
    enabled: analyticsView === 'overview',
  });
  const rebalanceQuery = useQuery({
    queryKey: ['rebalance'],
    queryFn: fetchRebalance,
    enabled: analyticsView === 'risk',
  });
  const currencyOverviewQuery = useQuery({
    queryKey: ['currency-overview'],
    queryFn: fetchCurrencyOverview,
    enabled: analyticsView === 'currency',
  });
  const settingsQuery = useQuery({
    queryKey: ['settings', 'analytics'],
    queryFn: fetchSettings,
    enabled: analyticsView === 'currency',
  });

  const currencySummaries = currencyOverviewQuery.data?.currencies ?? [];
  const selectedSummary = selectedCurrency ? currencyOverviewQuery.data?.details[selectedCurrency]?.summary : undefined;
  const selectedDetail = selectedCurrency ? currencyOverviewQuery.data?.details[selectedCurrency] : undefined;
  const currentView = VIEW_OPTIONS.find((item) => item.value === analyticsView) ?? VIEW_OPTIONS[0];

  useEffect(() => {
    if (analyticsView !== 'currency') {
      return;
    }
    if (currencySummaries.length === 0) {
      if (selectedCurrency) {
        setSelectedAnalyticsCurrency('');
      }
      return;
    }
    if (!selectedCurrency || !currencySummaries.some((item) => item.currency === selectedCurrency)) {
      setSelectedAnalyticsCurrency(currencySummaries[0].currency);
    }
  }, [analyticsView, currencySummaries, selectedCurrency, setSelectedAnalyticsCurrency]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">分析看板</h2>
          <p className="text-sm text-muted-foreground">从整体概览、风险配置和币种总览三个视角查看家庭资产负债</p>
        </div>
        {analyticsView === 'currency' ? (
          currencySummaries.length > 0 ? (
            <Select
              className="w-56"
              value={selectedCurrency}
              onChange={(event) => setSelectedAnalyticsCurrency(String(event.target.value))}
              options={currencySummaries.map((item) => ({
                value: item.currency,
                label: formatCurrencyLabel(item.currency),
              }))}
            />
          ) : (
            <div className="inline-flex h-10 items-center rounded-lg border bg-card px-3 text-sm text-muted-foreground">
              暂无可选币种
            </div>
          )
        ) : (
          <AnalyticsDateRangePicker
            startDate={analyticsDateRange.startDate}
            endDate={analyticsDateRange.endDate}
            onStartDateChange={handleStartDateChange}
            onEndDateChange={handleEndDateChange}
          />
        )}
      </div>

      <Card className="border-dashed bg-secondary/25">
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2">
            {VIEW_OPTIONS.map((item) => (
              <Button
                key={item.value}
                variant={analyticsView === item.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAnalyticsView(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{currentView.description}</p>
        </CardContent>
      </Card>

      {analyticsView === 'overview' ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">总资产趋势</CardTitle>
              <CardDescription>从时间维度查看总资产、总负债与净资产的变化。</CardDescription>
            </CardHeader>
            <CardContent>
              {(trendQuery.data?.dates.length ?? 0) > 0 ? (
                <Suspense fallback={<Skeleton className="h-[360px] w-full" />}>
                  <TrendChart
                    dates={trendQuery.data?.dates ?? []}
                    totalAsset={trendQuery.data?.total_asset ?? []}
                    totalLiability={trendQuery.data?.total_liability ?? []}
                    netAsset={trendQuery.data?.net_asset ?? []}
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
              {(sankeyQuery.data?.nodes.length ?? 0) > 0 ? (
                <Suspense fallback={<Skeleton className="h-[460px] w-full" />}>
                  <SankeyChart data={sankeyQuery.data ?? { nodes: [], links: [] }} />
                </Suspense>
              ) : (
                <EmptyState icon={<Coins className="h-5 w-5 text-primary" />} text="暂无结构数据，录入资产负债后即可查看。" />
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {analyticsView === 'risk' ? (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">资产波动率</CardTitle>
                <CardDescription>帮助识别当前组合中波动更高的资产项。</CardDescription>
              </CardHeader>
              <CardContent>
                {(volatilityQuery.data ?? []).length > 0 ? (
                  <Suspense fallback={<Skeleton className="h-[320px] w-full" />}>
                    <VolatilityChart data={volatilityQuery.data ?? []} />
                  </Suspense>
                ) : (
                  <EmptyState icon={<AlertTriangle className="h-5 w-5 text-amber-500" />} text="数据样本不足，暂时无法计算波动率。" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">再平衡提醒</CardTitle>
                <CardDescription>查看哪些资产当前偏离了设定的目标占比。</CardDescription>
              </CardHeader>
              <CardContent>
                {(rebalanceQuery.data ?? []).length === 0 ? (
                  <EmptyState icon={<Sparkles className="h-5 w-5 text-primary" />} text="当前配置在阈值范围内。" />
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

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">相关性矩阵</CardTitle>
              <CardDescription>观察资产之间的联动程度，辅助分散配置决策。</CardDescription>
            </CardHeader>
            <CardContent>
              {(correlationQuery.data?.assets.length ?? 0) < 2 ? (
                <EmptyState icon={<AlertTriangle className="h-5 w-5 text-amber-500" />} text="数据样本不足，无法计算相关性矩阵。" />
              ) : (
                <Suspense fallback={<Skeleton className="h-[420px] w-full" />}>
                  <CorrelationHeatmap data={correlationQuery.data!} />
                </Suspense>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {analyticsView === 'currency' ? (
        <div className="space-y-4">
          {currencyOverviewQuery.isLoading ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">正在加载币种汇总...</CardContent>
            </Card>
          ) : currencySummaries.length === 0 || !selectedSummary || !selectedDetail ? (
            <Card>
              <CardContent className="p-8">
                <EmptyState icon={<Coins className="h-5 w-5 text-primary" />} text="暂无币种汇总数据，录入资产负债后即可查看。" />
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  title="总资产"
                  value={formatCurrency(selectedSummary.total_asset, selectedSummary.currency)}
                  delta="选中币种资产总额"
                  positive
                />
                <MetricCard
                  title="总负债"
                  value={formatCurrency(selectedSummary.total_liability, selectedSummary.currency)}
                  delta="选中币种负债总额"
                  positive={false}
                />
                <MetricCard
                  title="净资产"
                  value={formatCurrency(selectedSummary.net_asset, selectedSummary.currency)}
                  delta="资产减去负债后的净敞口"
                  positive={selectedSummary.net_asset >= 0}
                />
                <MetricCard
                  title="条目数"
                  value={String(selectedSummary.asset_count + selectedSummary.liability_count)}
                  delta={`资产 ${selectedSummary.asset_count} / 负债 ${selectedSummary.liability_count}`}
                  positive
                />
              </div>

              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm">各币种资产负债对比</CardTitle>
                  <CardDescription>
                    为便于跨币种比较，这里统一按基准币 {settingsQuery.data?.base_currency ?? 'CNY'} 折算展示。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Suspense fallback={<Skeleton className="h-[360px] w-full" />}>
                    <CurrencyExposureChart
                      data={currencySummaries}
                      baseCurrency={settingsQuery.data?.base_currency ?? 'CNY'}
                    />
                  </Suspense>
                </CardContent>
              </Card>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm">{formatCurrencyLabel(selectedSummary.currency)}资产构成</CardTitle>
                    <CardDescription>查看该币种下每项资产占总资产的比例。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Suspense fallback={<Skeleton className="h-[360px] w-full" />}>
                      <CurrencyBreakdownChart
                        currency={selectedSummary.currency}
                        items={selectedDetail.asset_breakdown}
                        emptyText="当前币种下暂无资产"
                      />
                    </Suspense>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm">{formatCurrencyLabel(selectedSummary.currency)}负债构成</CardTitle>
                    <CardDescription>查看该币种下每项负债占总负债的比例。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Suspense fallback={<Skeleton className="h-[360px] w-full" />}>
                      <CurrencyBreakdownChart
                        currency={selectedSummary.currency}
                        items={selectedDetail.liability_breakdown}
                        emptyText="当前币种下暂无负债"
                      />
                    </Suspense>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm">{formatCurrencyLabel(selectedSummary.currency)}明细表</CardTitle>
                  <CardDescription>查看该币种下各项资产与负债的分类路径、金额和占比。</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>三级分类路径</TableHead>
                        <TableHead className="text-right">原币金额</TableHead>
                        <TableHead className="text-right">占比</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedDetail.items.map((item) => (
                        <TableRow key={`${item.type}-${item.id}`}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>
                            <Badge variant={item.type === 'asset' ? 'success' : 'danger'}>
                              {item.type === 'asset' ? '资产' : '负债'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{item.category_path || '—'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.amount_original, item.currency)}</TableCell>
                          <TableCell className="text-right">{formatPercent(item.share_pct)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({
  title,
  value,
  delta,
  positive,
}: {
  title: string;
  value: string;
  delta: string;
  positive: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="mt-2 text-xs">
          <span className={positive ? 'text-emerald-600' : 'text-rose-600'}>{delta}</span>
        </p>
      </CardContent>
    </Card>
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

function formatCurrencyLabel(currency: string) {
  return CURRENCY_LABELS[currency] ?? `${currency}（当前币种）`;
}
