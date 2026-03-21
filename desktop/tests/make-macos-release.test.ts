import assert from 'node:assert/strict';
import test from 'node:test';

test('发布脚本会展开 all 为双架构列表', async () => {
  const releaseUtils = await import('../scripts/release-utils.mjs');

  assert.deepEqual(releaseUtils.resolveReleaseArchitectures('all'), ['arm64', 'x64']);
  assert.deepEqual(releaseUtils.resolveReleaseArchitectures('arm64'), ['arm64']);
});

test('发布脚本会生成稳定的制品文件名', async () => {
  const releaseUtils = await import('../scripts/release-utils.mjs');

  assert.equal(
    releaseUtils.buildReleaseArtifactName({
      arch: 'x64',
      extension: 'dmg',
      version: '0.1.0',
    }),
    'HouseholdBalanceSheet-0.1.0-macos-x64.dmg'
  );
});

test('发布脚本会识别 Forge 生成的 dmg 与 zip 路径', async () => {
  const releaseScript = await import('../scripts/make-macos-release.mjs');

  assert.equal(
    releaseScript.isMatchingArtifactPath(
      '/tmp/out/make/HouseholdBalanceSheet-0.1.0-arm64.dmg',
      'arm64'
    ),
    true
  );
  assert.equal(
    releaseScript.isMatchingArtifactPath(
      '/tmp/out/make/zip/darwin/arm64/HouseholdBalanceSheet-darwin-arm64-0.1.0.zip',
      'arm64'
    ),
    true
  );
});
