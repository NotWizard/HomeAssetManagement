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
  assert.match(pickerSource, /absolute inset-0[\s\S]*opacity-0[\s\S]*cursor-pointer/);
});
