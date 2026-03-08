import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { SearchableSelect, type SearchableSelectOption } from '../components/ui/searchable-select';
import { Select } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tooltip } from '../components/ui/tooltip';
import { fetchCategories } from '../services/categories';
import { createHolding, deleteHolding, fetchHoldings, updateHolding, type HoldingPayload } from '../services/holdings';
import { fetchMembers } from '../services/members';
import type { CategoryNode, Holding } from '../types';
import { formatCurrency } from '../utils/format';

type PathOption = {
  key: string;
  label: string;
  l1Id: number;
  l2Id: number;
  l3Id: number;
};

type EntryFormState = {
  memberId: string;
  type: 'asset' | 'liability';
  name: string;
  pathKey: string;
  currency: string;
  amountOriginal: string;
  targetRatio: string;
};

const INITIAL_FORM: EntryFormState = {
  memberId: '',
  type: 'asset',
  name: '',
  pathKey: '',
  currency: '',
  amountOriginal: '',
  targetRatio: '',
};

const AMOUNT_PATTERN = /^\d*(?:\.\d{0,2})?$/;

const LEGACY_CATEGORY_PATH_LABEL = '默认一级 / 默认二级 / 默认三级';

const COMMON_CURRENCY_OPTIONS: SearchableSelectOption[] = [
  { value: 'CNY', label: 'CNY（人民币）', searchText: '人民币 china chinese yuan renminbi' },
  { value: 'USD', label: 'USD（美元）', searchText: '美元 us dollar america' },
  { value: 'EUR', label: 'EUR（欧元）', searchText: '欧元 euro' },
  { value: 'HKD', label: 'HKD（港币）', searchText: '港币 hong kong dollar' },
  { value: 'JPY', label: 'JPY（日元）', searchText: '日元 yen japan' },
  { value: 'GBP', label: 'GBP（英镑）', searchText: '英镑 pound uk' },
  { value: 'AUD', label: 'AUD（澳元）', searchText: '澳元 australia dollar' },
  { value: 'CAD', label: 'CAD（加拿大元）', searchText: '加拿大元 canada dollar' },
  { value: 'CHF', label: 'CHF（瑞士法郎）', searchText: '瑞士法郎 swiss franc' },
  { value: 'SGD', label: 'SGD（新加坡元）', searchText: '新加坡元 singapore dollar' },
];

function buildPathOptions(tree: CategoryNode[]): PathOption[] {
  const result: PathOption[] = [];
  for (const l1 of tree) {
    for (const l2 of l1.children ?? []) {
      for (const l3 of l2.children ?? []) {
        result.push({
          key: `${l1.id}|${l2.id}|${l3.id}`,
          label: `${l1.name} / ${l2.name} / ${l3.name}`,
          l1Id: l1.id,
          l2Id: l2.id,
          l3Id: l3.id,
        });
      }
    }
  }
  return result;
}

