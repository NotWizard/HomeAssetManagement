import { Suspense, lazy, type ReactNode } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import type { CorrelationData, RebalanceItem, VolatilityItem } from '../../services/analytics';
import { formatPercent } from '../../utils/format';

const VolatilityChart = lazy(() => import('../charts/VolatilityChart').then((module) => ({ default: module.VolatilityChart })));
const CorrelationHeatmap = lazy(() =>
  import('../charts/CorrelationHeatmap').then((module) => ({ default: module.CorrelationHeatmap }))
);

type RiskAnalyticsSectionProps = {
  volatilityData?: VolatilityItem[];
  volatilityError: unknown;
  volatilityIsError: boolean;
  correlationData?: CorrelationData;
  correlationError: unknown;
  correlationIsError: boolean;
  rebalanceData?: RebalanceItem[];
  rebalanceError: unknown;
  rebalanceIsError: boolean;
};

export function RiskAnalyticsSection({
  volatilityData,
  volatilityError,
  volatilityIsError,
  correlationData,
  correlationError,
  correlationIsError,
  rebalanceData,
  rebalanceError,
  rebalanceIsError,
}: RiskAnalyticsSectionProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">资产波动率</CardTitle>
            <CardDescription>帮助识别当前组合中波动更高的资产项。</CardDescription>
          </CardHeader>
          <CardContent>
            {volatilityIsError ? (
              <ErrorState text={`波动率数据加载失败：${formatError(volatilityError)}`} />
            ) : (volatilityData ?? []).length > 0 ? (
              <Suspense fallback={<Skeleton className="h-[320px] w-full" />}>
                <VolatilityChart data={volatilityData ?? []} />
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
            {rebalanceIsError ? (
              <ErrorState text={`再平衡提醒加载失败：${formatError(rebalanceError)}`} />
            ) : (rebalanceData ?? []).length === 0 ? (
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
                  {(rebalanceData ?? []).map((row) => (
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
          {correlationIsError ? (
            <ErrorState text={`相关性矩阵加载失败：${formatError(correlationError)}`} />
          ) : (correlationData?.assets.length ?? 0) < 2 ? (
            <EmptyState icon={<AlertTriangle className="h-5 w-5 text-amber-500" />} text="数据样本不足，无法计算相关性矩阵。" />
          ) : (
            <Suspense fallback={<Skeleton className="h-[420px] w-full" />}>
              <CorrelationHeatmap data={correlationData!} />
            </Suspense>
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
