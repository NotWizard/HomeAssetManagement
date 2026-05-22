import type { HoldingPayload } from '../../services/holdings';
import type { Holding } from '../../types';
import type { CategoryPickerValue } from './categoryTreePickerLogic';

export type EntryFormState = {
  memberId: string;
  name: string;
  category: CategoryPickerValue | null;
  currency: string;
  amountOriginal: string;
  targetRatio: string;
};

export type EntryFormValidationResult =
  | {
      error: string;
      category: null;
    }
  | {
      error: null;
      category: CategoryPickerValue;
    };

type MemberLike = {
  id: number;
};

export const INITIAL_ENTRY_FORM: EntryFormState = {
  memberId: '',
  name: '',
  category: null,
  currency: '',
  amountOriginal: '',
  targetRatio: '',
};

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
    name: row.name,
    category: {
      type: row.type,
      l1Id: row.category_l1_id,
      l2Id: row.category_l2_id,
      l3Id: row.category_l3_id,
    },
    currency: row.currency,
    amountOriginal: String(row.amount_original),
    targetRatio: row.target_ratio == null ? '' : String(row.target_ratio),
  };
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

export function validateEntryForm(form: EntryFormState): EntryFormValidationResult {
  if (!form.memberId) {
    return { error: '请选择成员', category: null };
  }
  if (!form.name.trim()) {
    return { error: '请输入名称', category: null };
  }
  if (!form.category) {
    return { error: '请选择资产或负债的三级分类', category: null };
  }
  if (!form.currency.trim()) {
    return { error: '请选择币种', category: null };
  }
  if (!form.amountOriginal) {
    return { error: '请输入金额', category: null };
  }
  if (!hasValidTwoDecimalAmount(form.amountOriginal)) {
    return { error: '金额必须大于 0，且最多支持两位小数', category: null };
  }
  if (
    form.category.type === 'asset' &&
    (!form.targetRatio ||
      Number(form.targetRatio) < 0 ||
      Number(form.targetRatio) > 100)
  ) {
    return { error: '资产期望占比必须在 0 到 100 之间', category: null };
  }

  return {
    error: null,
    category: form.category,
  };
}

export function buildHoldingPayload(
  form: EntryFormState,
  category: CategoryPickerValue
): HoldingPayload {
  return {
    member_id: Number(form.memberId),
    type: category.type,
    name: form.name.trim(),
    category_l1_id: category.l1Id,
    category_l2_id: category.l2Id,
    category_l3_id: category.l3Id,
    currency: form.currency.trim().toUpperCase(),
    amount_original: form.amountOriginal,
    target_ratio: category.type === 'asset' ? form.targetRatio : null,
  };
}
