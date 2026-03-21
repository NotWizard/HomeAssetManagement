import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('桌面 dev 脚本会先构建前端产物再启动 Electron', () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(process.cwd(), 'desktop/package.json'), 'utf8')
  ) as {
    scripts?: Record<string, string>;
  };

  assert.equal(
    packageJson.scripts?.dev,
    'npm run build:frontend && npm run build && electron-forge start'
  );
});

test('桌面主进程应监听渲染层加载和崩溃事件，避免白屏时毫无诊断信息', () => {
  const mainSource = readFileSync(resolve(process.cwd(), 'desktop/src/main.ts'), 'utf8');

  assert.match(mainSource, /did-fail-load/);
  assert.match(mainSource, /render-process-gone/);
  assert.match(mainSource, /console-message/);
});
