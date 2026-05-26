import { memo, type MouseEvent } from 'react';
import { CheckCircle2, ChevronRight, Sparkles, TriangleAlert } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../lib/cn';
import {
  formatAllocationDeviation,
  hasMemberAllocationImbalance,
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

function EntryTargetRatioSummaryBase({
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

  // 全部达标稳态：整块返回 null（标题/说明/徽章/卡片全部 0 高度）。
  // 表格组首已经能让用户在该情境下查看 + 触发每个成员的合计与配比，无需顶部冗余露出。
  // 仅当出现 未达标 / 已超出 时才展开，作为"信号化"提醒；展开时仍渲染所有成员卡片以便对照。
  if (!hasMemberAllocationImbalance(overview)) {
    return null;
  }

  return (
    <section
      className="mb-4 rounded-2xl border border-amber-200/70 bg-amber-50/40 px-3 py-3 sm:px-4"
      aria-label="成员目标占比配平概览"
    >
      <header className="mb-2 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-[0.14em] text-amber-700">
            成员目标占比待配平
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            部分成员资产期望占比未合计为 100%，点击卡片可定位到对应分组。
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {overview.balanced > 0 ? (
            <Badge variant="success" className="font-semibold">
              已达标 {overview.balanced}
            </Badge>
          ) : null}
          {overview.underAllocated > 0 ? (
            <Badge variant="warning" className="font-semibold">
              未达标 {overview.underAllocated}
            </Badge>
          ) : null}
          {overview.overAllocated > 0 ? (
            <Badge variant="danger" className="font-semibold">
              已超出 {overview.overAllocated}
            </Badge>
          ) : null}
          {focusedMemberId != null ? (
            <Button variant="ghost" size="sm" onClick={() => onFocusMember(null)}>
              清除聚焦
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {showableMembers.map((summary) => (
          <MemberAllocationCard
            key={summary.memberId}
            summary={summary}
            focused={focusedMemberId === summary.memberId}
            focusedMemberId={focusedMemberId}
            onFocusMember={onFocusMember}
            onOpenNormalize={onOpenNormalize}
          />
        ))}
      </div>
    </section>
  );
}

// memo 包装：父 EntryPage 因 form 编辑 / 输入触发的频繁重渲染，只要 summaries / overview
// 与稳定 handler 引用不变就能短路。需配合 EntryPage 端 useCallback 稳定化 onFocusMember
// / onOpenNormalize。
export const EntryTargetRatioSummary = memo(EntryTargetRatioSummaryBase);

type MemberAllocationCardProps = {
  summary: MemberAllocationSummary;
  focused: boolean;
  focusedMemberId: number | null;
  onFocusMember: (memberId: number | null) => void;
  onOpenNormalize: (memberId: number) => void;
};

function MemberAllocationCardBase({
  summary,
  focused,
  focusedMemberId,
  onFocusMember,
  onOpenNormalize,
}: MemberAllocationCardProps) {
  const isBalanced = summary.status.label === '已达标';
  const isOverAllocated = summary.status.label === '已超出';
  const StatusIcon = isBalanced ? CheckCircle2 : TriangleAlert;
  const deviationLabel = formatAllocationDeviation(summary.delta);
  const badgeText = isBalanced || deviationLabel === null ? '已达标' : deviationLabel;

  const progressClampedRatio = Math.max(0, Math.min(summary.totalRatio, 150));
  const progressBarRatio = Math.min(100, progressClampedRatio);
  const overflowBarRatio = Math.max(0, progressClampedRatio - 100);
  const barColor = isBalanced
    ? 'bg-emerald-400'
    : !isOverAllocated
      ? 'bg-amber-400'
      : 'bg-rose-400';

  const handleFocusClick = () => {
    onFocusMember(focusedMemberId === summary.memberId ? null : summary.memberId);
  };
  const handleNormalizeClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenNormalize(summary.memberId);
  };

  return (
    <article
      className={cn(
        'rounded-xl border bg-background/95 px-3 py-2 transition-colors',
        focused
          ? 'border-primary/60 shadow-soft ring-1 ring-primary/40'
          : 'border-border/70 hover:border-primary/40'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleFocusClick}
          className="flex min-w-0 items-center gap-1 text-left"
          aria-pressed={focused}
          aria-label={
            focused ? `已聚焦到 ${summary.memberName}，再次点击清除` : `聚焦到 ${summary.memberName}`
          }
        >
          <span className="truncate text-sm font-semibold text-foreground">
            {summary.memberName}
          </span>
          <ChevronRight
            className={cn(
              'h-3 w-3 shrink-0 transition-transform',
              focused ? 'rotate-90 text-primary' : 'text-muted-foreground/70'
            )}
          />
        </button>
        <Badge
          className={cn('whitespace-nowrap px-1.5 py-0 font-semibold', summary.status.badgeClassName)}
        >
          <StatusIcon className="h-3 w-3" />
          {badgeText}
        </Badge>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">
          {summary.assetCount} 项 · {summary.withTargetCount} 已设
        </span>
        <Button
          variant={summary.needsAdjustment ? 'default' : 'outline'}
          size="sm"
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={handleNormalizeClick}
          disabled={summary.assetCount === 0}
        >
          <Sparkles className="h-3 w-3" />
          {summary.needsAdjustment ? '一键归一化' : '重新配比'}
        </Button>
      </div>

      <div className="mt-1.5 flex h-1 w-full overflow-hidden rounded-full bg-muted">
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

// memo 包装：父 EntryTargetRatioSummary 重渲染时，summary 引用一般稳定（来自上游 memo）+
// 父级稳定 onFocusMember / onOpenNormalize 让 props 浅比较短路未变 card。
const MemberAllocationCard = memo(MemberAllocationCardBase);
