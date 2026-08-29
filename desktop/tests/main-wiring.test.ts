import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

// main.ts 无法在 node --test 中 import（模块级 Electron 副作用），
// 用源码级断言锁定关键接线（同 release-workflow 测试模式）。
const source = readFileSync(
  resolve(process.cwd(), 'desktop/src/main.ts'),
  'utf8'
);

test('后端 sidecar 输出同时落盘到 main.log', () => {
  // 打包态从 Finder 启动时 stdout/stderr 无人接收，后端日志必须写文件
  const wireBlock = source.match(/function wireBackendLogs[\s\S]*?\n}/);
  assert.ok(wireBlock, '应找到 wireBackendLogs 实现');
  assert.match(wireBlock[0], /fileLogger\?\.write\(/);
});

test('before-quit 走 stopAndWaitForExit 而不是裸的 unref SIGKILL 兜底', () => {
  const quitBlock = source.match(/app\.on\('before-quit'[\s\S]*?\n\}\);/);
  assert.ok(quitBlock, '应找到 before-quit handler');
  assert.match(quitBlock[0], /stopAndWaitForExit/);
  assert.match(quitBlock[0], /preventDefault/);
});
