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

test('资产负债变更后需要覆盖总览和分析看板相关查询', async () => {
  const { HOLDING_RELATED_QUERY_KEYS } = await import('../src/services/holdingRelatedQueries.ts');

  assert.deepEqual(HOLDING_RELATED_QUERY_KEYS, [
    ['holdings'],
    ['trend'],
    ['rebalance'],
    ['sankey'],
    ['volatility'],
    ['correlation'],
    ['currency-overview'],
  ]);
});

test('共享失效函数会逐个刷新所有资产负债相关查询', async () => {
  const {
    HOLDING_RELATED_QUERY_KEYS,
    invalidateHoldingRelatedQueries,
  } = await import('../src/services/holdingRelatedQueries.ts');
  const calls: Array<readonly string[]> = [];
  const queryClient = {
    invalidateQueries: async ({ queryKey }: { queryKey: readonly string[] }) => {
      calls.push(queryKey);
    },
  };

  await invalidateHoldingRelatedQueries(queryClient as never);

  assert.deepEqual(calls, HOLDING_RELATED_QUERY_KEYS);
});
