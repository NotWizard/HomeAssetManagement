import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readFrontendFile(relativePath: string): string {
  return readFileSync(resolve(FRONTEND_ROOT, relativePath), 'utf8');
}

test('分析看板使用新的时间区间组件，并让整块日期卡片可点击', () => {
  const analyticsPageSource = readFrontendFile('src/pages/AnalyticsPage.tsx');
  const pickerSource = readFrontendFile('src/components/analytics/AnalyticsDateRangePicker.tsx');

  assert.match(analyticsPageSource, /AnalyticsDateRangePicker/);
  assert.match(pickerSource, /时间区间/);
  assert.match(pickerSource, /开始日期/);
  assert.match(pickerSource, /结束日期/);
  assert.match(pickerSource, /CalendarDays/);
  assert.match(pickerSource, /buildRangeSummary/);
  assert.match(pickerSource, /已选 \$\{dayCount\} 天/);
  assert.match(pickerSource, /DateSegmentTrigger/);
  assert.match(pickerSource, /useState<'start' \| 'end' \| null>/);
  assert.match(pickerSource, /role="dialog"/);
  assert.match(pickerSource, /DAY_LABELS/);
  assert.match(pickerSource, /选择开始日期/);
  assert.match(pickerSource, /选择结束日期/);
  assert.match(pickerSource, /近3个月/);
  assert.match(pickerSource, /近6个月/);
  assert.match(pickerSource, /近1年/);
  assert.match(pickerSource, /return '全部时间'/);
  assert.doesNotMatch(pickerSource, /label:\s*'全部时间'/);
  assert.doesNotMatch(pickerSource, /type="date"/);
  assert.doesNotMatch(pickerSource, /showPicker/);
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

test('分析看板时间区间组件应将快捷按钮放在日期条上方，并只保留三个快捷入口', () => {
  const pickerSource = readFrontendFile('src/components/analytics/AnalyticsDateRangePicker.tsx');

  assert.match(pickerSource, /rounded-\[18px\] border border-slate-200\/80 bg-white\/90/);
  assert.match(pickerSource, /group flex h-12 w-full items-center gap-2/);
  assert.match(pickerSource, /flex h-8 items-center px-1 text-slate-300/);
  assert.match(pickerSource, /last3Months/);
  assert.match(pickerSource, /last6Months/);
  assert.match(pickerSource, /last1Year/);
  assert.doesNotMatch(pickerSource, /allTime/);
  assert.match(pickerSource, /flex flex-wrap justify-end gap-2/);
  assert.match(pickerSource, /presetOptions\.length > 0[\s\S]*flex flex-wrap justify-end gap-2[\s\S]*div ref=\{containerRef\} className="relative"/);
  assert.doesNotMatch(pickerSource, /bg-slate-100\/80 p-2/);
  assert.doesNotMatch(pickerSource, /ring-1/);
  assert.doesNotMatch(pickerSource, /shadow-\[/);
  assert.doesNotMatch(pickerSource, /flex-col justify-center/);
});
