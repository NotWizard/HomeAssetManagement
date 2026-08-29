import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

// .tsx 无法被 node --test 类型剥离加载（JSX 不是类型），用源码级断言锁定可访问性行为
const source = readFileSync(
  resolve(process.cwd(), 'src/components/ui/dialog.tsx'),
  'utf8'
);

test('Dialog 支持 Escape 关闭', () => {
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /document\.addEventListener\('keydown', onKeyDown\)/);
  assert.match(source, /removeEventListener\('keydown', onKeyDown\)/);
});

test('Dialog 有轻量焦点陷阱与 dialog 语义', () => {
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /panel\?\.focus\(\)/);
});