function normalizeAmountInput(value: string): string | null {
  if (value === '') {
    return '';
  }
  const normalized = value === '.' ? '0.' : value.startsWith('.') ? `0${value}` : value;
  if (!AMOUNT_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

function hasValidTwoDecimalAmount(value: string): boolean {
  return /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
}

export function EntryPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [form, setForm] = useState<EntryFormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);

  const membersQuery = useQuery({ queryKey: ['members'], queryFn: fetchMembers });
  const holdingsQuery = useQuery({ queryKey: ['holdings'], queryFn: fetchHoldings });
  const assetCategoryQuery = useQuery({ queryKey: ['categories', 'asset'], queryFn: () => fetchCategories('asset') });
  const liabilityCategoryQuery = useQuery({ queryKey: ['categories', 'liability'], queryFn: () => fetchCategories('liability') });

  const refreshHoldingRelatedQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['holdings'] }),
      queryClient.invalidateQueries({ queryKey: ['trend'] }),
      queryClient.invalidateQueries({ queryKey: ['rebalance'] }),
      queryClient.invalidateQueries({ queryKey: ['sankey'] }),
      queryClient.invalidateQueries({ queryKey: ['volatility'] }),
      queryClient.invalidateQueries({ queryKey: ['correlation'] }),
      queryClient.invalidateQueries({ queryKey: ['currency-overview'] }),
    ]);
  };

  const createHoldingMutation = useMutation({
    mutationFn: createHolding,
    onSuccess: async () => {
      setOpen(false);
      setForm(INITIAL_FORM);
      setEditing(null);
      await refreshHoldingRelatedQueries();
    },
  });

  const updateHoldingMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: HoldingPayload }) => updateHolding(id, payload),
    onSuccess: async () => {
      setOpen(false);
      setForm(INITIAL_FORM);
      setEditing(null);
      await refreshHoldingRelatedQueries();
    },
  });

  const deleteHoldingMutation = useMutation({
    mutationFn: deleteHolding,
    onSuccess: async () => {
      await refreshHoldingRelatedQueries();
    },
  });

  const allPathOptions = useMemo(() => {
    if (form.type === 'asset') {
      return buildPathOptions(assetCategoryQuery.data ?? []);
    }
    return buildPathOptions(liabilityCategoryQuery.data ?? []);
  }, [form.type, assetCategoryQuery.data, liabilityCategoryQuery.data]);

  const pathOptions = useMemo(() => {
    const filtered = allPathOptions.filter((option) => option.label !== LEGACY_CATEGORY_PATH_LABEL);
    if (editing == null) {
      return filtered;
    }

    const selected = allPathOptions.find((option) => option.key === form.pathKey);
    if (!selected || selected.label !== LEGACY_CATEGORY_PATH_LABEL) {
      return filtered;
    }
    return [selected, ...filtered];
  }, [allPathOptions, editing, form.pathKey]);

  const pathSelectOptions = useMemo<SearchableSelectOption[]>(
    () =>
      pathOptions.map((option) => ({
        value: option.key,
        label: option.label,
        searchText: option.label.replace(/\//g, ' '),
      })),
    [pathOptions]
  );

  const currencyOptions = useMemo(() => {
    const current = form.currency.trim().toUpperCase();
    if (!current || COMMON_CURRENCY_OPTIONS.some((option) => String(option.value) === current)) {
      return COMMON_CURRENCY_OPTIONS;
    }
    return [{ value: current, label: `${current}（当前币种）`, searchText: current }, ...COMMON_CURRENCY_OPTIONS];
  }, [form.currency]);

  const memberNameMap = useMemo(() => {
    const map = new Map<number, string>();
    (membersQuery.data ?? []).forEach((m) => map.set(m.id, m.name));
    return map;
  }, [membersQuery.data]);
  const hasMembers = (membersQuery.data ?? []).length > 0;

  const openCreateDialog = () => {
    void assetCategoryQuery.refetch();
    void liabilityCategoryQuery.refetch();
    setEditing(null);
    setForm({ ...INITIAL_FORM, memberId: String((membersQuery.data ?? [])[0]?.id ?? ''), pathKey: '' });
    setError(null);
    setOpen(true);
  };

  const openEditDialog = (row: Holding) => {
    void assetCategoryQuery.refetch();
    void liabilityCategoryQuery.refetch();
    setEditing(row);
    setError(null);
    setForm({
      memberId: String(row.member_id),
      type: row.type,
      name: row.name,
      pathKey: `${row.category_l1_id}|${row.category_l2_id}|${row.category_l3_id}`,
      currency: row.currency,
      amountOriginal: String(row.amount_original),
      targetRatio: row.target_ratio == null ? '' : String(row.target_ratio),
    });
    setOpen(true);
  };

  const submitForm = () => {
    setError(null);

    if (!form.memberId) {
      setError('请选择成员');
      return;
    }
    if (!form.name.trim()) {
      setError('请输入名称');
      return;
    }
    if (!form.pathKey) {
      setError('请选择三级分类路径');
      return;
    }
    if (!form.currency.trim()) {
      setError('请选择币种');
      return;
    }
    if (!form.amountOriginal) {
      setError('请输入金额');
      return;
    }
    if (!hasValidTwoDecimalAmount(form.amountOriginal)) {
      setError('金额必须大于 0，且最多支持两位小数');
      return;
    }
    if (form.type === 'asset' && (!form.targetRatio || Number(form.targetRatio) < 0 || Number(form.targetRatio) > 100)) {
      setError('资产期望占比必须在 0 到 100 之间');
      return;
    }

    const selectedPath = pathOptions.find((p) => p.key === form.pathKey);
    if (!selectedPath) {
      setError('分类路径无效');
      return;
    }

    const payload: HoldingPayload = {
      member_id: Number(form.memberId),
      type: form.type,
      name: form.name.trim(),
      category_l1_id: selectedPath.l1Id,
      category_l2_id: selectedPath.l2Id,
      category_l3_id: selectedPath.l3Id,
      currency: form.currency.trim().toUpperCase(),
      amount_original: form.amountOriginal,
      target_ratio: form.type === 'asset' ? form.targetRatio : null,
    };

    if (editing) {
      updateHoldingMutation.mutate({ id: editing.id, payload });
    } else {
      createHoldingMutation.mutate(payload);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">资产与负债录入</h2>
          <p className="text-sm text-muted-foreground">固定三级分类与多币种金额录入，成员由“成员管理”菜单统一维护</p>
        </div>
        <Button onClick={openCreateDialog} disabled={!hasMembers}>
          <Plus className="mr-2 h-4 w-4" />
          新增条目
        </Button>
      </div>

      {!hasMembers ? (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-amber-900">当前还没有可用成员，新增资产负债前请先创建成员。</div>
            <Button variant="secondary" onClick={() => navigate('/members')}>
              <UsersRound className="mr-2 h-4 w-4" />
              去新增成员
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">录入列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
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
                {(holdingsQuery.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Badge variant={row.type === 'asset' ? 'default' : 'secondary'}>{row.type === 'asset' ? '资产' : '负债'}</Badge>
                    </TableCell>
                    <TableCell>{memberNameMap.get(row.member_id) ?? row.member_id}</TableCell>
                    <TableCell>{row.currency}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.amount_original, row.currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.amount_base)}</TableCell>
                    <TableCell className="text-right">{row.target_ratio == null ? '-' : `${row.target_ratio}%`}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteHoldingMutation.mutate(row.id)}>
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(holdingsQuery.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      暂无录入数据
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        title={editing ? '编辑条目' : '新增条目'}
        description="保存后将自动触发事件快照记录"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={submitForm} disabled={createHoldingMutation.isPending || updateHoldingMutation.isPending}>
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
              onChange={(event) => setForm((prev) => ({ ...prev, memberId: event.target.value }))}
              options={(membersQuery.data ?? []).map((member) => ({ label: member.name, value: member.id }))}
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
            <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <div className="mb-1 flex items-center gap-1.5">
              <label className="block text-sm text-muted-foreground">三级分类路径</label>
              <Tooltip
                content="请选择完整的一级 / 二级 / 三级分类路径；支持输入关键词搜索，例如“权益”“住房”“信用卡”。"
                label="三级分类路径说明"
              />
            </div>
            <SearchableSelect
              value={form.pathKey}
              onValueChange={(value) => setForm((prev) => ({ ...prev, pathKey: value }))}
              options={pathSelectOptions}
              placeholder="搜索一级 / 二级 / 三级分类"
              emptyMessage="没有匹配的分类路径"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">币种</label>
            <SearchableSelect
              value={form.currency}
              onValueChange={(value) => setForm((prev) => ({ ...prev, currency: value }))}
              options={currencyOptions}
              placeholder="搜索币种代码或中文名"
              emptyMessage="没有匹配的币种"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <label className="block text-sm text-muted-foreground">金额</label>
              <Tooltip content="金额仅支持输入两位小数，例如 100.00" label="金额输入说明" />
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
                <label className="block text-sm text-muted-foreground">期望占比(%)</label>
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
                onChange={(event) => setForm((prev) => ({ ...prev, targetRatio: event.target.value }))}
              />
            </div>
          ) : null}
        </div>
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      </Dialog>
    </div>
  );
}
