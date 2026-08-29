import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMemberAllocationSummaries,
  buildNormalizationPlan,
  buildTargetRatioStatus,
  formatAllocationDeviation,
  formatTargetRatioSummary,
  hasMemberAllocationImbalance,
  normalizeAmountInput,
  summarizeHoldings,
  summarizeMemberAllocations,
  sumAssetTargetRatio,
} from '../src/components/entry/entryPageLogic.ts';
// hasValidTwoDecimalAmount 的唯一消费方是 entryPageController，函数已归入该模块
import { hasValidTwoDecimalAmount } from '../src/components/entry/entryPageController.ts';
import type { Holding, Member } from '../src/types/index.ts';

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

const sampleMembers: Member[] = [
  {
    id: 10,
    family_id: 1,
    name: '爸爸',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 11,
    family_id: 1,
    name: '妈妈',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 12,
    family_id: 1,
    name: '我',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const overflowAssetForMember12: Holding = {
  id: 4,
  family_id: 1,
  member_id: 12,
  type: 'asset',
  name: '股票账户',
  category_l1_id: 1,
  category_l2_id: 2,
  category_l3_id: 3,
  currency: 'CNY',
  amount_original: 200,
  amount_base: 200,
  target_ratio: 130,
  source: 'manual',
  updated_at: '2026-03-31T00:00:00Z',
};

test('buildMemberAllocationSummaries 会按成员聚合并打 status 标记', () => {
  const summaries = buildMemberAllocationSummaries(
    [...sampleHoldings, overflowAssetForMember12],
    sampleMembers
  );
  assert.equal(summaries.length, 3);
  const dad = summaries.find((row) => row.memberId === 10);
  const mom = summaries.find((row) => row.memberId === 11);
  const me = summaries.find((row) => row.memberId === 12);
  assert.ok(dad && mom && me);
  assert.equal(dad.status.label, '未达标');
  assert.equal(dad.assetCount, 2);
  assert.equal(mom.hasAssets, false);
  assert.equal(mom.assetCount, 0);
  assert.equal(me.status.label, '已超出');
  assert.equal(me.delta < 0, true);
});

test('summarizeMemberAllocations 会统计达标/未达标/超出/无资产', () => {
  const summaries = buildMemberAllocationSummaries(
    [...sampleHoldings, overflowAssetForMember12],
    sampleMembers
  );
  const overview = summarizeMemberAllocations(summaries);
  assert.equal(overview.total, 3);
  assert.equal(overview.balanced, 0);
  assert.equal(overview.underAllocated, 1);
  assert.equal(overview.overAllocated, 1);
  assert.equal(overview.withoutAssets, 1);
});

test('hasMemberAllocationImbalance 仅当存在未达标或已超出时返回 true', () => {
  // 全部达标稳态：不应弹出顶部概览
  assert.equal(
    hasMemberAllocationImbalance({
      total: 3,
      balanced: 3,
      underAllocated: 0,
      overAllocated: 0,
      withoutAssets: 0,
    }),
    false
  );
  // 没有任何成员有资产：也属于"无需提醒"的稳态
  assert.equal(
    hasMemberAllocationImbalance({
      total: 2,
      balanced: 0,
      underAllocated: 0,
      overAllocated: 0,
      withoutAssets: 2,
    }),
    false
  );
  // 出现未达标：应展开
  assert.equal(
    hasMemberAllocationImbalance({
      total: 3,
      balanced: 2,
      underAllocated: 1,
      overAllocated: 0,
      withoutAssets: 0,
    }),
    true
  );
  // 出现已超出：应展开
  assert.equal(
    hasMemberAllocationImbalance({
      total: 3,
      balanced: 2,
      underAllocated: 0,
      overAllocated: 1,
      withoutAssets: 0,
    }),
    true
  );
});

test('formatAllocationDeviation 把 delta 渲染为带正负号的偏差量徽章文本', () => {
  // 达标视为零偏差，返回 null 让卡片显示"已达标"占位文案
  assert.equal(formatAllocationDeviation(0), null);
  assert.equal(formatAllocationDeviation(0.00005), null);
  // delta > 0 表示总和不足 100%（少了多少），徽章用减号
  assert.equal(formatAllocationDeviation(3.5), '-3.5%');
  assert.equal(formatAllocationDeviation(0.05), '-0.05%');
  // delta < 0 表示总和超过 100%（多了多少），徽章用加号
  assert.equal(formatAllocationDeviation(-5.2), '+5.2%');
  assert.equal(formatAllocationDeviation(-0.05), '+0.05%');
});

test('buildNormalizationPlan 会按当前比例缩放至合计 100%', () => {
  const memberAssets = sampleHoldings.filter(
    (row) => row.type === 'asset' && row.member_id === 10
  );
  const plan = buildNormalizationPlan(memberAssets);
  assert.equal(plan.items.length, 2);
  const total = plan.items.reduce((sum, item) => sum + item.proposed, 0);
  assert.ok(Math.abs(total - 100) < 0.0001);
  // 60 / 99.96 * 100 ≈ 60.024 → 取小数位 2 → 60.02
  assert.equal(plan.items[0].proposed, 60.02);
  assert.equal(plan.items[1].proposed, 39.98);
  assert.equal(plan.reason, undefined);
});

test('buildNormalizationPlan 在没有正目标占比时不把排除项重新纳入', () => {
  const zeroHoldings: Holding[] = [
    {
      ...sampleHoldings[0],
      id: 100,
      target_ratio: 0,
    },
    {
      ...sampleHoldings[0],
      id: 101,
      target_ratio: 0,
    },
    {
      ...sampleHoldings[0],
      id: 102,
      target_ratio: 0,
    },
  ];
  const plan = buildNormalizationPlan(zeroHoldings);
  assert.equal(plan.reason, 'no_participating_assets');
  assert.deepEqual(plan.items, []);
});

test('buildNormalizationPlan 只归一化正目标占比资产', () => {
  const holdings: Holding[] = [
    {
      ...sampleHoldings[0],
      id: 200,
      target_ratio: 60,
    },
    {
      ...sampleHoldings[0],
      id: 201,
      target_ratio: 30,
    },
    {
      ...sampleHoldings[0],
      id: 202,
      target_ratio: 0,
    },
    {
      ...sampleHoldings[0],
      id: 203,
      target_ratio: null,
    },
  ];
  const plan = buildNormalizationPlan(holdings);

  assert.deepEqual(plan.items.map((item) => item.id), [200, 201]);
  assert.deepEqual(plan.items.map((item) => item.proposed), [66.67, 33.33]);
  assert.equal(plan.afterTotal, 100);
});
