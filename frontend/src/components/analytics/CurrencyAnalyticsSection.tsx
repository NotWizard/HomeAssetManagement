import { Suspense, lazy, type ReactNode } from 'react';
import { Coins } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import type { CurrencyOverviewDetail, CurrencySummary } from '../../services/analytics';
import { formatCurrency, formatPercent } from '../../utils/format';

const CurrencyExposureChart = lazy(() =>
  import('../charts/CurrencyExposureChart').then((module) => ({ default: module.CurrencyExposureChart }))
);
const CurrencyBreakdownChart = lazy(() =>
  import('../charts/CurrencyBreakdownChart').then((module) => ({ default: module.CurrencyBreakdownChart }))
);

type CurrencyAnalyticsSectionProps = {
  currencySummaries: CurrencySummary[];
  selectedSummary?: CurrencySummary;
  selectedDetail?: CurrencyOverviewDetail;
  currencyOverviewError: unknown;
  currencyOverviewIsError: boolean;
  currencyOverviewIsLoading: boolean;
  baseCurrency: string;
};

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

export function CurrencyAnalyticsSection({
  currencySummaries,
  selectedSummary,
  selectedDetail,
  currencyOverviewError,
  currencyOverviewIsError,
  currencyOverviewIsLoading,
  baseCurrency,
}: CurrencyAnalyticsSectionProps) {
  if (currencyOverviewIsError) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-8">
            <ErrorState text={`币种汇总加载失败：${formatError(currencyOverviewError)}`} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currencyOverviewIsLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">正在加载币种汇总...</CardContent>
        </Card>
      </div>
    );
  }

  if (currencySummaries.length === 0 || !selectedSummary || !selectedDetail) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-8">
            <EmptyState icon={<Coins className="h-5 w-5 text-primary" />} text="暂无币种汇总数据，录入资产负债后即可查看。" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
          <CardDescription>为便于跨币种比较，这里统一按基准币 {baseCurrency} 折算展示。</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-[360px] w-full" />}>
            <CurrencyExposureChart data={currencySummaries} baseCurrency={baseCurrency} />
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

function ErrorState({ text }: { text: string }) {
  return <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-6 text-center text-sm text-rose-700">{text}</div>;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : '请求失败';
}

function formatCurrencyLabel(currency: string) {
  return CURRENCY_LABELS[currency] ?? `${currency}（当前币种）`;
}
