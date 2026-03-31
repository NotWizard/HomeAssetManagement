import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = resolve(TEST_DIR, '..');

function readDesktopFile(relativePath: string): string {
  return readFileSync(resolve(DESKTOP_ROOT, relativePath), 'utf8');
}

test('preload 会按能力分组暴露桌面 bridge 接口', () => {
  const source = readDesktopFile('src/preload.cts');

  assert.match(source, /api:\s*\{/);
  assert.match(source, /requestJson:/);
  assert.match(source, /requestBinary\b/);
  assert.match(source, /postForm:/);
  assert.match(source, /bootstrap:\s*\{/);
  assert.match(source, /retry:/);
  assert.match(source, /updates:\s*\{/);
  assert.match(source, /getState:/);
  assert.match(source, /check:/);
  assert.match(source, /download:/);
  assert.match(source, /install:/);
  assert.match(source, /onStateChanged:/);
});


test('preload 暴露的桌面 bridge 会声明桌面模式标识', () => {
  const source = readDesktopFile('src/preload.cts');

  assert.match(source, /isDesktop:\s*true/);
});

test('preload 不再把 localhost API 地址直接暴露给 renderer', () => {
  const source = readDesktopFile('src/preload.cts');

  assert.doesNotMatch(source, /__HBS_RUNTIME_CONFIG__/);
});

test('主进程应加载 CommonJS 预加载脚本，避免沙盒预加载以 ESM 方式报错', () => {
  const mainSource = readDesktopFile('src/main.ts');

  assert.match(mainSource, /preload\.cjs/);
  assert.doesNotMatch(mainSource, /preload\.js/);
});
