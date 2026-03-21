import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const FRONTEND_ROOT = process.cwd();

function readFrontendFile(relativePath: string): string {
  return readFileSync(resolve(FRONTEND_ROOT, relativePath), 'utf8');
}

test('桌面更新入口会在可更新时显示按钮并支持下载确认', () => {
  const source = readFrontendFile('src/components/layout/DesktopUpdateNotice.tsx');

  assert.match(source, /有可用更新/);
  assert.match(source, /downloadUpdate\(\)/);
  assert.match(source, /getUpdateState\(\)/);
});

test('下载完成后可再次触发安装动作，并支持状态订阅', () => {
  const source = readFrontendFile('src/components/layout/DesktopUpdateNotice.tsx');

  assert.match(source, /installUpdate\(\)/);
  assert.match(source, /onUpdateStateChanged/);
  assert.match(source, /isDesktopRuntime\(\)/);
});
