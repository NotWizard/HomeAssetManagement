import { useEffect, useMemo, useState } from 'react';
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
import { invalidateHoldingRelatedQueries } from '../services/holdingRelatedQueries';
import {
  bulkDeleteHoldings,
  createHolding,
  deleteHolding,
  fetchHoldings,
  updateHolding,
  type HoldingBulkDeletePayload,
  type HoldingPayload,
} from '../services/holdings';
import { fetchMembers } from '../services/members';
import { fetchSettings } from '../services/settings';
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

type HoldingFilterType = 'all' | 'asset' | 'liability';

type BulkDeleteSummary = {
  count: number;
  assetCount: number;
  liabilityCount: number;
  totalBase: number;
  previewNames: string[];
};

type TargetRatioStatus = {
  label: '未达标' | '已达标' | '已超出';
  detail: string;
  badgeClassName: string;
  detailClassName: string;
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
const TARGET_RATIO_EPSILON = 0.0001;

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

function summarizeHoldings(rows: Holding[]): BulkDeleteSummary {
  const assetCount = rows.filter((row) => row.type === 'asset').length;
  return {
    count: rows.length,
    assetCount,
    liabilityCount: rows.length - assetCount,
    totalBase: rows.reduce((sum, row) => sum + Number(row.amount_base ?? 0), 0),
    previewNames: rows.slice(0, 5).map((row) => row.name),
  };
}

function buildBulkErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return '批量删除失败，请稍后重试';
}

function sumAssetTargetRatio(rows: Holding[]): number {
  return rows.reduce((sum, row) => {
    if (row.type !== 'asset' || row.target_ratio == null) {
      return sum;
    }
    return sum + Number(row.target_ratio);
  }, 0);
}

