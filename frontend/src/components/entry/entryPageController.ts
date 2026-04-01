import type { HoldingPayload } from '../../services/holdings';
import type { Holding } from '../../types';
import type { PathOption } from './entryPageLogic';

export type EntryFormState = {
  memberId: string;
  type: 'asset' | 'liability';
  name: string;
  pathKey: string;
  currency: string;
  amountOriginal: string;
  targetRatio: string;
};

export type EntryFormValidationResult =
  | {
      error: string;
      selectedPath: null;
    }
  | {
      error: null;
      selectedPath: PathOption;
    };

type MemberLike = {
  id: number;
};

export const INITIAL_ENTRY_FORM: EntryFormState = {
  memberId: '',
  type: 'asset',
  name: '',
  pathKey: '',
  currency: '',
  amountOriginal: '',
  targetRatio: '',
};

export const LEGACY_CATEGORY_PATH_LABEL = '默认一级 / 默认二级 / 默认三级';

function hasValidTwoDecimalAmount(value: string): boolean {
  return /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
}

export function buildCreateEntryForm(members: MemberLike[]): EntryFormState {
  return {
    ...INITIAL_ENTRY_FORM,
    memberId: String(members[0]?.id ?? ''),
  };
}

export function buildEditEntryForm(row: Holding): EntryFormState {
  return {
    memberId: String(row.member_id),
    type: row.type,
    name: row.name,
    pathKey: `${row.category_l1_id}|${row.category_l2_id}|${row.category_l3_id}`,
    currency: row.currency,
    amountOriginal: String(row.amount_original),
    targetRatio: row.target_ratio == null ? '' : String(row.target_ratio),
  };
}

export function resolvePathOptions(
  allPathOptions: PathOption[],
  editing: Holding | null,
  pathKey: string
): PathOption[] {
  const filtered = allPathOptions.filter(
    (option) => option.label !== LEGACY_CATEGORY_PATH_LABEL
  );
  if (editing == null) {
    return filtered;
  }

  const selected = allPathOptions.find((option) => option.key === pathKey);
  if (!selected || selected.label !== LEGACY_CATEGORY_PATH_LABEL) {
    return filtered;
  }

  return [selected, ...filtered];
}

export function resolveDefaultMemberDeleteId(options: {
  memberFilter: string;
  members: MemberLike[];
  holdings: Holding[];
}): string {
  const { memberFilter, members, holdings } = options;
  if (memberFilter !== 'all') {
    return memberFilter;
  }

  const firstMemberWithHoldings = members.find((member) =>
    holdings.some((row) => row.member_id === member.id)
  );

  return String(firstMemberWithHoldings?.id ?? members[0]?.id ?? '');
}

export function validateEntryForm(
  form: EntryFormState,
  pathOptions: PathOption[]
): EntryFormValidationResult {
  if (!form.memberId) {
    return { error: '请选择成员', selectedPath: null };
  }
  if (!form.name.trim()) {
    return { error: '请输入名称', selectedPath: null };
  }
  if (!form.pathKey) {
    return { error: '请选择三级分类路径', selectedPath: null };
  }
  if (!form.currency.trim()) {
    return { error: '请选择币种', selectedPath: null };
  }
  if (!form.amountOriginal) {
    return { error: '请输入金额', selectedPath: null };
  }
  if (!hasValidTwoDecimalAmount(form.amountOriginal)) {
    return { error: '金额必须大于 0，且最多支持两位小数', selectedPath: null };
  }
  if (
    form.type === 'asset' &&
    (!form.targetRatio ||
      Number(form.targetRatio) < 0 ||
      Number(form.targetRatio) > 100)
  ) {
    return { error: '资产期望占比必须在 0 到 100 之间', selectedPath: null };
  }

  const selectedPath = pathOptions.find((option) => option.key === form.pathKey);
  if (!selectedPath) {
    return { error: '分类路径无效', selectedPath: null };
  }

  return {
    error: null,
    selectedPath,
  };
}

export function buildHoldingPayload(
  form: EntryFormState,
  selectedPath: PathOption
): HoldingPayload {
  return {
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
}
