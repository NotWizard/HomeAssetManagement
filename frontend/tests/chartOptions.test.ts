import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const FRONTEND_ROOT = process.cwd();

function readChartOptionsSource(): string {
  return readFileSync(
    resolve(FRONTEND_ROOT, 'src/components/charts/chartOptions.ts'),
    'utf8'
  );
}

test('折线图和币种柱状图会为纵坐标标签预留空间', () => {
  const source = readChartOptionsSource();

  assert.match(source, /grid:\s*\{\s*left:\s*72,\s*right:\s*28,\s*bottom:\s*44,\s*top:\s*56,\s*containLabel:\s*true\s*\}/);
  assert.match(source, /grid:\s*\{\s*left:\s*72,\s*right:\s*28,\s*top:\s*56,\s*bottom:\s*44,\s*containLabel:\s*true\s*\}/);
});

test('热力图和桑基图不会继续默认截断左侧文本', () => {
  const source = readChartOptionsSource();

  assert.match(source, /overflow:\s*'break'/);
  assert.match(source, /left:\s*'9%'/);
  assert.match(source, /return '#334155'/);
});

test('波动率图和币种拆分图为长标签保留可读布局', () => {
  const source = readChartOptionsSource();

  assert.match(source, /grid:\s*\{\s*left:\s*92,\s*right:\s*28,\s*top:\s*28,\s*bottom:\s*76,\s*containLabel:\s*true\s*\}/);
  assert.match(source, /nameGap:\s*72/);
  assert.match(source, /width:\s*126/);
  assert.match(source, /length2:\s*12/);
});
