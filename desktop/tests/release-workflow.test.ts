import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const workflowSource = readFileSync(
  resolve(process.cwd(), '.github/workflows/release.yml'),
  'utf8'
);

test('release workflow 支持手动选择 unsigned 发布模式', () => {
  assert.match(workflowSource, /release_mode:/);
  assert.match(workflowSource, /description: 'macOS 发布模式/);
  assert.match(workflowSource, /options:\s*\n\s+- developer-id\s*\n\s+- unsigned/);
  assert.match(workflowSource, /HBS_MACOS_RELEASE_MODE: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.release_mode \|\| 'developer-id' \}\}/);
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
