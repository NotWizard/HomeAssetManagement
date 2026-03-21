import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const FRONTEND_ROOT = process.cwd();

function readFrontendFile(relativePath: string): string {
  return readFileSync(resolve(FRONTEND_ROOT, relativePath), 'utf8');
}

test('桌面服务层会优先通过 bridge 发起 JSON 请求', () => {
  const apiClientSource = readFrontendFile('src/services/apiClient.ts');

  assert.match(apiClientSource, /getDesktopBridge\(\)/);
  assert.match(apiClientSource, /requestJson\(/);
});

test('桌面模式会通过 bridge 上传表单，而不是直接拼接 localhost 地址', () => {
  const apiClientSource = readFrontendFile('src/services/apiClient.ts');

  assert.match(apiClientSource, /postForm\(/);
  assert.match(apiClientSource, /serializeFormData/);
});

test('迁移包与错误报告下载在桌面模式下也会通过 bridge 走本地 sidecar', () => {
  const migrationSource = readFrontendFile('src/services/migration.ts');
  const importsSource = readFrontendFile('src/services/imports.ts');

  assert.match(migrationSource, /getDesktopBridge\(\)/);
  assert.match(migrationSource, /requestBinary\(/);
  assert.match(migrationSource, /postForm</);

  assert.match(importsSource, /getDesktopBridge\(\)/);
  assert.match(importsSource, /requestBinary\(/);
});
