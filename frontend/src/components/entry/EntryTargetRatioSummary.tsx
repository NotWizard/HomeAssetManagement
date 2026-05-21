import { CheckCircle2, ChevronRight, Sparkles, TriangleAlert } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../lib/cn';
import {
  formatTargetRatioDelta,
  formatTargetRatioSummary,
  type MemberAllocationOverview,
  type MemberAllocationSummary,
} from './entryPageLogic';

type EntryTargetRatioSummaryProps = {
  hasLoadedHoldings: boolean;
  memberSummaries: MemberAllocationSummary[];
  overview: MemberAllocationOverview;
  focusedMemberId: number | null;
  onFocusMember: (memberId: number | null) => void;
  onOpenNormalize: (memberId: number) => void;
};

export function EntryTargetRatioSummary({
  hasLoadedHoldings,
  memberSummaries,
  overview,
  focusedMemberId,
  onFocusMember,
  onOpenNormalize,
}: EntryTargetRatioSummaryProps) {
  if (!hasLoadedHoldings || memberSummaries.length === 0) {
    return null;
  }

  const showableMembers = memberSummaries.filter((summary) => summary.hasAssets);
  if (showableMembers.length === 0) {
    return null;
  }

  return (
    <section
      className="mb-4 rounded-2xl border border-border/60 bg-muted/15 px-3 py-3 sm:px-4"
      aria-label="成员目标占比配平概览"
    >
      <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-medium tracking-[0.14em] text-muted-foreground">成员目标占比配平</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            每位成员的资产期望占比应合计为 100%。点击卡片可定位到对应分组，超出/未达时可一键归一化。
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="success" className="font-semibold">已达标 {overview.balanced}</Badge>
          <Badge variant="warning" className="font-semibold">未达标 {overview.underAllocated}</Badge>
          <Badge variant="danger" className="font-semibold">已超出 {overview.overAllocated}</Badge>
          {focusedMemberId != null ? (
            <Button variant="ghost" size="sm" onClick={() => onFocusMember(null)}>
              清除聚焦
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {showableMembers.map((summary) => (
          <MemberAllocationCard
            key={summary.memberId}
            summary={summary}
            focused={focusedMemberId === summary.memberId}
            onFocus={() =>
              onFocusMember(focusedMemberId === summary.memberId ? null : summary.memberId)
            }
            onNormalize={() => onOpenNormalize(summary.memberId)}
          />
        ))}
      </div>
    </section>
  );
}

type MemberAllocationCardProps = {
  summary: MemberAllocationSummary;
  focused: boolean;
  onFocus: () => void;
  onNormalize: () => void;
};

function MemberAllocationCard({ summary, focused, onFocus, onNormalize }: MemberAllocationCardProps) {
  const StatusIcon = summary.status.label === '已达标' ? CheckCircle2 : TriangleAlert;
  const totalLabel = formatTargetRatioSummary(summary.totalRatio);
  const progressClampedRatio = Math.max(0, Math.min(summary.totalRatio, 150));
  const progressBarRatio = Math.min(100, progressClampedRatio);
  const overflowBarRatio = Math.max(0, progressClampedRatio - 100);
  const barColor =
    summary.status.label === '已达标'
      ? 'bg-emerald-400'
      : summary.status.label === '未达标'
        ? 'bg-amber-400'
        : 'bg-rose-400';

  return (
    <article
      className={cn(
        'rounded-xl border bg-background/95 px-3.5 py-3 transition-colors',
        focused
          ? 'border-primary/60 ring-1 ring-primary/40 shadow-soft'
          : 'border-border/70 hover:border-primary/40'
      )}
    >
      <button
        type="button"
        onClick={onFocus}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-pressed={focused}
        aria-label={
          focused ? `已聚焦到 ${summary.memberName}，再次点击清除` : `聚焦到 ${summary.memberName}`
        }
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <span className="truncate">{summary.memberName}</span>
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 transition-transform',
                focused ? 'rotate-90 text-primary' : 'text-muted-foreground/70'
              )}
            />
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {summary.assetCount} 项资产 · {summary.withTargetCount} 已设期望
          </div>
        </div>
        <Badge
          className={cn('font-semibold whitespace-nowrap', summary.status.badgeClassName)}
        >
          <StatusIcon className="h-3 w-3" />
          {summary.status.label}
        </Badge>
      </button>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold leading-none tracking-tight">{totalLabel}</div>
          <div className={cn('mt-1 text-xs font-medium', summary.status.detailClassName)}>
            {summary.status.label === '已达标'
              ? '已达 100.0%'
              : summary.delta > 0
                ? `还差 ${formatTargetRatioDelta(summary.delta)}`
                : `超出 ${formatTargetRatioDelta(summary.delta)}`}
          </div>
        </div>
        <Button
          variant={summary.needsAdjustment ? 'default' : 'outline'}
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onNormalize();
          }}
          disabled={summary.assetCount === 0}
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          {summary.needsAdjustment ? '一键归一化' : '重新配比'}
        </Button>
      </div>

      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full transition-all', barColor)}
          style={{ width: `${progressBarRatio}%` }}
        />
        {overflowBarRatio > 0 ? (
          <div
            className="h-full bg-rose-300/90 transition-all"
            style={{ width: `${(overflowBarRatio / 1.5).toFixed(2)}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </article>
  );
}
