import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { AnalyticsDateRangePicker } from '../components/analytics/AnalyticsDateRangePicker';
import { CurrencyAnalyticsSection } from '../components/analytics/CurrencyAnalyticsSection';
import { OverviewAnalyticsSection } from '../components/analytics/OverviewAnalyticsSection';
import { RiskAnalyticsSection } from '../components/analytics/RiskAnalyticsSection';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Select } from '../components/ui/select';
import { queryKeys } from '../services/holdingRelatedQueries';
import {
  fetchAnalyticsDateBounds,
  fetchCorrelation,
  fetchCurrencyOverview,
  fetchRebalance,
  fetchSankey,
  fetchTrend,
  fetchVolatility,
} from '../services/analytics';
import { fetchSettings } from '../services/settings';
import { type AnalyticsView, useUIStore } from '../store/uiStore';

const VIEW_OPTIONS: Array<{ value: AnalyticsView; label: string; description: string }> = [
  { value: 'overview', label: '整体概览', description: '查看家庭资产负债全貌，包括趋势变化和结构流向。' },
  { value: 'risk', label: '风险与配置', description: '关注波动、相关性以及当前配置是否偏离目标。' },
  { value: 'currency', label: '币种总览', description: '按币种查看资产、负债、净资产和各项条目的占比。' },
];

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
  const storedAnalyticsDateRange = useUIStore((state) => state.analyticsDateRange);
  const analyticsDateRangeInitialized = useUIStore((state) => state.analyticsDateRangeInitialized);
  const analyticsView = useUIStore((state) => state.analyticsView);
  const selectedCurrency = useUIStore((state) => state.selectedAnalyticsCurrency);
  const setAnalyticsDateRange = useUIStore((state) => state.setAnalyticsDateRange);
  const setAnalyticsView = useUIStore((state) => state.setAnalyticsView);
  const setSelectedAnalyticsCurrency = useUIStore((state) => state.setSelectedAnalyticsCurrency);

  const analyticsDateBoundsQuery = useQuery({
    queryKey: queryKeys.analyticsDateBounds.all(),
    queryFn: fetchAnalyticsDateBounds,
    enabled: analyticsView !== 'currency',
  });

  const analyticsDateRange =
    analyticsDateRangeInitialized || !analyticsDateBoundsQuery.data
      ? storedAnalyticsDateRange
      : {
          startDate: analyticsDateBoundsQuery.data?.start_date ?? '',
          endDate: analyticsDateBoundsQuery.data?.end_date ?? '',
        };
  const analyticsDateRangeReady = Boolean(analyticsDateRange.startDate && analyticsDateRange.endDate);

  useEffect(() => {
    if (analyticsDateRangeInitialized || !analyticsDateBoundsQuery.data) {
      return;
    }
    setAnalyticsDateRange({
      startDate: analyticsDateBoundsQuery.data.start_date,
      endDate: analyticsDateBoundsQuery.data.end_date,
    });
  }, [analyticsDateBoundsQuery.data, analyticsDateRangeInitialized, setAnalyticsDateRange]);

  const handleRangeChange = (nextRange: { startDate: string; endDate: string }) => {
    setAnalyticsDateRange(nextRange);
  };

  const handleStartDateChange = (startDate: string) => {
    if (!startDate) {
      return;
    }
    setAnalyticsDateRange({
      startDate,
      endDate: !analyticsDateRange.endDate || startDate > analyticsDateRange.endDate ? startDate : analyticsDateRange.endDate,
    });
  };

  const handleEndDateChange = (endDate: string) => {
    if (!endDate) {
      return;
    }
    setAnalyticsDateRange({
      startDate: !analyticsDateRange.startDate || endDate < analyticsDateRange.startDate ? endDate : analyticsDateRange.startDate,
      endDate,
    });
  };

  const trendQuery = useQuery({
    queryKey: queryKeys.trend.range(analyticsDateRange),
    queryFn: () => fetchTrend(analyticsDateRange),
    enabled: analyticsView === 'overview' && analyticsDateRangeReady,
  });
  const volatilityQuery = useQuery({
    queryKey: queryKeys.volatility.range(analyticsDateRange),
    queryFn: () => fetchVolatility(analyticsDateRange),
    enabled: analyticsView === 'risk' && analyticsDateRangeReady,
  });
  const correlationQuery = useQuery({
    queryKey: queryKeys.correlation.range(analyticsDateRange),
    queryFn: () => fetchCorrelation(analyticsDateRange),
    enabled: analyticsView === 'risk' && analyticsDateRangeReady,
  });
  const sankeyQuery = useQuery({
    queryKey: queryKeys.sankey.range(analyticsDateRange),
    queryFn: () => fetchSankey(analyticsDateRange),
    enabled: analyticsView === 'overview' && analyticsDateRangeReady,
  });
  const rebalanceQuery = useQuery({
    queryKey: queryKeys.rebalance.range(analyticsDateRange),
    queryFn: () => fetchRebalance(analyticsDateRange),
    enabled: analyticsView === 'risk' && analyticsDateRangeReady,
  });
  const currencyOverviewQuery = useQuery({
    queryKey: queryKeys.currencyOverview.all(),
    queryFn: fetchCurrencyOverview,
    enabled: analyticsView === 'currency',
  });
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.scope('analytics'),
    queryFn: fetchSettings,
    enabled: analyticsView === 'currency',
  });

  const currencySummaries = currencyOverviewQuery.data?.currencies ?? [];
  const selectedSummary = selectedCurrency ? currencyOverviewQuery.data?.details[selectedCurrency]?.summary : undefined;
  const selectedDetail = selectedCurrency ? currencyOverviewQuery.data?.details[selectedCurrency] : undefined;
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
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold">分析看板</h2>
          <p className="text-sm text-muted-foreground">从整体概览、风险配置和币种总览三个视角查看家庭资产负债</p>
        </div>

        <div className="min-w-0 xl:ml-6 xl:flex xl:flex-shrink-0 xl:justify-end">
          {analyticsView === 'currency' ? (
            currencySummaries.length > 0 ? (
              <div className="flex flex-col gap-3 rounded-[22px] bg-slate-100/85 p-2.5 sm:flex-row sm:items-center">
                <div className="min-w-0 px-2 py-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">筛选币种</p>
                  <p className="mt-1 text-xs text-slate-500">切换后方卡片与图表会同步更新。</p>
                </div>
                <Select
                  className="h-11 rounded-2xl border-0 bg-white text-sm font-medium shadow-[0_14px_28px_-24px_rgba(15,23,42,0.45)] sm:ml-auto sm:w-[220px]"
                  value={selectedCurrency}
                  onChange={(event) => setSelectedAnalyticsCurrency(String(event.target.value))}
                  options={currencySummaries.map((item) => ({
                    value: item.currency,
                    label: formatCurrencyLabel(item.currency),
                  }))}
                />
              </div>
            ) : (
              <div className="inline-flex h-11 w-full items-center rounded-2xl bg-slate-100/85 px-4 text-sm text-muted-foreground">
                暂无可选币种
              </div>
            )
          ) : (
            <AnalyticsDateRangePicker
              startDate={analyticsDateRange.startDate}
              endDate={analyticsDateRange.endDate}
              minDate={analyticsDateBoundsQuery.data?.start_date ?? analyticsDateRange.startDate}
              maxDate={analyticsDateBoundsQuery.data?.end_date ?? analyticsDateRange.endDate}
              onStartDateChange={handleStartDateChange}
              onEndDateChange={handleEndDateChange}
              onRangeChange={handleRangeChange}
            />
          )}
        </div>
      </div>

      <Card className="border-slate-200/70 bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] shadow-[0_24px_60px_-38px_rgba(15,23,42,0.28)]">
        <CardContent className="p-4 lg:p-5">
          <div className="min-w-0 flex-1">
            <div className="inline-flex w-fit flex-wrap items-center gap-1 rounded-[20px] bg-slate-100/88 p-1.5">
              {VIEW_OPTIONS.map((item) => (
                <Button
                  key={item.value}
                  variant={analyticsView === item.value ? 'default' : 'ghost'}
                  size="sm"
                  className={
                    analyticsView === item.value
                      ? 'rounded-2xl px-4 shadow-[0_12px_24px_-18px_rgba(79,70,229,0.95)]'
                      : 'rounded-2xl px-4 text-slate-600 hover:bg-white hover:text-slate-900'
                  }
                  onClick={() => setAnalyticsView(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {analyticsView === 'overview' ? (
        <OverviewAnalyticsSection
          trendData={trendQuery.data}
          trendError={trendQuery.error}
          trendIsError={trendQuery.isError}
          sankeyData={sankeyQuery.data}
          sankeyError={sankeyQuery.error}
          sankeyIsError={sankeyQuery.isError}
        />
      ) : null}

      {analyticsView === 'risk' ? (
        <RiskAnalyticsSection
          volatilityData={volatilityQuery.data}
          volatilityError={volatilityQuery.error}
          volatilityIsError={volatilityQuery.isError}
          correlationData={correlationQuery.data}
          correlationError={correlationQuery.error}
          correlationIsError={correlationQuery.isError}
          rebalanceData={rebalanceQuery.data}
          rebalanceError={rebalanceQuery.error}
          rebalanceIsError={rebalanceQuery.isError}
        />
      ) : null}

      {analyticsView === 'currency' ? (
        <CurrencyAnalyticsSection
          currencySummaries={currencySummaries}
          selectedSummary={selectedSummary}
          selectedDetail={selectedDetail}
          currencyOverviewError={currencyOverviewQuery.error}
          currencyOverviewIsError={currencyOverviewQuery.isError}
          currencyOverviewIsLoading={currencyOverviewQuery.isLoading}
          baseCurrency={settingsQuery.data?.base_currency ?? 'CNY'}
        />
      ) : null}
    </div>
  );
}

function formatCurrencyLabel(currency: string) {
  return CURRENCY_LABELS[currency] ?? `${currency}（当前币种）`;
}
