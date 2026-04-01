import { formatCurrency } from '../../utils/format';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Select } from '../ui/select';
import type { BulkDeleteSummary } from './entryPageLogic';

type EntryBulkDeleteDialogsProps = {
  selectedDeleteOpen: boolean;
  memberDeleteOpen: boolean;
  bulkDeleteError: string | null;
  selectedSummary: BulkDeleteSummary;
  memberDeleteId: string;
  memberDeleteOptions: Array<{ label: string; value: number }>;
  memberDeleteSummary: BulkDeleteSummary;
  baseCurrency: string;
  pending: boolean;
  onCloseSelectedDelete: () => void;
  onCloseMemberDelete: () => void;
  onMemberDeleteIdChange: (value: string) => void;
  onSubmitDeleteSelected: () => void;
  onSubmitDeleteByMember: () => void;
};

export function EntryBulkDeleteDialogs({
  selectedDeleteOpen,
  memberDeleteOpen,
  bulkDeleteError,
  selectedSummary,
  memberDeleteId,
  memberDeleteOptions,
  memberDeleteSummary,
  baseCurrency,
  pending,
  onCloseSelectedDelete,
  onCloseMemberDelete,
  onMemberDeleteIdChange,
  onSubmitDeleteSelected,
  onSubmitDeleteByMember,
}: EntryBulkDeleteDialogsProps) {
  return (
    <>
      <Dialog
        open={selectedDeleteOpen}
        title="批量删除已选条目"
        description="删除后将立即刷新录入列表、快照与分析看板数据。"
        onClose={onCloseSelectedDelete}
        footer={
          <>
            <Button variant="outline" onClick={onCloseSelectedDelete}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={onSubmitDeleteSelected}
              disabled={pending || selectedSummary.count === 0}
            >
              {pending ? '删除中...' : `删除已选（${selectedSummary.count}）`}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <SummaryCards
            summary={selectedSummary}
            baseCurrency={baseCurrency}
            countLabel="已选条目"
          />
          <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-sm text-rose-700">
            此操作不可撤销，将删除当前已勾选的资产与负债，并立即重建最新快照。
          </div>
          {selectedSummary.previewNames.length > 0 ? (
            <div className="text-sm text-muted-foreground">
              示例条目：{selectedSummary.previewNames.join('、')}
            </div>
          ) : null}
          {bulkDeleteError ? (
            <p className="text-sm text-rose-600">{bulkDeleteError}</p>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={memberDeleteOpen}
        title="按成员删除资产负债"
        description="支持直接清空某个成员名下的全部资产和负债数据。"
        onClose={onCloseMemberDelete}
        footer={
          <>
            <Button variant="outline" onClick={onCloseMemberDelete}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={onSubmitDeleteByMember}
              disabled={pending || memberDeleteSummary.count === 0}
            >
              {pending ? '删除中...' : '删除该成员全部数据'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">成员</label>
            <Select
              value={memberDeleteId}
              onChange={(event) => onMemberDeleteIdChange(event.target.value)}
              options={memberDeleteOptions}
            />
          </div>
          <SummaryCards
            summary={memberDeleteSummary}
            baseCurrency={baseCurrency}
            countLabel="待删除条目"
          />
          <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-sm text-rose-700">
            将删除该成员名下全部资产与负债。删除完成后，录入列表与分析数据会立即刷新。
          </div>
          {memberDeleteSummary.previewNames.length > 0 ? (
            <div className="text-sm text-muted-foreground">
              示例条目：{memberDeleteSummary.previewNames.join('、')}
            </div>
          ) : null}
          {bulkDeleteError ? (
            <p className="text-sm text-rose-600">{bulkDeleteError}</p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

function SummaryCards({
  summary,
  baseCurrency,
  countLabel,
}: {
  summary: BulkDeleteSummary;
  baseCurrency: string;
  countLabel: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border bg-secondary/20 p-3">
        <div className="text-xs text-muted-foreground">{countLabel}</div>
        <div className="mt-1 text-lg font-semibold">{summary.count}</div>
      </div>
      <div className="rounded-lg border bg-secondary/20 p-3">
        <div className="text-xs text-muted-foreground">资产 / 负债</div>
        <div className="mt-1 text-lg font-semibold">
          {summary.assetCount} / {summary.liabilityCount}
        </div>
      </div>
      <div className="rounded-lg border bg-secondary/20 p-3">
        <div className="text-xs text-muted-foreground">折算金额</div>
        <div className="mt-1 text-lg font-semibold">
          {formatCurrency(summary.totalBase, baseCurrency)}
        </div>
      </div>
    </div>
  );
}
