import assert from 'node:assert/strict';
import test from 'node:test';

test('资源暂存会按目标架构解析后端产物目录', async () => {
  const releaseUtils = await import('../scripts/release-utils.mjs');

  const backendDir = releaseUtils.resolveBackendBundleDir({
    arch: 'arm64',
    desktopRoot: '/repo/desktop',
  });

  assert.equal(backendDir, '/repo/backend/dist-desktop/arm64');
});
