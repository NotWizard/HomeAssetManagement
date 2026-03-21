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

test('主进程会暴露更新查询与下载安装 IPC', () => {
  const source = readDesktopFile('src/main.ts');

  assert.match(source, /UPDATE_IPC_CHANNELS\.getState/);
  assert.match(source, /UPDATE_IPC_CHANNELS\.check/);
  assert.match(source, /UPDATE_IPC_CHANNELS\.download/);
  assert.match(source, /UPDATE_IPC_CHANNELS\.install/);
});

test('主进程就绪后会启动更新轮询并在退出时停止', () => {
  const source = readDesktopFile('src/main.ts');

  assert.match(source, /updateController\.start\(\)/);
  assert.match(source, /updateController\.stop\(\)/);
});
