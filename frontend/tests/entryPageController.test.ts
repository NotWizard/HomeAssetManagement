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

test('buildCreateEntryForm 会默认选中首个成员并初始化资产表单', async () => {
  const { buildCreateEntryForm } = await import('../src/components/entry/entryPageController.ts');

  assert.deepEqual(buildCreateEntryForm([{ id: 5 }, { id: 9 }]), {
    memberId: '5',
    type: 'asset',
    name: '',
    pathKey: '',
    currency: '',
    amountOriginal: '',
    targetRatio: '',
  });

  assert.equal(buildCreateEntryForm([]).memberId, '');
});

test('buildEditEntryForm 会按现有 holding 回填表单值', async () => {
  const { buildEditEntryForm } = await import('../src/components/entry/entryPageController.ts');

  assert.deepEqual(buildEditEntryForm(sampleHolding), {
    memberId: '3',
    type: 'asset',
    name: '全球股票 ETF',
    pathKey: '10|11|12',
    currency: 'usd',
    amountOriginal: '1200.5',
    targetRatio: '35',
  });
});

test('resolvePathOptions 会过滤旧默认分类，但编辑旧数据时保留当前选项', async () => {
  const { LEGACY_CATEGORY_PATH_LABEL, resolvePathOptions } = await import('../src/components/entry/entryPageController.ts');

  const allPathOptions = [
    { key: '1|2|3', label: LEGACY_CATEGORY_PATH_LABEL, l1Id: 1, l2Id: 2, l3Id: 3 },
    { key: '4|5|6', label: '现金与存款 / 银行存款 / 活期存款', l1Id: 4, l2Id: 5, l3Id: 6 },
  ];

  assert.deepEqual(resolvePathOptions(allPathOptions, null, ''), [allPathOptions[1]]);
  assert.deepEqual(resolvePathOptions(allPathOptions, sampleHolding, '1|2|3'), allPathOptions);
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
  assert.equal(validateEntryForm(form, []).error, '请输入名称');

  assert.equal(
    validateEntryForm({ ...form, name: '美元存款' }, []).error,
    '请选择三级分类路径'
  );

  assert.equal(
    validateEntryForm(
      { ...form, name: '美元存款', pathKey: '4|5|6', currency: 'USD', amountOriginal: '12.345' },
      [{ key: '4|5|6', label: '现金与存款 / 银行存款 / 活期存款', l1Id: 4, l2Id: 5, l3Id: 6 }]
    ).error,
    '金额必须大于 0，且最多支持两位小数'
  );

  assert.equal(
    validateEntryForm(
      {
        ...form,
        name: '美元存款',
        pathKey: '4|5|6',
        currency: 'USD',
        amountOriginal: '12.34',
        targetRatio: '101',
      },
      [{ key: '4|5|6', label: '现金与存款 / 银行存款 / 活期存款', l1Id: 4, l2Id: 5, l3Id: 6 }]
    ).error,
    '资产期望占比必须在 0 到 100 之间'
  );
});

test('buildHoldingPayload 会输出提交 API 所需 payload，并对负债清空 target_ratio', async () => {
  const { buildHoldingPayload, validateEntryForm } = await import('../src/components/entry/entryPageController.ts');

  const pathOptions = [{ key: '4|5|6', label: '现金与存款 / 银行存款 / 活期存款', l1Id: 4, l2Id: 5, l3Id: 6 }];
  const assetForm = {
    memberId: '2',
    type: 'asset' as const,
    name: ' 美元存款 ',
    pathKey: '4|5|6',
    currency: ' usd ',
    amountOriginal: '12.34',
    targetRatio: '18',
  };

  const assetValidation = validateEntryForm(assetForm, pathOptions);
  assert.equal(assetValidation.error, null);
  assert.deepEqual(buildHoldingPayload(assetForm, assetValidation.selectedPath!), {
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
    type: 'liability' as const,
    targetRatio: '80',
  };
  const liabilityValidation = validateEntryForm(liabilityForm, pathOptions);
  assert.equal(liabilityValidation.error, null);
  assert.equal(buildHoldingPayload(liabilityForm, liabilityValidation.selectedPath!).target_ratio, null);
});
