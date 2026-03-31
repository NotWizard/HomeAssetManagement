import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select } from '../ui/select';

type EntryFiltersBarProps = {
  keyword: string;
  memberFilter: string;
  typeFilter: 'all' | 'asset' | 'liability';
  memberOptions: Array<{ label: string; value: string | number }>;
  filteredCount: number;
  selectedCount: number;
  hasAnyHoldings: boolean;
  bulkDeletePending: boolean;
  onKeywordChange: (value: string) => void;
  onMemberFilterChange: (value: string) => void;
  onTypeFilterChange: (value: 'all' | 'asset' | 'liability') => void;
  onOpenMemberDeleteDialog: () => void;
  onOpenSelectedDeleteDialog: () => void;
};

export function EntryFiltersBar({
  keyword,
  memberFilter,
  typeFilter,
  memberOptions,
  filteredCount,
  selectedCount,
  hasAnyHoldings,
  bulkDeletePending,
  onKeywordChange,
  onMemberFilterChange,
  onTypeFilterChange,
  onOpenMemberDeleteDialog,
  onOpenSelectedDeleteDialog,
}: EntryFiltersBarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div className="grid gap-3 md:grid-cols-3 xl:flex-1">
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">名称搜索</label>
          <Input placeholder="搜索名称、成员、币种" value={keyword} onChange={(event) => onKeywordChange(event.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">成员筛选</label>
          <Select value={memberFilter} onChange={(event) => onMemberFilterChange(event.target.value)} options={memberOptions} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">类型筛选</label>
          <Select
            value={typeFilter}
            onChange={(event) => onTypeFilterChange(event.target.value as 'all' | 'asset' | 'liability')}
            options={[
              { label: '全部类型', value: 'all' },
              { label: '资产', value: 'asset' },
              { label: '负债', value: 'liability' },
            ]}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        <div className="inline-flex h-10 items-center rounded-lg border bg-secondary/25 px-3 text-sm text-muted-foreground">
          当前筛选 {filteredCount} 条，已选 {selectedCount} 条
        </div>
        <Button variant="outline" onClick={onOpenMemberDeleteDialog} disabled={!hasAnyHoldings || bulkDeletePending}>
          按成员删除
        </Button>
        <Button variant="destructive" onClick={onOpenSelectedDeleteDialog} disabled={selectedCount === 0 || bulkDeletePending}>
          删除已选
        </Button>
      </div>
    </div>
  );
}
