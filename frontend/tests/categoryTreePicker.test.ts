import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFlatSearchResults,
  resolvePathFromValue,
  shouldAutoPenetrate,
} from '../src/components/entry/categoryTreePickerLogic.ts';
import type { CategoryNode } from '../src/types/index.ts';

function leaf(id: number, name: string, parentId: number): CategoryNode {
  return { id, type: 'asset', level: 3, parent_id: parentId, name, children: [] };
}

const assetTree: CategoryNode[] = [
  {
    id: 1,
    type: 'asset',
    level: 1,
    parent_id: null,
    name: '现金存款类',
    children: [
      {
        id: 11,
        type: 'asset',
        level: 2,
        parent_id: 1,
        name: '银行存款',
        children: [leaf(101, '活期', 11), leaf(102, '定期', 11)],
      },
      {
        id: 12,
        type: 'asset',
        level: 2,
        parent_id: 1,
        name: '现金',
        children: [leaf(121, '人民币现金', 12)],
      },
    ],
  },
  {
    id: 2,
    type: 'asset',
    level: 1,
    parent_id: null,
    name: '数字资产',
    children: [
      {
        id: 21,
        type: 'asset',
        level: 2,
        parent_id: 2,
        name: '主流加密',
        children: [leaf(201, 'BTC', 21), leaf(202, 'ETH', 21)],
      },
    ],
  },
];

const liabilityTree: CategoryNode[] = [
  {
    id: 51,
    type: 'liability',
    level: 1,
    parent_id: null,
    name: '住房负债',
    children: [
      {
        id: 511,
        type: 'liability',
        level: 2,
        parent_id: 51,
        name: '房屋按揭',
        children: [{ id: 5111, type: 'liability', level: 3, parent_id: 511, name: '商业房贷', children: [] }],
      },
    ],
  },
];

test('buildFlatSearchResults 空查询返回空', () => {
  assert.deepEqual(buildFlatSearchResults(assetTree, '', 'asset'), []);
  assert.deepEqual(buildFlatSearchResults(assetTree, '   ', 'asset'), []);
});

test('buildFlatSearchResults 命中 L3 叶子时 matchedSegment=l3', () => {
  const results = buildFlatSearchResults(assetTree, 'BTC', 'asset');
  assert.equal(results.length, 1);
  assert.equal(results[0].l3Name, 'BTC');
  assert.equal(results[0].matchedSegment, 'l3');
  assert.equal(results[0].type, 'asset');
});

test('buildFlatSearchResults 命中 L2 名时把该 L2 下所有 L3 都返回，matchedSegment=l2', () => {
  const results = buildFlatSearchResults(assetTree, '主流加密', 'asset');
  assert.equal(results.length, 2);
  assert.deepEqual(
    results.map((r) => r.l3Name).sort(),
    ['BTC', 'ETH']
  );
  for (const r of results) {
    assert.equal(r.matchedSegment, 'l2');
  }
});

test('buildFlatSearchResults 命中 L1 名时把该 L1 下所有 L3 都返回，matchedSegment=l1', () => {
  const results = buildFlatSearchResults(assetTree, '现金存款', 'asset');
  // 现金存款类 → 银行存款（2 个 L3）+ 现金（1 个 L3）= 3
  assert.equal(results.length, 3);
  for (const r of results) {
    assert.equal(r.matchedSegment, 'l1');
  }
});

test('buildFlatSearchResults 优先 L3 > L2 > L1 标记命中段', () => {
  // 查询 "现金" 在 "人民币现金" 这条路径上 L1（现金存款类）/ L2（现金）/ L3（人民币现金）三段都命中。
  // 优先级 L3 > L2 > L1，所以 matchedSegment 应该是 l3。
  const results = buildFlatSearchResults(assetTree, '现金', 'asset');
  const cashL3 = results.find((r) => r.l3Name === '人民币现金');
  assert.ok(cashL3);
  assert.equal(cashL3.matchedSegment, 'l3');

  // 而 "活期" 这条路径 L3=活期 不含"现金"，L2=银行存款 不含，L1=现金存款类 含 → l1
  const huoqi = results.find((r) => r.l3Name === '活期');
  assert.ok(huoqi);
  assert.equal(huoqi.matchedSegment, 'l1');
});

test('buildFlatSearchResults 大小写不敏感', () => {
  const upper = buildFlatSearchResults(assetTree, 'btc', 'asset');
  const lower = buildFlatSearchResults(assetTree, 'BTC', 'asset');
  assert.deepEqual(upper, lower);
});

test('shouldAutoPenetrate 仅在二级恰好只含 1 个三级时返回 true', () => {
  const oneChild = assetTree[0].children[1];
  const multiChild = assetTree[0].children[0];
  assert.equal(shouldAutoPenetrate(oneChild), true);
  assert.equal(shouldAutoPenetrate(multiChild), false);
});

test('resolvePathFromValue value=null 返回 null', () => {
  assert.equal(resolvePathFromValue(null, assetTree, liabilityTree), null);
});

test('resolvePathFromValue 资产 value 正常拼出三段名', () => {
  const resolved = resolvePathFromValue(
    { type: 'asset', l1Id: 1, l2Id: 11, l3Id: 101 },
    assetTree,
    liabilityTree
  );
  assert.deepEqual(resolved, {
    type: 'asset',
    l1Name: '现金存款类',
    l2Name: '银行存款',
    l3Name: '活期',
  });
});

test('resolvePathFromValue 负债 value 走 liabilityTree', () => {
  const resolved = resolvePathFromValue(
    { type: 'liability', l1Id: 51, l2Id: 511, l3Id: 5111 },
    assetTree,
    liabilityTree
  );
  assert.deepEqual(resolved, {
    type: 'liability',
    l1Name: '住房负债',
    l2Name: '房屋按揭',
    l3Name: '商业房贷',
  });
});

test('resolvePathFromValue id 在树里找不到时返回 null（防御已被删除/重命名的脏 value）', () => {
  const badL1 = resolvePathFromValue(
    { type: 'asset', l1Id: 9999, l2Id: 11, l3Id: 101 },
    assetTree,
    liabilityTree
  );
  assert.equal(badL1, null);

  const badL3 = resolvePathFromValue(
    { type: 'asset', l1Id: 1, l2Id: 11, l3Id: 9999 },
    assetTree,
    liabilityTree
  );
  assert.equal(badL3, null);
});