function formatTargetRatio(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`;
}

function formatTargetRatioSummary(value: number): string {
  const roundedOneDecimal = Math.round((value + Number.EPSILON) * 10) / 10;
  if (roundedOneDecimal === 100 && Math.abs(value - 100) > TARGET_RATIO_EPSILON) {
    return formatTargetRatio(value, 2);
  }
  return formatTargetRatio(roundedOneDecimal);
}

function formatTargetRatioDelta(value: number): string {
  const normalized = Math.abs(value);
  if (normalized > TARGET_RATIO_EPSILON && normalized < 0.1) {
    return formatTargetRatio(normalized, 2);
  }
  return formatTargetRatio(normalized);
}

function buildTargetRatioStatus(totalRatio: number): TargetRatioStatus {
  const delta = 100 - totalRatio;
  if (Math.abs(delta) <= TARGET_RATIO_EPSILON) {
    return {
      label: '已达标',
      detail: '已达到 100.0%',
      badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      detailClassName: 'text-emerald-700',
    };
  }
  if (delta > 0) {
    return {
      label: '未达标',
      detail: `还差 ${formatTargetRatioDelta(delta)}`,
      badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700',
      detailClassName: 'text-amber-700',
    };
  }
  return {
    label: '已超出',
    detail: `超出 ${formatTargetRatioDelta(delta)}`,
    badgeClassName: 'border-rose-200 bg-rose-50 text-rose-700',
    detailClassName: 'text-rose-700',
  };
}

export function EntryPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [form, setForm] = useState<EntryFormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [memberFilter, setMemberFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<HoldingFilterType>('all');
  const [selectedHoldingIds, setSelectedHoldingIds] = useState<number[]>([]);
  const [selectedDeleteOpen, setSelectedDeleteOpen] = useState(false);
  const [memberDeleteOpen, setMemberDeleteOpen] = useState(false);
  const [memberDeleteId, setMemberDeleteId] = useState('');
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  const membersQuery = useQuery({ queryKey: ['members'], queryFn: fetchMembers });
  const holdingsQuery = useQuery({ queryKey: ['holdings'], queryFn: fetchHoldings });
  const assetCategoryQuery = useQuery({ queryKey: ['categories', 'asset'], queryFn: () => fetchCategories('asset') });
  const liabilityCategoryQuery = useQuery({ queryKey: ['categories', 'liability'], queryFn: () => fetchCategories('liability') });
  const settingsQuery = useQuery({ queryKey: ['settings', 'entry'], queryFn: fetchSettings });
  const baseCurrency = settingsQuery.data?.base_currency ?? 'CNY';

  const createHoldingMutation = useMutation({
    mutationFn: createHolding,
    onSuccess: async () => {
      setOpen(false);
      setForm(INITIAL_FORM);
      setEditing(null);
      setError(null);
      await invalidateHoldingRelatedQueries(queryClient);
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : '保存失败，请稍后重试');
    },
  });

  const updateHoldingMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: HoldingPayload }) => updateHolding(id, payload),
    onSuccess: async () => {
      setOpen(false);
      setForm(INITIAL_FORM);
      setEditing(null);
      setError(null);
      await invalidateHoldingRelatedQueries(queryClient);
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : '保存失败，请稍后重试');
    },
  });

  const deleteHoldingMutation = useMutation({
    mutationFn: deleteHolding,
    onSuccess: async () => {
      setActionError(null);
      await invalidateHoldingRelatedQueries(queryClient);
    },
    onError: (e) => {
      setActionError(e instanceof Error ? e.message : '删除失败，请稍后重试');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (payload: HoldingBulkDeletePayload) => bulkDeleteHoldings(payload),
    onSuccess: async () => {
      setSelectedHoldingIds([]);
      setSelectedDeleteOpen(false);
      setMemberDeleteOpen(false);
      setMemberDeleteId('');
      setBulkDeleteError(null);
      await invalidateHoldingRelatedQueries(queryClient);
    },
    onError: (mutationError) => {
      setBulkDeleteError(buildBulkErrorMessage(mutationError));
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
    (membersQuery.data ?? []).forEach((member) => map.set(member.id, member.name));
    return map;
  }, [membersQuery.data]);

  const allHoldings = holdingsQuery.data ?? [];
  const hasMembers = (membersQuery.data ?? []).length > 0;
  const hasLoadedHoldings = holdingsQuery.data != null;

  const filteredHoldings = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return allHoldings.filter((row) => {
      if (memberFilter !== 'all' && row.member_id !== Number(memberFilter)) {
        return false;
      }
      if (typeFilter !== 'all' && row.type !== typeFilter) {
        return false;
      }
      if (!normalizedKeyword) {
        return true;
      }
      const memberName = memberNameMap.get(row.member_id) ?? '';
      const searchText = [row.name, memberName, row.currency, row.type === 'asset' ? '资产' : '负债'].join(' ').toLowerCase();
      return searchText.includes(normalizedKeyword);
    });
  }, [allHoldings, keyword, memberFilter, typeFilter, memberNameMap]);

  const totalAssetTargetRatio = useMemo(() => sumAssetTargetRatio(allHoldings), [allHoldings]);
  const filteredAssetTargetRatio = useMemo(() => sumAssetTargetRatio(filteredHoldings), [filteredHoldings]);
  const targetRatioStatus = useMemo(() => buildTargetRatioStatus(totalAssetTargetRatio), [totalAssetTargetRatio]);
  const hasAssetHoldings = useMemo(() => allHoldings.some((row) => row.type === 'asset'), [allHoldings]);

  const selectedIdSet = useMemo(() => new Set(selectedHoldingIds), [selectedHoldingIds]);

  const selectedHoldings = useMemo(
    () => allHoldings.filter((row) => selectedIdSet.has(row.id)),
    [allHoldings, selectedIdSet]
  );

  const selectedSummary = useMemo(() => summarizeHoldings(selectedHoldings), [selectedHoldings]);
  const memberDeleteTargetRows = useMemo(() => {
    if (!memberDeleteId) {
      return [];
    }
    return allHoldings.filter((row) => row.member_id === Number(memberDeleteId));
  }, [allHoldings, memberDeleteId]);
  const memberDeleteSummary = useMemo(() => summarizeHoldings(memberDeleteTargetRows), [memberDeleteTargetRows]);

  const memberDeleteOptions = useMemo(
    () =>
      (membersQuery.data ?? []).map((member) => {
        const count = allHoldings.filter((row) => row.member_id === member.id).length;
        return {
          label: `${member.name}（${count}条）`,
          value: member.id,
        };
      }),
    [allHoldings, membersQuery.data]
  );

  const allVisibleSelected = filteredHoldings.length > 0 && filteredHoldings.every((row) => selectedIdSet.has(row.id));

  useEffect(() => {
    setSelectedHoldingIds([]);
  }, [keyword, memberFilter, typeFilter]);

  useEffect(() => {
    const validIds = new Set(allHoldings.map((row) => row.id));
    setSelectedHoldingIds((current) => current.filter((id) => validIds.has(id)));
  }, [allHoldings]);

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

  const openSelectedDeleteDialog = () => {
    setBulkDeleteError(null);
    setSelectedDeleteOpen(true);
  };

  const openMemberDeleteDialog = () => {
    const defaultMemberId =
      memberFilter !== 'all'
        ? memberFilter
        : String(
            (membersQuery.data ?? []).find((member) => allHoldings.some((row) => row.member_id === member.id))?.id ??
              (membersQuery.data ?? [])[0]?.id ??
              ''
          );
    setMemberDeleteId(defaultMemberId);
    setBulkDeleteError(null);
    setMemberDeleteOpen(true);
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

    const selectedPath = pathOptions.find((option) => option.key === form.pathKey);
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

  const toggleHoldingSelection = (holdingId: number, checked: boolean) => {
    setSelectedHoldingIds((current) => {
      if (checked) {
        return current.includes(holdingId) ? current : [...current, holdingId];
      }
      return current.filter((id) => id !== holdingId);
    });
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedHoldingIds((current) => {
      const next = new Set(current);
      if (checked) {
        filteredHoldings.forEach((row) => next.add(row.id));
      } else {
        filteredHoldings.forEach((row) => next.delete(row.id));
      }
      return Array.from(next);
    });
  };

  const submitDeleteSelected = () => {
    if (selectedHoldings.length === 0) {
      setBulkDeleteError('请至少勾选一条资产/负债');
      return;
    }
    setBulkDeleteError(null);
    bulkDeleteMutation.mutate({
      mode: 'ids',
      holding_ids: selectedHoldings.map((row) => row.id),
    });
  };

  const submitDeleteByMember = () => {
    if (!memberDeleteId) {
      setBulkDeleteError('请选择成员');
      return;
    }
    if (memberDeleteSummary.count === 0) {
      setBulkDeleteError('该成员暂无可删除的资产/负债');
      return;
    }
    setBulkDeleteError(null);
    bulkDeleteMutation.mutate({ mode: 'member', member_id: Number(memberDeleteId) });
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
          {actionError ? (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-sm text-rose-700">
              {actionError}
            </div>
          ) : null}
          {hasLoadedHoldings && hasAssetHoldings ? (
            <div className="mb-4 rounded-2xl border border-border/60 bg-muted/15 px-3 py-3 sm:px-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-xs font-medium tracking-[0.14em] text-muted-foreground">目标占比状态</div>
                <div
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold ${targetRatioStatus.badgeClassName}`}
                >
                  {targetRatioStatus.label}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-background/90 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm text-muted-foreground">当前资产合计</div>
                      <div className="mt-1 text-[2rem] font-semibold leading-none tracking-tight">
                        {formatTargetRatioSummary(totalAssetTargetRatio)}
                      </div>
                    </div>
                    <div className={`pt-0.5 text-xs font-semibold ${targetRatioStatus.detailClassName}`}>{targetRatioStatus.detail}</div>
                  </div>
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    全部资产目标占比求和，当前筛选资产 {formatTargetRatioSummary(filteredAssetTargetRatio)}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-100/80 bg-emerald-50/40 px-3 py-2.5">
                  <div className="text-sm text-muted-foreground">目标占比</div>
                  <div className="mt-1 flex items-start justify-between gap-3">
                    <div className="text-[2rem] font-semibold leading-none tracking-tight">100.0%</div>
                    <div className="pt-0.5 text-xs font-medium text-muted-foreground">全部资产配平基准</div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid gap-3 md:grid-cols-3 xl:flex-1">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">名称搜索</label>
                <Input placeholder="搜索名称、成员、币种" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">成员筛选</label>
                <Select
                  value={memberFilter}
                  onChange={(event) => setMemberFilter(event.target.value)}
                  options={[
                    { label: '全部成员', value: 'all' },
                    ...(membersQuery.data ?? []).map((member) => ({ label: member.name, value: member.id })),
                  ]}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">类型筛选</label>
                <Select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as HoldingFilterType)}
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
                当前筛选 {filteredHoldings.length} 条，已选 {selectedHoldingIds.length} 条
              </div>
              <Button variant="outline" onClick={openMemberDeleteDialog} disabled={allHoldings.length === 0 || bulkDeleteMutation.isPending}>
                按成员删除
              </Button>
              <Button
                variant="destructive"
                onClick={openSelectedDeleteDialog}
                disabled={selectedHoldingIds.length === 0 || bulkDeleteMutation.isPending}
              >
                删除已选
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 px-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border"
                      checked={allVisibleSelected}
                      onChange={(event) => toggleSelectAllVisible(event.target.checked)}
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
                {filteredHoldings.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="w-12 px-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border"
                        checked={selectedIdSet.has(row.id)}
                        onChange={(event) => toggleHoldingSelection(row.id, event.target.checked)}
                        aria-label={`选择 ${row.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Badge variant={row.type === 'asset' ? 'default' : 'secondary'}>{row.type === 'asset' ? '资产' : '负债'}</Badge>
                    </TableCell>
                    <TableCell>{memberNameMap.get(row.member_id) ?? row.member_id}</TableCell>
                    <TableCell>{row.currency}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.amount_original, row.currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.amount_base, baseCurrency)}</TableCell>
                    <TableCell className="text-right">{row.target_ratio == null ? '-' : `${row.target_ratio}%`}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteHoldingMutation.mutate(row.id)}
                          disabled={deleteHoldingMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredHoldings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      {allHoldings.length === 0 ? '暂无录入数据' : '当前筛选条件下暂无匹配数据'}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={selectedDeleteOpen}
        title="批量删除已选条目"
        description="删除后将立即刷新录入列表、快照与分析看板数据。"
        onClose={() => {
          setSelectedDeleteOpen(false);
          setBulkDeleteError(null);
        }}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedDeleteOpen(false);
                setBulkDeleteError(null);
              }}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={submitDeleteSelected} disabled={bulkDeleteMutation.isPending || selectedSummary.count === 0}>
              {bulkDeleteMutation.isPending ? '删除中...' : `删除已选（${selectedSummary.count}）`}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-secondary/20 p-3">
              <div className="text-xs text-muted-foreground">已选条目</div>
              <div className="mt-1 text-lg font-semibold">{selectedSummary.count}</div>
            </div>
            <div className="rounded-lg border bg-secondary/20 p-3">
              <div className="text-xs text-muted-foreground">资产 / 负债</div>
              <div className="mt-1 text-lg font-semibold">{selectedSummary.assetCount} / {selectedSummary.liabilityCount}</div>
            </div>
            <div className="rounded-lg border bg-secondary/20 p-3">
              <div className="text-xs text-muted-foreground">折算金额</div>
              <div className="mt-1 text-lg font-semibold">{formatCurrency(selectedSummary.totalBase, baseCurrency)}</div>
            </div>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-sm text-rose-700">
            此操作不可撤销，将删除当前已勾选的资产与负债，并立即重建最新快照。
          </div>
          {selectedSummary.previewNames.length > 0 ? (
            <div className="text-sm text-muted-foreground">示例条目：{selectedSummary.previewNames.join('、')}</div>
          ) : null}
          {bulkDeleteError ? <p className="text-sm text-rose-600">{bulkDeleteError}</p> : null}
        </div>
      </Dialog>

      <Dialog
        open={memberDeleteOpen}
        title="按成员删除资产负债"
        description="支持直接清空某个成员名下的全部资产和负债数据。"
        onClose={() => {
          setMemberDeleteOpen(false);
          setBulkDeleteError(null);
        }}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setMemberDeleteOpen(false);
                setBulkDeleteError(null);
              }}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={submitDeleteByMember} disabled={bulkDeleteMutation.isPending || memberDeleteSummary.count === 0}>
              {bulkDeleteMutation.isPending ? '删除中...' : '删除该成员全部数据'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">成员</label>
            <Select value={memberDeleteId} onChange={(event) => setMemberDeleteId(event.target.value)} options={memberDeleteOptions} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-secondary/20 p-3">
              <div className="text-xs text-muted-foreground">待删除条目</div>
              <div className="mt-1 text-lg font-semibold">{memberDeleteSummary.count}</div>
            </div>
            <div className="rounded-lg border bg-secondary/20 p-3">
              <div className="text-xs text-muted-foreground">资产 / 负债</div>
              <div className="mt-1 text-lg font-semibold">{memberDeleteSummary.assetCount} / {memberDeleteSummary.liabilityCount}</div>
            </div>
            <div className="rounded-lg border bg-secondary/20 p-3">
              <div className="text-xs text-muted-foreground">折算金额</div>
              <div className="mt-1 text-lg font-semibold">{formatCurrency(memberDeleteSummary.totalBase, baseCurrency)}</div>
            </div>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-sm text-rose-700">
            将删除该成员名下全部资产与负债。删除完成后，录入列表与分析数据会立即刷新。
          </div>
          {memberDeleteSummary.previewNames.length > 0 ? (
            <div className="text-sm text-muted-foreground">示例条目：{memberDeleteSummary.previewNames.join('、')}</div>
          ) : null}
          {bulkDeleteError ? <p className="text-sm text-rose-600">{bulkDeleteError}</p> : null}
        </div>
      </Dialog>

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
