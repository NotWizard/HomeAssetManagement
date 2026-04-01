import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildCalendarDays,
  buildPresetOptions,
  buildRangeSummary,
} from '../src/components/analytics/analyticsDateRangePickerState.ts';

const FRONTEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readFrontendFile(relativePath: string): string {
  return readFileSync(resolve(FRONTEND_ROOT, relativePath), 'utf8');
}

test('分析看板时间区间摘要与快捷范围会按行为生成', () => {
  assert.equal(
    buildRangeSummary('2025-01-01', '2025-12-31', '2025-01-01', '2025-12-31'),
    '全部时间'
  );
  assert.equal(
    buildRangeSummary('2025-03-15', '2025-03-15', '2025-01-01', '2025-12-31'),
    '单日视图'
  );
  assert.equal(
    buildRangeSummary('2025-03-01', '2025-03-10', '2025-01-01', '2025-12-31'),
    '已选 10 天'
  );

  const presets = buildPresetOptions('2025-01-01', '2025-12-31');
  assert.deepEqual(
    presets.map((item) => item.id),
    ['last3Months', 'last6Months', 'last1Year']
  );
  assert.deepEqual(
    presets.map((item) => item.label),
    ['近3个月', '近6个月', '近1年']
  );
});

test('分析看板应将标题与筛选区放在同一行，并让 tab 卡片只保留视图切换', () => {
  const analyticsPageSource = readFrontendFile('src/pages/AnalyticsPage.tsx');

  assert.match(analyticsPageSource, /<div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">/);
  assert.match(analyticsPageSource, /<div className="min-w-0 xl:ml-6 xl:flex xl:flex-shrink-0 xl:justify-end">/);
  assert.match(analyticsPageSource, /analyticsView === 'currency' \?/);
  assert.match(analyticsPageSource, /<Select/);
  assert.match(analyticsPageSource, /<AnalyticsDateRangePicker/);
  assert.match(analyticsPageSource, /VIEW_OPTIONS\.map/);
  assert.match(analyticsPageSource, /bg-slate-100\/88 p-1\.5/);
  assert.match(analyticsPageSource, /CardContent className="p-4 lg:p-5"/);
  assert.doesNotMatch(
    analyticsPageSource,
    /<Card[\s\S]*?analyticsView === 'currency' \?[\s\S]*?<Select[\s\S]*?<AnalyticsDateRangePicker/
  );
});

test('分析看板时间区间组件会生成完整日历网格并正确标记禁用日期', () => {
  const days = buildCalendarDays(
    new Date(2025, 3, 1),
    '2025-04-15',
    '2025-04-05',
    '2025-04-25'
  );

  assert.equal(days.length, 42);
  assert.equal(days.some((item) => item.value === '2025-04-15' && item.isSelected), true);
  assert.equal(days.some((item) => item.value === '2025-04-01' && item.isDisabled), true);
  assert.equal(days.some((item) => item.value === '2025-04-26' && item.isDisabled), true);
  assert.equal(days.some((item) => item.value === '2025-04-10' && item.isDisabled), false);
});
