import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const workflowSource = readFileSync(
  resolve(process.cwd(), '.github/workflows/release.yml'),
  'utf8'
);
const desktopPackage = JSON.parse(
  readFileSync(resolve(process.cwd(), 'desktop/package.json'), 'utf8')
);

test('macOS 专用 DMG 依赖不会阻断 Linux CI 安装', () => {
  assert.equal(desktopPackage.dependencies?.['ds-store'], undefined);
  assert.equal(desktopPackage.optionalDependencies?.['ds-store'], '^0.1.6');
});

test('release workflow 支持手动选择 unsigned 发布模式', () => {
  assert.match(workflowSource, /release_mode:/);
  assert.match(workflowSource, /description: 'macOS 发布模式/);
  assert.match(workflowSource, /options:\s*\n\s+- developer-id\s*\n\s+- unsigned/);
  assert.match(workflowSource, /HBS_MACOS_RELEASE_MODE: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.release_mode \|\| 'unsigned' \}\}/);
});

test('release workflow 会把 Developer ID p12 证书导入临时 keychain', () => {
  assert.match(
    workflowSource,
    /HBS_MACOS_CERTIFICATE_P12:\s*\$\{\{\s*secrets\.HBS_MACOS_CERTIFICATE_P12\s*\}\}/
  );
  assert.match(
    workflowSource,
    /HBS_MACOS_CERTIFICATE_PASSWORD:\s*\$\{\{\s*secrets\.HBS_MACOS_CERTIFICATE_PASSWORD\s*\}\}/
  );
  assert.match(
    workflowSource,
    /HBS_MACOS_KEYCHAIN_PASSWORD:\s*\$\{\{\s*secrets\.HBS_MACOS_KEYCHAIN_PASSWORD\s*\}\}/
  );

  assert.match(workflowSource, /name:\s*Import Developer ID certificate/);
  assert.match(workflowSource, /security create-keychain/);
  assert.match(workflowSource, /security import "\$RUNNER_TEMP\/hbs-macos-cert\.p12"/);
  assert.match(workflowSource, /security set-key-partition-list/);
  assert.match(workflowSource, /KEYCHAIN_PATH="\$RUNNER_TEMP\/hbs-signing\.keychain-db"/);
  assert.match(workflowSource, /HBS_MACOS_CODESIGN_KEYCHAIN=\$KEYCHAIN_PATH/);
});

test('release workflow 强制校验 tag 与三端包版本一致', () => {
  // 更新器按 tag 版本拼资产名、产物名取自 package.json，不一致会让更新静默失效
  assert.match(workflowSource, /name: Assert tag matches package versions/);
  assert.match(workflowSource, /require\('\.\/desktop\/package\.json'\)\.version/);
  assert.match(workflowSource, /require\('\.\/frontend\/package\.json'\)\.version/);
  assert.match(workflowSource, /app_version: str = /);
  // README 已声明仅发布 Apple Silicon，x64 缺口为显式设计而非遗漏
  const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');
  assert.match(readme, /当前发布产物仅包含 Apple Silicon 版本/);
});

test('CI desktop job 包含 emit 构建冒烟，与 release 流水线无验证漂移', () => {
  const ciSource = readFileSync(
    resolve(process.cwd(), '.github/workflows/ci.yml'),
    'utf8'
  );
  // typecheck（--noEmit）之外必须真的跑 tsc -p 产出 dist，
  // 否则 rewriteRelativeImportExtensions 重写等 emit 期错误会延迟到发版才暴露
  assert.match(ciSource, /npm --prefix desktop run build/);
});
