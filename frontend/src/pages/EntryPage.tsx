import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';

import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { createMember, fetchMembers } from '../services/members';
import { createHolding, deleteHolding, fetchHoldings, updateHolding, type HoldingPayload } from '../services/holdings';
import { fetchCategories } from '../services/categories';
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
  currency: 'CNY',
  amountOriginal: '',
  targetRatio: '',
};

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

export function EntryPage() {
  const queryClient = useQueryClient();

  const [newMemberName, setNewMemberName] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [form, setForm] = useState<EntryFormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);

  const membersQuery = useQuery({ queryKey: ['members'], queryFn: fetchMembers });
  const holdingsQuery = useQuery({ queryKey: ['holdings'], queryFn: fetchHoldings });
  const assetCategoryQuery = useQuery({ queryKey: ['categories', 'asset'], queryFn: () => fetchCategories('asset') });
  const liabilityCategoryQuery = useQuery({ queryKey: ['categories', 'liability'], queryFn: () => fetchCategories('liability') });

  const createMemberMutation = useMutation({
    mutationFn: createMember,
    onSuccess: async () => {
      setNewMemberName('');
      await queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });

  const createHoldingMutation = useMutation({
    mutationFn: createHolding,
    onSuccess: async () => {
      setOpen(false);
      setForm(INITIAL_FORM);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['holdings'] });
      await queryClient.invalidateQueries({ queryKey: ['trend'] });
      await queryClient.invalidateQueries({ queryKey: ['rebalance'] });
    },
  });

  const updateHoldingMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: HoldingPayload }) => updateHolding(id, payload),
    onSuccess: async () => {
      setOpen(false);
      setForm(INITIAL_FORM);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['holdings'] });
      await queryClient.invalidateQueries({ queryKey: ['trend'] });
      await queryClient.invalidateQueries({ queryKey: ['rebalance'] });
    },
  });

  const deleteHoldingMutation = useMutation({
    mutationFn: deleteHolding,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['holdings'] });
      await queryClient.invalidateQueries({ queryKey: ['trend'] });
      await queryClient.invalidateQueries({ queryKey: ['rebalance'] });
    },
  });

  const pathOptions = useMemo(() => {
    if (form.type === 'asset') {
      return buildPathOptions(assetCategoryQuery.data ?? []);
    }
    return buildPathOptions(liabilityCategoryQuery.data ?? []);
  }, [form.type, assetCategoryQuery.data, liabilityCategoryQuery.data]);

  const memberNameMap = useMemo(() => {
    const map = new Map<number, string>();
    (membersQuery.data ?? []).forEach((m) => map.set(m.id, m.name));
    return map;
  }, [membersQuery.data]);

  const openCreateDialog = () => {
    setEditing(null);
    setForm({ ...INITIAL_FORM, memberId: String((membersQuery.data ?? [])[0]?.id ?? '') });
    setError(null);
    setOpen(true);
  };

  const openEditDialog = (row: Holding) => {
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
      setError('请输入币种');
      return;
    }
    if (!form.amountOriginal || Number(form.amountOriginal) <= 0) {
      setError('金额必须大于 0');
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
          <p className="text-sm text-muted-foreground">成员归属、固定三级分类与多币种金额录入</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          新增条目
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">成员管理</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newMemberName}
              onChange={(event) => setNewMemberName(event.target.value)}
              placeholder="输入成员名称，如：配偶"
              className="sm:max-w-xs"
            />
            <Button
              variant="secondary"
              onClick={() => {
                const value = newMemberName.trim();
                if (!value) return;
                createMemberMutation.mutate(value);
              }}
              disabled={createMemberMutation.isPending}
            >
              <Users className="mr-2 h-4 w-4" />
              添加成员
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(membersQuery.data ?? []).map((member) => (
              <Badge key={member.id} variant="secondary">
                {member.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
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
                      <Badge variant={row.type === 'asset' ? 'default' : 'secondary'}>
                        {row.type === 'asset' ? '资产' : '负债'}
                      </Badge>
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
                setForm((prev) => ({ ...prev, type: nextType, pathKey: '', targetRatio: nextType === 'asset' ? prev.targetRatio : '' }));
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
            <label className="mb-1 block text-sm text-muted-foreground">三级分类路径</label>
            <Select
              value={form.pathKey}
              onChange={(event) => setForm((prev) => ({ ...prev, pathKey: event.target.value }))}
              options={[{ label: '请选择分类路径', value: '' }, ...pathOptions.map((option) => ({ label: option.label, value: option.key }))]}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">币种</label>
            <Input value={form.currency} onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">金额</label>
            <Input
              type="number"
              min="0"
              value={form.amountOriginal}
              onChange={(event) => setForm((prev) => ({ ...prev, amountOriginal: event.target.value }))}
            />
          </div>
          {form.type === 'asset' ? (
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">期望占比(%)</label>
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
