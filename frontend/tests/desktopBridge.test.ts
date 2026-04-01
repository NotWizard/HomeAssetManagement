import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const FRONTEND_ROOT = process.cwd();

function readFrontendFile(relativePath: string): string {
  return readFileSync(resolve(FRONTEND_ROOT, relativePath), 'utf8');
}

test('桌面服务层会优先通过按 JSON 动词分组的 bridge.api 发起请求', () => {
  const apiClientSource = readFrontendFile('src/services/apiClient.ts');

  assert.match(apiClientSource, /getDesktopBridge\(\)/);
  assert.match(apiClientSource, /desktopBridge\.api\.json\.get\(/);
  assert.match(apiClientSource, /desktopBridge\.api\.json\.post\(/);
  assert.match(apiClientSource, /desktopBridge\.api\.json\.put\(/);
  assert.match(apiClientSource, /desktopBridge\.api\.json\.delete\(/);
  assert.doesNotMatch(apiClientSource, /desktopBridge\.api\.requestJson\(/);
});

test('桌面模式会通过 bridge.api.form 上传表单，而不是直接拼接 localhost 地址', () => {
  const apiClientSource = readFrontendFile('src/services/apiClient.ts');

  assert.match(apiClientSource, /desktopBridge\.api\.form\.post\(/);
  assert.match(apiClientSource, /serializeFormData/);
  assert.doesNotMatch(apiClientSource, /desktopBridge\.api\.postForm\(/);
});

test('迁移包与错误报告下载在桌面模式下会通过 bridge.api.binary 走本地 sidecar', () => {
  const migrationSource = readFrontendFile('src/services/migration.ts');
  const importsSource = readFrontendFile('src/services/imports.ts');

  assert.match(migrationSource, /getDesktopBridge\(\)/);
  assert.match(migrationSource, /desktopBridge\.api\.binary\.post\(/);
  assert.match(migrationSource, /postForm</);
  assert.doesNotMatch(migrationSource, /desktopBridge\.api\.requestBinary\(/);

  assert.match(importsSource, /getDesktopBridge\(\)/);
  assert.match(importsSource, /desktopBridge\.api\.binary\.get\(/);
  assert.doesNotMatch(importsSource, /desktopBridge\.api\.requestBinary\(/);
});
