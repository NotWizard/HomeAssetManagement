import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const FRONTEND_ROOT = process.cwd();

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
  assert.match(pickerSource, /全部时间/);
  assert.doesNotMatch(pickerSource, /type="date"/);
  assert.doesNotMatch(pickerSource, /showPicker/);
});

test('分析看板头部控制区应将视图切换和筛选器整合在同一张卡片的一行布局内', () => {
  const analyticsPageSource = readFrontendFile('src/pages/AnalyticsPage.tsx');

  assert.match(analyticsPageSource, /CardContent className="flex flex-col gap-3 p-4 lg:p-5 xl:flex-row xl:items-center xl:justify-between"/);
  assert.match(analyticsPageSource, /VIEW_OPTIONS\.map/);
  assert.match(analyticsPageSource, /analyticsView === 'currency' \?/);
  assert.match(analyticsPageSource, /<Select/);
  assert.match(analyticsPageSource, /<AnalyticsDateRangePicker/);
  assert.match(analyticsPageSource, /bg-slate-100\/88 p-1\.5/);
  assert.match(
    analyticsPageSource,
    /<Card[\s\S]*?VIEW_OPTIONS\.map[\s\S]*?analyticsView === 'currency' \?[\s\S]*?<Select[\s\S]*?<AnalyticsDateRangePicker/
  );
  assert.doesNotMatch(analyticsPageSource, /xl:grid-cols-\[minmax\(0,1fr\)_[0-9]+px\]/);
});

test('分析看板时间区间组件应作为内嵌式单控件，而不是带边框阴影的独立卡片', () => {
  const pickerSource = readFrontendFile('src/components/analytics/AnalyticsDateRangePicker.tsx');

  assert.match(pickerSource, /rounded-\[18px\] border border-slate-200\/80 bg-white\/90/);
  assert.match(pickerSource, /group flex h-12 w-full items-center gap-2/);
  assert.match(pickerSource, /flex h-8 items-center px-1 text-slate-300/);
  assert.doesNotMatch(pickerSource, /bg-slate-100\/80 p-2/);
  assert.doesNotMatch(pickerSource, /ring-1/);
  assert.doesNotMatch(pickerSource, /shadow-\[/);
  assert.doesNotMatch(pickerSource, /flex-col justify-center/);
});
