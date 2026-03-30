import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('源码目录中不应存在会遮蔽 TypeScript 模块的同名 JavaScript 文件', () => {
  assert.equal(
    existsSync(resolve(process.cwd(), 'src/services/holdingRelatedQueries.js')),
    false
  );
});

test('查询键工厂会提供统一的资源域 key', async () => {
  const { queryKeys } = await import('../src/services/holdingRelatedQueries.ts');

  assert.deepEqual(queryKeys.importLogs.all(), ['import-logs']);
  assert.deepEqual(queryKeys.analyticsDateBounds.all(), ['analytics-date-bounds']);
  assert.deepEqual(queryKeys.members.all(), ['members']);
  assert.deepEqual(queryKeys.holdings.all(), ['holdings']);
  assert.deepEqual(queryKeys.holdings.scope('overview'), ['holdings', 'overview']);
  assert.deepEqual(queryKeys.settings.all(), ['settings']);
  assert.deepEqual(queryKeys.settings.scope('entry'), ['settings', 'entry']);
  assert.deepEqual(queryKeys.categories.type('asset'), ['categories', 'asset']);
  assert.deepEqual(queryKeys.trend.all(), ['trend']);
  assert.deepEqual(queryKeys.trend.scope('overview'), ['trend', 'overview']);
  assert.deepEqual(queryKeys.trend.range({ startDate: '2026-01-01', endDate: '2026-01-31' }), [
    'trend',
    '2026-01-01',
    '2026-01-31',
  ]);
  assert.deepEqual(queryKeys.rebalance.all(), ['rebalance']);
  assert.deepEqual(queryKeys.rebalance.range({ startDate: '2026-01-01', endDate: '2026-01-31' }), [
    'rebalance',
    '2026-01-01',
    '2026-01-31',
  ]);
  assert.deepEqual(queryKeys.volatility.range({ startDate: '2026-01-01', endDate: '2026-01-31' }), [
    'volatility',
    '2026-01-01',
    '2026-01-31',
  ]);
  assert.deepEqual(queryKeys.correlation.range({ startDate: '2026-01-01', endDate: '2026-01-31' }), [
    'correlation',
    '2026-01-01',
    '2026-01-31',
  ]);
  assert.deepEqual(queryKeys.sankey.range({ startDate: '2026-01-01', endDate: '2026-01-31' }), [
    'sankey',
    '2026-01-01',
    '2026-01-31',
  ]);
  assert.deepEqual(queryKeys.currencyOverview.all(), ['currency-overview']);
});

test('资产负债变更后需要覆盖总览和分析看板相关查询', async () => {
  const { HOLDING_RELATED_QUERY_KEYS, queryKeys } = await import('../src/services/holdingRelatedQueries.ts');

  assert.deepEqual(HOLDING_RELATED_QUERY_KEYS, [
    queryKeys.holdings.all(),
    queryKeys.analyticsDateBounds.all(),
    queryKeys.trend.all(),
    queryKeys.rebalance.all(),
    queryKeys.sankey.all(),
    queryKeys.volatility.all(),
    queryKeys.correlation.all(),
    queryKeys.currencyOverview.all(),
  ]);
});

test('共享失效函数会逐个刷新所有资产负债相关查询', async () => {
  const {
    HOLDING_RELATED_QUERY_KEYS,
    invalidateHoldingRelatedQueries,
  } = await import('../src/services/holdingRelatedQueries.ts');
  const calls: Array<readonly unknown[]> = [];
  const queryClient = {
    invalidateQueries: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
      calls.push(queryKey);
    },
  };

  await invalidateHoldingRelatedQueries(queryClient as never);

  assert.deepEqual(calls, HOLDING_RELATED_QUERY_KEYS);
});

test('按资源域的失效 helper 会刷新对应查询', async () => {
  const {
    HOLDINGS_QUERY_KEYS,
    IMPORT_LOG_QUERY_KEYS,
    MEMBER_HOLDING_RELATED_QUERY_KEYS,
    MEMBER_QUERY_KEYS,
    SETTINGS_QUERY_KEYS,
    invalidateHoldingQueries,
    invalidateImportLogQueries,
    invalidateMemberHoldingRelatedQueries,
    invalidateMemberQueries,
    invalidateSettingsQueries,
  } = await import('../src/services/holdingRelatedQueries.ts');

  const calls: Array<readonly unknown[]> = [];
  const queryClient = {
    invalidateQueries: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
      calls.push(queryKey);
    },
  };

  await invalidateImportLogQueries(queryClient as never);
  await invalidateMemberQueries(queryClient as never);
  await invalidateSettingsQueries(queryClient as never);
  await invalidateHoldingQueries(queryClient as never);
  await invalidateMemberHoldingRelatedQueries(queryClient as never);

  assert.deepEqual(calls, [
    ...IMPORT_LOG_QUERY_KEYS,
    ...MEMBER_QUERY_KEYS,
    ...SETTINGS_QUERY_KEYS,
    ...HOLDINGS_QUERY_KEYS,
    ...MEMBER_HOLDING_RELATED_QUERY_KEYS,
  ]);
});
