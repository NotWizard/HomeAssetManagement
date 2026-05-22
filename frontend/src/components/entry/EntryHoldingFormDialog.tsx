import type { Dispatch, SetStateAction } from 'react';
import { useRef } from 'react';

import type { CategoryNode, Member } from '../../types';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Input } from '../ui/input';
import {
  SearchableSelect,
  type SearchableSelectOption,
} from '../ui/searchable-select';
import { Select } from '../ui/select';
import { Tooltip } from '../ui/tooltip';
import { CategoryTreePicker } from './CategoryTreePicker';
import type { CategoryPickerValue } from './categoryTreePickerLogic';
import {
  normalizeAmountInput,
} from './entryPageLogic';
import type { EntryFormState } from './entryPageController';

type EntryHoldingFormDialogProps = {
  open: boolean;
  editingTitle: string;
  editing: boolean;
  form: EntryFormState;
  error: string | null;
  members: Member[];
  assetTree: CategoryNode[];
  liabilityTree: CategoryNode[];
  currencyOptions: SearchableSelectOption[];
  submitting: boolean;
  setForm: Dispatch<SetStateAction<EntryFormState>>;
  onClose: () => void;
  onSubmit: () => void;
};

export function EntryHoldingFormDialog({
  open,
  editingTitle,
  editing,
  form,
  error,
  members,
  assetTree,
  liabilityTree,
  currencyOptions,
  submitting,
  setForm,
  onClose,
  onSubmit,
}: EntryHoldingFormDialogProps) {
  const isAsset = form.category?.type === 'asset';
  const categoryFieldRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog
      open={open}
      title={editing ? editingTitle : '新增条目'}
      description="保存后将自动触发事件快照记录"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {editing ? '保存修改' : '创建条目'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-muted-foreground">成员</label>
          <Select
            value={form.memberId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, memberId: event.target.value }))
            }
            options={members.map((member) => ({
              label: member.name,
              value: member.id,
            }))}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-muted-foreground">名称</label>
          <Input
            value={form.name}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, name: event.target.value }))
            }
          />
        </div>
        <div ref={categoryFieldRef} className="sm:col-span-2">
          <div className="mb-1 flex items-center gap-1.5">
            <label className="block text-sm text-muted-foreground">分类</label>
            <Tooltip
              content="顶部切换资产 / 负债，沿一级→二级→三级面包屑逐步缩范围；也可在搜索框直接按名字搜（一级 / 二级 / 三级任一段命中均可）。"
              label="分类选择说明"
            />
          </div>
          <CategoryTreePicker
            value={form.category}
            onChange={(next: CategoryPickerValue) =>
              setForm((prev) => ({
                ...prev,
                category: next,
                targetRatio: next.type === 'asset' ? prev.targetRatio : '',
              }))
            }
            assetTree={assetTree}
            liabilityTree={liabilityTree}
            onOpenChange={(open) => {
              if (!open) return;
              // 等 popover 渲染完后，把整个「分类」字段（含 label）滚到 dialog body 顶部，
              // 让用户一次性看到 trigger + tab + 面包屑 + 搜索 + 列表 的完整组件。
              requestAnimationFrame(() => {
                categoryFieldRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                });
              });
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">币种</label>
          <SearchableSelect
            value={form.currency}
            onValueChange={(value) =>
              setForm((prev) => ({ ...prev, currency: value }))
            }
            options={currencyOptions}
            placeholder="搜索币种代码或中文名"
            emptyMessage="没有匹配的币种"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <label className="block text-sm text-muted-foreground">金额</label>
            <Tooltip
              content="金额仅支持输入两位小数，例如 100.00"
              label="金额输入说明"
            />
          </div>
          <Input
            type="text"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.amountOriginal}
            onChange={(event) => {
              const nextValue = normalizeAmountInput(event.target.value);
              if (nextValue !== null) {
                setForm((prev) => ({ ...prev, amountOriginal: nextValue }));
              }
            }}
          />
        </div>
        {isAsset ? (
          <div className="sm:col-span-2">
            <div className="mb-1 flex items-center gap-1.5">
              <label className="block text-sm text-muted-foreground">
                期望占比(%)
              </label>
              <Tooltip
                content="仅对资产生效，表示该资产希望占家庭净资产的目标比例；请输入 0 到 100 之间的百分比。"
                label="期望占比说明"
              />
            </div>
            <Input
              type="number"
              min="0"
              max="100"
              value={form.targetRatio}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  targetRatio: event.target.value,
                }))
              }
            />
          </div>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
    </Dialog>
  );
}
