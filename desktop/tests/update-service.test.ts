import assert from 'node:assert/strict';
import test from 'node:test';

test('更新服务会比较语义化版本并忽略 v 前缀', async () => {
  const updateService = await import('../src/update-service.ts');

  assert.equal(updateService.compareVersions('v0.2.0', '0.1.9') > 0, true);
  assert.equal(updateService.compareVersions('0.2.0', 'v0.2.0'), 0);
  assert.equal(updateService.compareVersions('0.1.10', '0.1.9') > 0, true);
});

test('更新服务会挑选最新正式 release 并匹配当前架构 zip 资产', async () => {
  const updateService = await import('../src/update-service.ts');

  const releases = [
    {
      tag_name: 'v0.2.1-beta.1',
      draft: false,
      prerelease: true,
      assets: [],
    },
    {
      tag_name: 'v0.2.0',
      draft: false,
      prerelease: false,
      html_url: 'https://example.com/release/v0.2.0',
      assets: [
        {
          name: 'HouseholdBalanceSheet-0.2.0-macos-arm64.zip',
          browser_download_url: 'https://example.com/download/arm64.zip',
        },
      ],
    },
    {
      tag_name: 'v0.1.9',
      draft: false,
      prerelease: false,
      assets: [],
    },
  ];

  const candidate = updateService.pickUpdateCandidate({
    currentVersion: '0.1.0',
    arch: 'arm64',
    releases,
  });

  assert.equal(candidate?.version, '0.2.0');
  assert.equal(candidate?.asset.name, 'HouseholdBalanceSheet-0.2.0-macos-arm64.zip');
});

test('当前版本已是最新版本时不会返回可更新候选', async () => {
  const updateService = await import('../src/update-service.ts');

  const releases = [
    {
      tag_name: 'v0.1.0',
      draft: false,
      prerelease: false,
      assets: [
        {
          name: 'HouseholdBalanceSheet-0.1.0-macos-x64.zip',
          browser_download_url: 'https://example.com/download/x64.zip',
        },
      ],
    },
  ];

  const candidate = updateService.pickUpdateCandidate({
    currentVersion: '0.1.0',
    arch: 'x64',
    releases,
  });

  assert.equal(candidate, null);
});
