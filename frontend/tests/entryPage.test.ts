import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPathOptions,
  buildTargetRatioStatus,
  formatTargetRatioSummary,
  hasValidTwoDecimalAmount,
  normalizeAmountInput,
  summarizeHoldings,
  sumAssetTargetRatio,
} from '../src/components/entry/entryPageLogic.ts';
import type { CategoryNode, Holding } from '../src/types/index.ts';

const sampleHoldings: Holding[] = [
  {
    id: 1,
    family_id: 1,
    member_id: 10,
    type: 'asset',
    name: '活期存款',
    category_l1_id: 1,
    category_l2_id: 2,
    category_l3_id: 3,
    currency: 'CNY',
    amount_original: 100,
    amount_base: 100,
    target_ratio: 60,
    source: 'manual',
    updated_at: '2026-03-31T00:00:00Z',
  },
  {
    id: 2,
    family_id: 1,
    member_id: 10,
    type: 'asset',
    name: '指数基金',
    category_l1_id: 1,
    category_l2_id: 4,
    category_l3_id: 5,
    currency: 'CNY',
    amount_original: 50,
    amount_base: 50,
    target_ratio: 39.96,
    source: 'manual',
    updated_at: '2026-03-31T00:00:00Z',
  },
  {
    id: 3,
    family_id: 1,
    member_id: 11,
    type: 'liability',
    name: '信用卡',
    category_l1_id: 6,
    category_l2_id: 7,
    category_l3_id: 8,
    currency: 'CNY',
    amount_original: 20,
    amount_base: 20,
    target_ratio: null,
    source: 'manual',
    updated_at: '2026-03-31T00:00:00Z',
  },
];

test('buildPathOptions 会展开三级分类路径', () => {
  const tree: CategoryNode[] = [
    {
      id: 1,
      type: 'asset',
      level: 1,
      parent_id: null,
      name: '现金与存款',
      children: [
        {
          id: 2,
          type: 'asset',
          level: 2,
          parent_id: 1,
          name: '银行存款',
          children: [
            {
              id: 3,
              type: 'asset',
              level: 3,
              parent_id: 2,
              name: '活期存款',
              children: [],
            },
          ],
        },
      ],
    },
  ];

  assert.deepEqual(buildPathOptions(tree), [
    {
      key: '1|2|3',
      label: '现金与存款 / 银行存款 / 活期存款',
      l1Id: 1,
      l2Id: 2,
      l3Id: 3,
    },
  ]);
});

test('金额输入工具函数会规范前导小数并拒绝超过两位小数', () => {
  assert.equal(normalizeAmountInput('.'), '0.');
  assert.equal(normalizeAmountInput('.5'), '0.5');
  assert.equal(normalizeAmountInput('12.34'), '12.34');
  assert.equal(normalizeAmountInput('12.345'), null);
  assert.equal(hasValidTwoDecimalAmount('12.34'), true);
  assert.equal(hasValidTwoDecimalAmount('0'), false);
  assert.equal(hasValidTwoDecimalAmount('1.234'), false);
});

test('目标占比工具函数会汇总资产并输出达标状态', () => {
  const total = sumAssetTargetRatio(sampleHoldings);
  assert.equal(total, 99.96000000000001);
  assert.equal(formatTargetRatioSummary(total), '99.96%');

  const status = buildTargetRatioStatus(total);
  assert.equal(status.label, '未达标');
  assert.equal(status.detail, '还差 0.04%');
});

test('summarizeHoldings 会输出批量删除摘要', () => {
  assert.deepEqual(summarizeHoldings(sampleHoldings), {
    count: 3,
    assetCount: 2,
    liabilityCount: 1,
    totalBase: 170,
    previewNames: ['活期存款', '指数基金', '信用卡'],
  });
});
