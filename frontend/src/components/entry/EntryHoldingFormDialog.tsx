import type { Dispatch, SetStateAction } from 'react';

import type { Member } from '../../types';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Input } from '../ui/input';
import {
  SearchableSelect,
  type SearchableSelectOption,
} from '../ui/searchable-select';
import { Select } from '../ui/select';
import { Tooltip } from '../ui/tooltip';
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
  pathSelectOptions: SearchableSelectOption[];
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
  pathSelectOptions,
  currencyOptions,
  submitting,
  setForm,
  onClose,
  onSubmit,
}: EntryHoldingFormDialogProps) {
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
        <div>
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
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">类型</label>
          <Select
            value={form.type}
            onChange={(event) => {
              const nextType = event.target.value as 'asset' | 'liability';
              setForm((prev) => ({
                ...prev,
                type: nextType,
                pathKey: '',
                targetRatio: nextType === 'asset' ? prev.targetRatio : '',
              }));
            }}
            options={[
              { label: '资产', value: 'asset' },
              { label: '负债', value: 'liability' },
            ]}
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
        <div className="sm:col-span-2">
          <div className="mb-1 flex items-center gap-1.5">
            <label className="block text-sm text-muted-foreground">
              三级分类路径
            </label>
            <Tooltip
              content="请选择完整的一级 / 二级 / 三级分类路径；支持输入关键词搜索，例如“权益”“住房”“信用卡”。"
              label="三级分类路径说明"
            />
          </div>
          <SearchableSelect
            value={form.pathKey}
            onValueChange={(value) =>
              setForm((prev) => ({ ...prev, pathKey: value }))
            }
            options={pathSelectOptions}
            placeholder="搜索一级 / 二级 / 三级分类"
            emptyMessage="没有匹配的分类路径"
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
        {form.type === 'asset' ? (
          <div>
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
