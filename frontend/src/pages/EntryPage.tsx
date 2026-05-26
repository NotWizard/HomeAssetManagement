import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { EntryBulkDeleteDialogs } from '../components/entry/EntryBulkDeleteDialogs';
import {
  buildBulkErrorMessage,
  buildMemberAllocationSummaries,
  buildNormalizationPlan,
  summarizeHoldings,
  summarizeMemberAllocations,
} from '../components/entry/entryPageLogic';
import { EntryFiltersBar } from '../components/entry/EntryFiltersBar';
import { EntryHoldingFormDialog } from '../components/entry/EntryHoldingFormDialog';
import { EntryHoldingsTable } from '../components/entry/EntryHoldingsTable';
import { EntryNormalizeDialog } from '../components/entry/EntryNormalizeDialog';
import { EntryTargetRatioSummary } from '../components/entry/EntryTargetRatioSummary';
import {
  buildCreateEntryForm,
  buildEditEntryForm,
  buildHoldingPayload,
  INITIAL_ENTRY_FORM,
  resolveDefaultMemberDeleteId,
  type EntryFormState,
  validateEntryForm,
} from '../components/entry/entryPageController';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { type SearchableSelectOption } from '../components/ui/searchable-select';
import { PageHeader } from '../components/layout/PageHeader';
import { fetchCategories } from '../services/categories';
import {
  invalidateHoldingRelatedQueries,
  invalidateAllHoldingDependentQueries,
  queryKeys,
} from '../services/holdingRelatedQueries';
import {
  bulkDeleteHoldings,
  bulkUpdateHoldingTargetRatio,
  createHolding,
  deleteHolding,
  fetchHoldings,
  updateHolding,
  type HoldingBulkDeletePayload,
  type HoldingPayload,
} from '../services/holdings';
import { fetchMembers } from '../services/members';
import { fetchSettings } from '../services/settings';
import type { Holding, Member } from '../types';

type HoldingFilterType = 'all' | 'asset' | 'liability';

// 模块级冻结空数组，给 `holdingsQuery.data ?? EMPTY_HOLDINGS` 用：
// 避免 `?? []` 每次 render 产生新引用，击穿下游所有 useMemo 依赖。
const EMPTY_HOLDINGS: Holding[] = [];
const EMPTY_MEMBERS: Member[] = [];

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

