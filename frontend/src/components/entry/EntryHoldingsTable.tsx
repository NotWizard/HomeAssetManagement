import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Sparkles, Trash2, UserRound } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { cn } from '../../lib/cn';
import type { Holding } from '../../types';
import { formatCurrency } from '../../utils/format';
import {
  formatTargetRatioDelta,
  formatTargetRatioSummary,
  type MemberAllocationSummary,
  TARGET_RATIO_EPSILON,
} from './entryPageLogic';

type GroupedHoldings = {
  summary: MemberAllocationSummary;
  rows: Holding[];
};

type EntryHoldingsTableProps = {
  filteredHoldings: Holding[];
  allHoldingsCount: number;
  allVisibleSelected: boolean;
  selectedIdSet: Set<number>;
  memberNameMap: Map<number, string>;
  baseCurrency: string;
  deletePending: boolean;
  memberSummaries: MemberAllocationSummary[];
  focusedMemberId: number | null;
  onToggleSelectAllVisible: (checked: boolean) => void;
  onToggleHoldingSelection: (holdingId: number, checked: boolean) => void;
  onOpenEditDialog: (row: Holding) => void;
  onDeleteHolding: (holdingId: number) => void;
  onOpenNormalize: (memberId: number) => void;
};

const COLUMN_COUNT = 9;

