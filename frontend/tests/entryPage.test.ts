import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readFrontendFile(relativePath: string): string {
  return readFileSync(resolve(FRONTEND_ROOT, relativePath), 'utf8');
}

test('目标占比摘要组件会展示紧凑版摘要区，只保留状态角标与左右对比', () => {
  const summarySource = readFrontendFile('src/components/entry/EntryTargetRatioSummary.tsx');

  assert.match(summarySource, /当前资产合计/);
  assert.match(summarySource, /目标占比/);
  assert.match(summarySource, /当前筛选资产/);
  assert.match(summarySource, /100\.0%/);
  assert.match(summarySource, /grid gap-3 md:grid-cols-2/);
});

test('录入页仍会在 holdings 尚未加载时避免误展示目标占比摘要，并保留目标占比格式化逻辑', () => {
  const entryPageSource = readFrontendFile('src/pages/EntryPage.tsx');
  const summarySource = readFrontendFile('src/components/entry/EntryTargetRatioSummary.tsx');

  assert.match(summarySource, /hasLoadedHoldings/);
  assert.match(summarySource, /hasAssetHoldings/);
  assert.match(entryPageSource, /TARGET_RATIO_EPSILON/);
  assert.match(entryPageSource, /formatTargetRatioSummary/);
  assert.match(entryPageSource, /formatTargetRatioDelta/);
  assert.match(entryPageSource, /formatTargetRatio\([^)]*,\s*2\)/);
});
