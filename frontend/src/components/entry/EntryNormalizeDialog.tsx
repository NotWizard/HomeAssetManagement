import { ArrowRight, RefreshCw } from 'lucide-react';

import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { cn } from '../../lib/cn';
import {
  formatTargetRatio,
  formatTargetRatioDelta,
  formatTargetRatioSummary,
  TARGET_RATIO_EPSILON,
  type NormalizationPlan,
} from './entryPageLogic';

type EntryNormalizeDialogProps = {
  open: boolean;
  memberName: string;
  plan: NormalizationPlan;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
};

export function EntryNormalizeDialog({
  open,
  memberName,
  plan,
  pending,
  error,
  onClose,
  onSubmit,
}: EntryNormalizeDialogProps) {
  const empty = plan.items.length === 0;
  const noChanges =
    plan.items.length > 0 &&
    plan.items.every((item) => Math.abs(item.delta) <= TARGET_RATIO_EPSILON);
  const reasonHint =
    plan.reason === 'all_zero'
      ? '当前所有期望占比均为 0，将按等比例 1/N 平均分配。'
      : '将以现有比例为权重，等比例缩放至合计 100%。';

  return (
    <Dialog
      open={open}
      title={`${memberName} · 期望占比归一化`}
      description={
        empty
          ? '该成员暂无可调整的资产条目。'
          : `${reasonHint}调整前合计 ${formatTargetRatioSummary(plan.beforeTotal)}，调整后将精确为 ${formatTargetRatioSummary(plan.afterTotal)}。`
      }
      onClose={pending ? () => undefined : onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={pending || empty || noChanges}>
            <RefreshCw className={cn('mr-1 h-4 w-4', pending && 'animate-spin')} />
            {pending ? '正在更新…' : '确认调整'}
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {empty ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
          请先为该成员录入至少一项资产，再使用归一化工具。
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>资产名称</TableHead>
                <TableHead className="text-right">当前占比</TableHead>
                <TableHead className="w-12 text-center">→</TableHead>
                <TableHead className="text-right">建议占比</TableHead>
                <TableHead className="text-right">变化</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.items.map((item) => {
                const changed = Math.abs(item.delta) > TARGET_RATIO_EPSILON;
                const direction = item.delta > 0 ? 'up' : 'down';
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {item.current == null ? '-' : formatTargetRatio(item.current, 2)}
                    </TableCell>
                    <TableCell className="text-center">
                      <ArrowRight className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatTargetRatio(item.proposed, 2)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums text-xs',
                        !changed && 'text-muted-foreground',
                        changed && direction === 'up' && 'text-emerald-600',
                        changed && direction === 'down' && 'text-rose-600'
                      )}
                    >
                      {changed
                        ? `${direction === 'up' ? '+' : '−'}${formatTargetRatioDelta(item.delta)}`
                        : '无变化'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {noChanges ? (
            <div className="border-t bg-emerald-50/40 px-4 py-2 text-xs text-emerald-700">
              当前已经是 100% 配平，无需再调整。
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
