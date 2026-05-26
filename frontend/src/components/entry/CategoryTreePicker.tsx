import { Check, ChevronDown, ChevronRight, Search } from 'lucide-react';
import * as React from 'react';
import { memo } from 'react';

import { cn } from '../../lib/cn';
import type { CategoryNode } from '../../types';
import {
  buildFlatSearchResults,
  resolvePathFromValue,
  shouldAutoPenetrate,
  type CategoryPickerValue,
} from './categoryTreePickerLogic';

type CategoryTreePickerProps = {
  value: CategoryPickerValue | null;
  onChange: (value: CategoryPickerValue) => void;
  assetTree: CategoryNode[];
  liabilityTree: CategoryNode[];
  disabled?: boolean;
  className?: string;
  onOpenChange?: (open: boolean) => void;
};

type CategoryType = 'asset' | 'liability';

function CategoryTreePickerBase({
  value,
  onChange,
  assetTree,
  liabilityTree,
  disabled = false,
  className,
  onOpenChange,
}: CategoryTreePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [activeType, setActiveType] = React.useState<CategoryType>(value?.type ?? 'asset');
  const [breadcrumb, setBreadcrumb] = React.useState<{ l1Id?: number; l2Id?: number }>(() =>
    value ? { l1Id: value.l1Id, l2Id: value.l2Id } : {}
  );
  const [searchTerm, setSearchTerm] = React.useState('');

  const resolvedPath = React.useMemo(
    () => resolvePathFromValue(value, assetTree, liabilityTree),
    [value, assetTree, liabilityTree]
  );

  const activeTree = activeType === 'asset' ? assetTree : liabilityTree;

  React.useEffect(() => {
    // 关闭 popover 时清空搜索词，下次打开干净状态（点 outside 关闭逻辑下移到全局 mousedown）
    if (!open) {
      setSearchTerm('');
    }
  }, [open]);

  const openPicker = () => {
    if (disabled) return;
    setActiveType(value?.type ?? 'asset');
    setBreadcrumb(value ? { l1Id: value.l1Id, l2Id: value.l2Id } : {});
    setSearchTerm('');
    setOpen(true);
    onOpenChange?.(true);
  };

  const closePicker = () => {
    setSearchTerm('');
    setOpen(false);
    onOpenChange?.(false);
  };

  const handleSwitchType = (next: CategoryType) => {
    if (next === activeType) return;
    setActiveType(next);
    setBreadcrumb({});
    setSearchTerm('');
  };

  const handlePickL1 = (l1: CategoryNode) => {
    setBreadcrumb({ l1Id: l1.id });
  };

  const handlePickL2 = (l2: CategoryNode, l1: CategoryNode) => {
    if (shouldAutoPenetrate(l2)) {
      const onlyL3 = l2.children[0];
      onChange({ type: activeType, l1Id: l1.id, l2Id: l2.id, l3Id: onlyL3.id });
      closePicker();
      return;
    }
    setBreadcrumb({ l1Id: l1.id, l2Id: l2.id });
  };

  const handlePickL3 = (l3: CategoryNode, l1: CategoryNode, l2: CategoryNode) => {
    onChange({ type: activeType, l1Id: l1.id, l2Id: l2.id, l3Id: l3.id });
    closePicker();
  };

  const handlePickSearchResult = (l1Id: number, l2Id: number, l3Id: number) => {
    onChange({ type: activeType, l1Id, l2Id, l3Id });
    closePicker();
  };

  const triggerLabel = resolvedPath
    ? `${resolvedPath.type === 'asset' ? '资产' : '负债'} · ${resolvedPath.l1Name} / ${resolvedPath.l2Name} / ${resolvedPath.l3Name}`
    : '请选择资产或负债的三级分类';

  const searchResults = React.useMemo(
    () => buildFlatSearchResults(activeTree, searchTerm, activeType),
    [activeTree, searchTerm, activeType]
  );

  const showingSearch = searchTerm.trim().length > 0;
  const currentL1 = breadcrumb.l1Id ? activeTree.find((n) => n.id === breadcrumb.l1Id) : undefined;
  const currentL2 = currentL1 && breadcrumb.l2Id ? currentL1.children.find((n) => n.id === breadcrumb.l2Id) : undefined;

  const typeChangedFromValue = value !== null && value.type !== activeType;

  return (
    <div className={cn(className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? closePicker() : openPicker())}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-lg border bg-card pl-3 pr-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          !resolvedPath && 'text-muted-foreground'
        )}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn('ml-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
          {/* Tab */}
          <div className="flex gap-1 border-b border-slate-200 p-2">
            {(['asset', 'liability'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleSwitchType(t)}
                className={cn(
                  'flex-1 rounded-lg px-3 py-1.5 text-sm transition-colors',
                  activeType === t ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-slate-100'
                )}
              >
                {t === 'asset' ? `资产 (${assetTree.length})` : `负债 (${liabilityTree.length})`}
              </button>
            ))}
          </div>

          {typeChangedFromValue ? (
            <p className="border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
              切换类型后，选定一项才会替换原来的分类
            </p>
          ) : null}

          {/* 面包屑 */}
          {!showingSearch ? (
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-3 py-2 text-xs">
              <button
                type="button"
                onClick={() => setBreadcrumb({})}
                className={cn(
                  'rounded px-1.5 py-0.5 transition-colors',
                  !breadcrumb.l1Id ? 'font-medium text-primary' : 'text-muted-foreground hover:bg-slate-100'
                )}
              >
                全部
              </button>
              {currentL1 ? (
                <>
                  <ChevronRight aria-hidden="true" className="h-3 w-3 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => setBreadcrumb({ l1Id: currentL1.id })}
                    className={cn(
                      'rounded px-1.5 py-0.5 transition-colors',
                      !breadcrumb.l2Id ? 'font-medium text-primary' : 'text-muted-foreground hover:bg-slate-100'
                    )}
                  >
                    {currentL1.name}
                  </button>
                </>
              ) : null}
              {currentL2 ? (
                <>
                  <ChevronRight aria-hidden="true" className="h-3 w-3 text-muted-foreground" />
                  <span className="rounded px-1.5 py-0.5 font-medium text-primary">{currentL2.name}</span>
                </>
              ) : null}
            </div>
          ) : null}

          {/* 搜索框 */}
          <div className="relative border-b border-slate-200 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="输入名字直接搜（匹配一级/二级/三级）"
              className="h-9 w-full rounded-md border border-slate-200 bg-card pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* 主区列表 */}
          <div className="max-h-72 overflow-auto p-1">
            {showingSearch ? (
              searchResults.length > 0 ? (
                searchResults.map((result) => {
                  const selected =
                    value !== null &&
                    value.type === result.type &&
                    value.l1Id === result.l1Id &&
                    value.l2Id === result.l2Id &&
                    value.l3Id === result.l3Id;
                  return (
                    <button
                      key={`${result.l1Id}|${result.l2Id}|${result.l3Id}`}
                      type="button"
                      onClick={() => handlePickSearchResult(result.l1Id, result.l2Id, result.l3Id)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        selected ? 'bg-primary/10 text-primary' : 'hover:bg-slate-100'
                      )}
                    >
                      <span className="truncate">
                        {result.l1Name} / {result.l2Name} / {result.l3Name}
                      </span>
                      {selected ? <Check className="ml-2 h-4 w-4 shrink-0" /> : null}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">没有匹配项</div>
              )
            ) : !currentL1 ? (
              activeTree.map((l1) => (
                <button
                  key={l1.id}
                  type="button"
                  onClick={() => handlePickL1(l1)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100"
                >
                  <span>{l1.name}</span>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                </button>
              ))
            ) : !currentL2 ? (
              currentL1.children.map((l2) => (
                <button
                  key={l2.id}
                  type="button"
                  onClick={() => handlePickL2(l2, currentL1)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100"
                >
                  <span>{l2.name}</span>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                </button>
              ))
            ) : (
              currentL2.children.map((l3) => {
                const selected =
                  value !== null &&
                  value.type === activeType &&
                  value.l3Id === l3.id;
                return (
                  <button
                    key={l3.id}
                    type="button"
                    onClick={() => handlePickL3(l3, currentL1, currentL2)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      selected ? 'bg-primary/10 text-primary' : 'hover:bg-slate-100'
                    )}
                  >
                    <span>{l3.name}</span>
                    {selected ? <Check className="h-4 w-4" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// memo 包装：CategoryTreePicker 内部维护大量 search state，但父 EntryHoldingFormDialog
// 频繁因 form 编辑重渲染时，只要 value / 树 / onChange / onOpenChange 引用稳定就能短路。
export const CategoryTreePicker = memo(CategoryTreePickerBase);
