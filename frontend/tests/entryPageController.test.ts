import assert from 'node:assert/strict';
import test from 'node:test';

import type { Holding } from '../src/types/index.ts';

const sampleHolding: Holding = {
  id: 8,
  family_id: 1,
  member_id: 3,
  type: 'asset',
  name: '全球股票 ETF',
  category_l1_id: 10,
  category_l2_id: 11,
  category_l3_id: 12,
  currency: 'usd',
  amount_original: 1200.5,
  amount_base: 8600,
  target_ratio: 35,
  source: 'manual',
  updated_at: '2026-04-01T00:00:00Z',
};

test('buildCreateEntryForm 会默认选中首个成员并初始化空分类表单', async () => {
  const { buildCreateEntryForm } = await import('../src/components/entry/entryPageController.ts');

  assert.deepEqual(buildCreateEntryForm([{ id: 5 }, { id: 9 }]), {
    memberId: '5',
    name: '',
    category: null,
    currency: '',
    amountOriginal: '',
    targetRatio: '',
  });

  assert.equal(buildCreateEntryForm([]).memberId, '');
});

test('buildEditEntryForm 会按现有 holding 回填表单值（含 category 三元组）', async () => {
  const { buildEditEntryForm } = await import('../src/components/entry/entryPageController.ts');

  assert.deepEqual(buildEditEntryForm(sampleHolding), {
    memberId: '3',
    name: '全球股票 ETF',
    category: { type: 'asset', l1Id: 10, l2Id: 11, l3Id: 12 },
    currency: 'usd',
    amountOriginal: '1200.5',
    targetRatio: '35',
  });
});

test('resolveDefaultMemberDeleteId 会优先保留筛选成员，否则回退到首个有数据成员', async () => {
  const { resolveDefaultMemberDeleteId } = await import('../src/components/entry/entryPageController.ts');

  assert.equal(
    resolveDefaultMemberDeleteId({
      memberFilter: '9',
      members: [{ id: 5 }, { id: 9 }],
      holdings: [sampleHolding],
    }),
    '9'
  );

  assert.equal(
    resolveDefaultMemberDeleteId({
      memberFilter: 'all',
      members: [{ id: 5 }, { id: 9 }],
      holdings: [sampleHolding, { ...sampleHolding, id: 9, member_id: 9 }],
    }),
    '9'
  );

  assert.equal(
    resolveDefaultMemberDeleteId({
      memberFilter: 'all',
      members: [{ id: 5 }, { id: 9 }],
      holdings: [],
    }),
    '5'
  );
});

test('validateEntryForm 会返回面向用户的校验错误', async () => {
  const { buildCreateEntryForm, validateEntryForm } = await import('../src/components/entry/entryPageController.ts');

  const form = buildCreateEntryForm([{ id: 1 }]);
  assert.equal(validateEntryForm(form).error, '请输入名称');

  assert.equal(
    validateEntryForm({ ...form, name: '美元存款' }).error,
    '请选择资产或负债的三级分类'
  );

  const withCategory = {
    ...form,
    name: '美元存款',
    category: { type: 'asset' as const, l1Id: 4, l2Id: 5, l3Id: 6 },
  };

  assert.equal(
    validateEntryForm({ ...withCategory, currency: 'USD', amountOriginal: '12.345' }).error,
    '金额必须大于 0，且最多支持两位小数'
  );

  assert.equal(
    validateEntryForm({
      ...withCategory,
      currency: 'USD',
      amountOriginal: '12.34',
      targetRatio: '101',
    }).error,
    '资产期望占比必须在 0 到 100 之间'
  );
});

test('buildHoldingPayload 会输出提交 API 所需 payload，并对负债清空 target_ratio', async () => {
  const { buildHoldingPayload, validateEntryForm } = await import('../src/components/entry/entryPageController.ts');

  const assetForm = {
    memberId: '2',
    name: ' 美元存款 ',
    category: { type: 'asset' as const, l1Id: 4, l2Id: 5, l3Id: 6 },
    currency: ' usd ',
    amountOriginal: '12.34',
    targetRatio: '18',
  };

  const assetValidation = validateEntryForm(assetForm);
  assert.equal(assetValidation.error, null);
  assert.ok(assetValidation.category);
  assert.deepEqual(buildHoldingPayload(assetForm, assetValidation.category), {
    member_id: 2,
    type: 'asset',
    name: '美元存款',
    category_l1_id: 4,
    category_l2_id: 5,
    category_l3_id: 6,
    currency: 'USD',
    amount_original: '12.34',
    target_ratio: '18',
  });

  const liabilityForm = {
    ...assetForm,
    category: { type: 'liability' as const, l1Id: 4, l2Id: 5, l3Id: 6 },
    targetRatio: '80',
  };
  const liabilityValidation = validateEntryForm(liabilityForm);
  assert.equal(liabilityValidation.error, null);
  assert.ok(liabilityValidation.category);
  assert.equal(
    buildHoldingPayload(liabilityForm, liabilityValidation.category).target_ratio,
    null
  );
});

test('资产期望占比留空合法且提交为 null，非法数字被拒绝', async () => {
  const { buildHoldingPayload, validateEntryForm } = await import('../src/components/entry/entryPageController.ts');

  const baseForm = {
    memberId: '2',
    name: '美元存款',
    category: { type: 'asset' as const, l1Id: 4, l2Id: 5, l3Id: 6 },
    currency: 'USD',
    amountOriginal: '12.34',
  };

  // 留空 / 纯空白：与表单提示“留空表示不参与计算”一致，校验通过且 payload 为 null
  for (const targetRatio of ['', '   ']) {
    const validation = validateEntryForm({ ...baseForm, targetRatio });
    assert.equal(validation.error, null);
    assert.ok(validation.category);
    assert.equal(
      buildHoldingPayload({ ...baseForm, targetRatio }, validation.category).target_ratio,
      null
    );
  }

  // 非数字（NaN 穿透）与超范围都要拒绝
  for (const targetRatio of ['abc', '-1', '100.1']) {
    assert.equal(
      validateEntryForm({ ...baseForm, targetRatio }).error,
      '资产期望占比必须在 0 到 100 之间'
    );
  }

  // 边界值 0 与 100 合法
  for (const targetRatio of ['0', '100']) {
    assert.equal(validateEntryForm({ ...baseForm, targetRatio }).error, null);
  }
});
