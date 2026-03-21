import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const FRONTEND_ROOT = process.cwd();

function readFrontendFile(relativePath: string): string {
  return readFileSync(resolve(FRONTEND_ROOT, relativePath), 'utf8');
}

test('资产负债录入页会展示紧凑版目标占比摘要区，只保留状态角标与左右对比', () => {
  const entryPageSource = readFrontendFile('src/pages/EntryPage.tsx');

  assert.match(entryPageSource, /当前资产合计/);
  assert.match(entryPageSource, /目标占比/);
  assert.match(entryPageSource, /当前筛选资产/);
  assert.match(entryPageSource, /100\.0%/);
  assert.match(entryPageSource, /未达标/);
  assert.match(entryPageSource, /已达标/);
  assert.match(entryPageSource, /已超出/);
  assert.match(entryPageSource, /grid gap-3 md:grid-cols-2/);
});