export function EntryPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [form, setForm] = useState<EntryFormState>(INITIAL_ENTRY_FORM);
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
  const [focusedMemberId, setFocusedMemberId] = useState<number | null>(null);
  const [normalizeMemberId, setNormalizeMemberId] = useState<number | null>(null);
  const [normalizeError, setNormalizeError] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: queryKeys.members.all(),
    queryFn: fetchMembers,
    staleTime: 5 * 60_000,
  });
  const holdingsQuery = useQuery({
    queryKey: queryKeys.holdings.all(),
    queryFn: fetchHoldings,
    staleTime: 60_000,
  });
  const assetCategoryQuery = useQuery({
    queryKey: queryKeys.categories.type('asset'),
    queryFn: () => fetchCategories('asset'),
    staleTime: 5 * 60_000,
  });
  const liabilityCategoryQuery = useQuery({
    queryKey: queryKeys.categories.type('liability'),
    queryFn: () => fetchCategories('liability'),
    staleTime: 5 * 60_000,
  });
  const settingsQuery = useQuery({ queryKey: queryKeys.settings.all(), queryFn: fetchSettings });
  const baseCurrency = settingsQuery.data?.base_currency ?? 'CNY';

  const createHoldingMutation = useMutation({
    mutationFn: createHolding,
    onSuccess: async () => {
      setOpen(false);
      setForm(INITIAL_ENTRY_FORM);
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
      setForm(INITIAL_ENTRY_FORM);
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
      // 批量删除可能涉及多成员、跨币种、跨大类，对分析数据冲击大，走全失效刷所有派生缓存
      await invalidateAllHoldingDependentQueries(queryClient);
    },
    onError: (mutationError) => {
      setBulkDeleteError(buildBulkErrorMessage(mutationError));
    },
  });

  const normalizeMutation = useMutation({
    mutationFn: bulkUpdateHoldingTargetRatio,
    onSuccess: async () => {
      setNormalizeMemberId(null);
      setNormalizeError(null);
      await invalidateHoldingRelatedQueries(queryClient);
    },
    onError: (mutationError) => {
      setNormalizeError(
        mutationError instanceof Error ? mutationError.message : '归一化失败，请稍后重试'
      );
    },
  });

  const assetTree = assetCategoryQuery.data ?? [];
  const liabilityTree = liabilityCategoryQuery.data ?? [];

  // 用模块级 EMPTY 常量替代 `?? []`，保证 query 数据未加载时下游 useMemo 依赖引用稳定，
  // 不会因为每次 render 新建空数组而被击穿。
  const allHoldings = holdingsQuery.data ?? EMPTY_HOLDINGS;
  const members = membersQuery.data ?? EMPTY_MEMBERS;
  const hasMembers = members.length > 0;
  const hasLoadedHoldings = holdingsQuery.data != null;

  const currencyOptions = useMemo(() => {
    const current = form.currency.trim().toUpperCase();
    if (!current || COMMON_CURRENCY_OPTIONS.some((option) => String(option.value) === current)) {
      return COMMON_CURRENCY_OPTIONS;
    }
    return [{ value: current, label: `${current}（当前币种）`, searchText: current }, ...COMMON_CURRENCY_OPTIONS];
  }, [form.currency]);

  const memberNameMap = useMemo(() => {
    const map = new Map<number, string>();
    members.forEach((member) => map.set(member.id, member.name));
    return map;
  }, [members]);

  const memberSummaries = useMemo(
    () => buildMemberAllocationSummaries(allHoldings, members),
    [allHoldings, members]
  );

  const memberAllocationOverview = useMemo(
    () => summarizeMemberAllocations(memberSummaries),
    [memberSummaries]
  );

  // useDeferredValue：keyword 输入时 input 立即响应（不抢占），过滤计算延后到下一帧；
  // 输入连续按键时合并多次过滤为一次最终计算。
  const deferredKeyword = useDeferredValue(keyword);

  const filteredHoldings = useMemo(() => {
    const normalizedKeyword = deferredKeyword.trim().toLowerCase();
    return allHoldings.filter((row) => {
      if (focusedMemberId != null && row.member_id !== focusedMemberId) {
        return false;
      }
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
  }, [allHoldings, deferredKeyword, memberFilter, typeFilter, memberNameMap, focusedMemberId]);

  const normalizeMember = useMemo(
    () =>
      normalizeMemberId == null
        ? null
        : memberSummaries.find((summary) => summary.memberId === normalizeMemberId) ?? null,
    [memberSummaries, normalizeMemberId]
  );

  const normalizeMemberAssets = useMemo(() => {
    if (normalizeMemberId == null) {
      return [];
    }
    return allHoldings.filter(
      (row) => row.type === 'asset' && row.member_id === normalizeMemberId
    );
  }, [allHoldings, normalizeMemberId]);

  const normalizationPlan = useMemo(
    () => buildNormalizationPlan(normalizeMemberAssets),
    [normalizeMemberAssets]
  );

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
      (members).map((member) => {
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
    setForm(buildCreateEntryForm(members));
    setError(null);
    setOpen(true);
  };

  const openEditDialog = useCallback(
    (row: Holding) => {
      void assetCategoryQuery.refetch();
      void liabilityCategoryQuery.refetch();
      setEditing(row);
      setError(null);
      setForm(buildEditEntryForm(row));
      setOpen(true);
    },
    [assetCategoryQuery, liabilityCategoryQuery]
  );

  const openSelectedDeleteDialog = () => {
    setBulkDeleteError(null);
    setSelectedDeleteOpen(true);
  };

  const openMemberDeleteDialog = () => {
    setMemberDeleteId(
      resolveDefaultMemberDeleteId({
        memberFilter,
        members: members,
        holdings: allHoldings,
      })
    );
    setBulkDeleteError(null);
    setMemberDeleteOpen(true);
  };

  const submitForm = () => {
    setError(null);
    const validation = validateEntryForm(form);
    if (validation.error || validation.category == null) {
      setError(validation.error ?? '分类无效');
      return;
    }

    const payload: HoldingPayload = buildHoldingPayload(
      form,
      validation.category
    );

    if (editing) {
      updateHoldingMutation.mutate({ id: editing.id, payload });
    } else {
      createHoldingMutation.mutate(payload);
    }
  };

  const toggleHoldingSelection = useCallback((holdingId: number, checked: boolean) => {
    setSelectedHoldingIds((current) => {
      if (checked) {
        return current.includes(holdingId) ? current : [...current, holdingId];
      }
      return current.filter((id) => id !== holdingId);
    });
  }, []);

  const toggleSelectAllVisible = useCallback((checked: boolean) => {
    setSelectedHoldingIds((current) => {
      const next = new Set(current);
      if (checked) {
        filteredHoldings.forEach((row) => next.add(row.id));
      } else {
        filteredHoldings.forEach((row) => next.delete(row.id));
      }
      return Array.from(next);
    });
  }, [filteredHoldings]);

  const handleDeleteHolding = useCallback(
    (holdingId: number) => deleteHoldingMutation.mutate(holdingId),
    [deleteHoldingMutation]
  );

  const handleOpenNormalize = useCallback(
    (memberId: number) => {
      setNormalizeError(null);
      setNormalizeMemberId(memberId);
    },
    []
  );

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
    <div className="space-y-6">
      <PageHeader
        eyebrow="ENTRY"
        title="资产与负债录入"
        description={'固定三级分类与多币种金额录入，成员由“成员管理”菜单统一维护。'}
        actions={
          <Button onClick={openCreateDialog} disabled={!hasMembers}>
            <Plus className="mr-2 h-4 w-4" />
            新增条目
          </Button>
        }
      />

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
          <EntryTargetRatioSummary
            hasLoadedHoldings={hasLoadedHoldings}
            memberSummaries={memberSummaries}
            overview={memberAllocationOverview}
            focusedMemberId={focusedMemberId}
            onFocusMember={(memberId) => {
              setFocusedMemberId(memberId);
              if (memberId != null) {
                const target = document.getElementById(`entry-group-${memberId}`);
                if (target) {
                  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }
            }}
            onOpenNormalize={(memberId) => {
              setNormalizeError(null);
              setNormalizeMemberId(memberId);
            }}
          />
          <EntryFiltersBar
            keyword={keyword}
            memberFilter={memberFilter}
            typeFilter={typeFilter}
            memberOptions={[
              { label: '全部成员', value: 'all' },
              ...(members).map((member) => ({ label: member.name, value: member.id })),
            ]}
            filteredCount={filteredHoldings.length}
            selectedCount={selectedHoldingIds.length}
            hasAnyHoldings={allHoldings.length > 0}
            bulkDeletePending={bulkDeleteMutation.isPending}
            onKeywordChange={setKeyword}
            onMemberFilterChange={setMemberFilter}
            onTypeFilterChange={setTypeFilter}
            onOpenMemberDeleteDialog={openMemberDeleteDialog}
            onOpenSelectedDeleteDialog={openSelectedDeleteDialog}
          />

          <EntryHoldingsTable
            filteredHoldings={filteredHoldings}
            allHoldingsCount={allHoldings.length}
            allVisibleSelected={allVisibleSelected}
            selectedIdSet={selectedIdSet}
            memberNameMap={memberNameMap}
            baseCurrency={baseCurrency}
            deletePending={deleteHoldingMutation.isPending}
            memberSummaries={memberSummaries}
            focusedMemberId={focusedMemberId}
            onToggleSelectAllVisible={toggleSelectAllVisible}
            onToggleHoldingSelection={toggleHoldingSelection}
            onOpenEditDialog={openEditDialog}
            onDeleteHolding={handleDeleteHolding}
            onOpenNormalize={handleOpenNormalize}
          />
        </CardContent>
      </Card>

      <EntryBulkDeleteDialogs
        selectedDeleteOpen={selectedDeleteOpen}
        memberDeleteOpen={memberDeleteOpen}
        bulkDeleteError={bulkDeleteError}
        selectedSummary={selectedSummary}
        memberDeleteId={memberDeleteId}
        memberDeleteOptions={memberDeleteOptions}
        memberDeleteSummary={memberDeleteSummary}
        baseCurrency={baseCurrency}
        pending={bulkDeleteMutation.isPending}
        onCloseSelectedDelete={() => {
          setSelectedDeleteOpen(false);
          setBulkDeleteError(null);
        }}
        onCloseMemberDelete={() => {
          setMemberDeleteOpen(false);
          setBulkDeleteError(null);
        }}
        onMemberDeleteIdChange={setMemberDeleteId}
        onSubmitDeleteSelected={submitDeleteSelected}
        onSubmitDeleteByMember={submitDeleteByMember}
      />

      <EntryHoldingFormDialog
        open={open}
        editingTitle="编辑条目"
        editing={editing != null}
        form={form}
        error={error}
        members={members}
        assetTree={assetTree}
        liabilityTree={liabilityTree}
        currencyOptions={currencyOptions}
        submitting={
          createHoldingMutation.isPending || updateHoldingMutation.isPending
        }
        setForm={setForm}
        onClose={() => setOpen(false)}
        onSubmit={submitForm}
      />

      <EntryNormalizeDialog
        open={normalizeMember != null}
        memberName={normalizeMember?.memberName ?? ''}
        plan={normalizationPlan}
        pending={normalizeMutation.isPending}
        error={normalizeError}
        onClose={() => {
          setNormalizeMemberId(null);
          setNormalizeError(null);
        }}
        onSubmit={() => {
          if (normalizationPlan.items.length === 0) {
            return;
          }
          normalizeMutation.mutate({
            items: normalizationPlan.items.map((item) => ({
              id: item.id,
              target_ratio: item.proposed.toFixed(2),
            })),
          });
        }}
      />
    </div>
  );
}