export function EntryHoldingsTable({
  filteredHoldings,
  allHoldingsCount,
  allVisibleSelected,
  selectedIdSet,
  memberNameMap,
  baseCurrency,
  deletePending,
  memberSummaries,
  focusedMemberId,
  onToggleSelectAllVisible,
  onToggleHoldingSelection,
  onOpenEditDialog,
  onDeleteHolding,
  onOpenNormalize,
}: EntryHoldingsTableProps) {
  const groups = buildGroups(filteredHoldings, memberSummaries, memberNameMap);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<number>>(() => new Set());
  const groupKey = groups.map((group) => group.summary.memberId).join(',');

  useEffect(() => {
    setCollapsedGroupIds((current) => {
      const validIds = new Set(groups.map((group) => group.summary.memberId));
      const next = new Set<number>();
      current.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        }
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);

  useEffect(() => {
    if (focusedMemberId == null) {
      return;
    }
    setCollapsedGroupIds((current) => {
      if (!current.has(focusedMemberId)) {
        return current;
      }
      const next = new Set(current);
      next.delete(focusedMemberId);
      return next;
    });
    const target = document.getElementById(`entry-group-${focusedMemberId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusedMemberId]);

  const toggleGroup = (memberId: number) => {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 px-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border"
                checked={allVisibleSelected}
                onChange={(event) => onToggleSelectAllVisible(event.target.checked)}
                aria-label="全选当前筛选结果"
              />
            </TableHead>
            <TableHead>名称</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>成员</TableHead>
            <TableHead>币种</TableHead>
            <TableHead className="text-right">原币金额</TableHead>
            <TableHead className="text-right">折算金额</TableHead>
            <TableHead className="text-right">目标占比</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const collapsed = collapsedGroupIds.has(group.summary.memberId);
            const focused = focusedMemberId === group.summary.memberId;
            const overflowRatio = Math.max(0, group.summary.totalRatio - 100);
            return (
              <GroupBlock
                key={group.summary.memberId}
                group={group}
                collapsed={collapsed}
                focused={focused}
                overflowRatio={overflowRatio}
                selectedIdSet={selectedIdSet}
                deletePending={deletePending}
                baseCurrency={baseCurrency}
                onToggle={() => toggleGroup(group.summary.memberId)}
                onToggleHoldingSelection={onToggleHoldingSelection}
                onOpenEditDialog={onOpenEditDialog}
                onDeleteHolding={onDeleteHolding}
                onOpenNormalize={onOpenNormalize}
              />
            );
          })}
          {groups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="text-center text-muted-foreground">
                {allHoldingsCount === 0 ? '暂无录入数据' : '当前筛选条件下暂无匹配数据'}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

type GroupBlockProps = {
  group: GroupedHoldings;
  collapsed: boolean;
  focused: boolean;
  overflowRatio: number;
  selectedIdSet: Set<number>;
  deletePending: boolean;
  baseCurrency: string;
  onToggle: () => void;
  onToggleHoldingSelection: (id: number, checked: boolean) => void;
  onOpenEditDialog: (row: Holding) => void;
  onDeleteHolding: (id: number) => void;
  onOpenNormalize: (memberId: number) => void;
};

function GroupBlock({
  group,
  collapsed,
  focused,
  overflowRatio,
  selectedIdSet,
  deletePending,
  baseCurrency,
  onToggle,
  onToggleHoldingSelection,
  onOpenEditDialog,
  onDeleteHolding,
  onOpenNormalize,
}: GroupBlockProps) {
  const { summary, rows } = group;
  const visibleAssetTotal = summary.totalRatio;
  const showRows = !collapsed && rows.length > 0;
  const ChevronIcon = collapsed ? ChevronRight : ChevronDown;
  const overflowDanger = overflowRatio > TARGET_RATIO_EPSILON;

  return (
    <>
      <TableRow
        id={`entry-group-${summary.memberId}`}
        className={cn(
          'border-y bg-muted/30 hover:bg-muted/40',
          focused && 'bg-primary/5 ring-1 ring-inset ring-primary/30'
        )}
      >
        <TableCell colSpan={COLUMN_COUNT} className="py-2.5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggle}
                aria-label={collapsed ? '展开成员组' : '折叠成员组'}
                aria-expanded={!collapsed}
              >
                <ChevronIcon className="h-4 w-4" />
              </Button>
              <UserRound className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">{summary.memberName}</span>
              <span className="text-xs text-muted-foreground">
                {rows.length} 项 · 资产 {summary.assetCount}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {summary.hasAssets ? (
                <>
                  <Badge className={cn('font-semibold', summary.status.badgeClassName)}>
                    {summary.status.label}
                  </Badge>
                  <span className="text-xs font-medium text-foreground">
                    资产合计 {formatTargetRatioSummary(visibleAssetTotal)}
                  </span>
                  <span className={cn('text-xs', summary.status.detailClassName)}>
                    {summary.status.label === '已达标'
                      ? '已达 100.0%'
                      : summary.delta > 0
                        ? `还差 ${formatTargetRatioDelta(summary.delta)}`
                        : `超出 ${formatTargetRatioDelta(summary.delta)}`}
                  </span>
                  <Button
                    variant={summary.needsAdjustment ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onOpenNormalize(summary.memberId)}
                    disabled={summary.assetCount === 0}
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    {summary.needsAdjustment ? '一键归一化' : '重新配比'}
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">仅含负债条目，无需配比</span>
              )}
            </div>
          </div>
        </TableCell>
      </TableRow>
      {showRows
        ? rows.map((row) => {
            const isAsset = row.type === 'asset';
            const ratioValue = row.target_ratio == null ? null : Number(row.target_ratio);
            const ratioCellClass = computeRatioCellClass({
              isAsset,
              ratioValue,
              overflowRatio,
              memberAssetTotal: visibleAssetTotal,
            });
            return (
              <TableRow
                key={row.id}
                className={cn(focused && 'bg-primary/5/40')}
              >
                <TableCell className="w-12 px-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border"
                    checked={selectedIdSet.has(row.id)}
                    onChange={(event) => onToggleHoldingSelection(row.id, event.target.checked)}
                    aria-label={`选择 ${row.name}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>
                  <Badge variant={isAsset ? 'default' : 'secondary'}>{isAsset ? '资产' : '负债'}</Badge>
                </TableCell>
                <TableCell>{summary.memberName}</TableCell>
                <TableCell>{row.currency}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(row.amount_original, row.currency)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(row.amount_base, baseCurrency)}
                </TableCell>
                <TableCell className={cn('text-right tabular-nums', ratioCellClass)}>
                  {ratioValue == null
                    ? '-'
                    : overflowDanger && isAsset
                      ? `${ratioValue}%`
                      : `${ratioValue}%`}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => onOpenEditDialog(row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteHolding(row.id)}
                      disabled={deletePending}
                    >
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        : null}
    </>
  );
}

function buildGroups(
  filteredHoldings: Holding[],
  memberSummaries: MemberAllocationSummary[],
  memberNameMap: Map<number, string>
): GroupedHoldings[] {
  const summaryByMember = new Map<number, MemberAllocationSummary>();
  memberSummaries.forEach((summary) => summaryByMember.set(summary.memberId, summary));

  const rowsByMember = new Map<number, Holding[]>();
  filteredHoldings.forEach((row) => {
    const list = rowsByMember.get(row.member_id) ?? [];
    list.push(row);
    rowsByMember.set(row.member_id, list);
  });

  const memberIdsInOrder: number[] = [];
  const seen = new Set<number>();
  memberSummaries.forEach((summary) => {
    if (rowsByMember.has(summary.memberId)) {
      memberIdsInOrder.push(summary.memberId);
      seen.add(summary.memberId);
    }
  });
  rowsByMember.forEach((_rows, memberId) => {
    if (!seen.has(memberId)) {
      memberIdsInOrder.push(memberId);
    }
  });

  return memberIdsInOrder.map((memberId) => {
    const rows = rowsByMember.get(memberId) ?? [];
    const summary =
      summaryByMember.get(memberId) ??
      ({
        memberId,
        memberName: memberNameMap.get(memberId) ?? `成员 ${memberId}`,
        assetCount: rows.filter((row) => row.type === 'asset').length,
        withTargetCount: rows.filter((row) => row.type === 'asset' && row.target_ratio != null).length,
        totalRatio: 0,
        status: {
          label: '已达标',
          detail: '已达到 100.0%',
          badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          detailClassName: 'text-emerald-700',
        },
        delta: 0,
        needsAdjustment: false,
        hasAssets: rows.some((row) => row.type === 'asset'),
      } satisfies MemberAllocationSummary);

    const sortedRows = [...rows].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'asset' ? -1 : 1;
      }
      const ratioA = a.type === 'asset' ? Number(a.target_ratio ?? 0) : 0;
      const ratioB = b.type === 'asset' ? Number(b.target_ratio ?? 0) : 0;
      if (ratioA !== ratioB) {
        return ratioB - ratioA;
      }
      return a.id - b.id;
    });

    return { summary, rows: sortedRows };
  });
}

type RatioCellClassArgs = {
  isAsset: boolean;
  ratioValue: number | null;
  overflowRatio: number;
  memberAssetTotal: number;
};

function computeRatioCellClass({
  isAsset,
  ratioValue,
  overflowRatio,
  memberAssetTotal,
}: RatioCellClassArgs): string {
  if (!isAsset || ratioValue == null) {
    return 'text-muted-foreground';
  }
  if (overflowRatio <= TARGET_RATIO_EPSILON) {
    return '';
  }
  const baseRatio = memberAssetTotal > 0 ? ratioValue / memberAssetTotal : 0;
  if (baseRatio >= 0.4) {
    return 'text-rose-700 font-semibold bg-rose-50/70';
  }
  if (baseRatio >= 0.2) {
    return 'text-rose-600 font-medium';
  }
  return 'text-rose-500/80';
}
