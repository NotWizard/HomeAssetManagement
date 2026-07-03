import assert from 'node:assert/strict';
import test from 'node:test';

test('parseSha256File 接受纯摘要与 "摘要+空格+文件名" 两种格式，拒绝非法值', async () => {
  const workflow = await import('../src/update-workflow.ts');
  const valid = 'abcd'.repeat(16);

  assert.equal(workflow.parseSha256File(`${valid}\n`), valid);
  assert.equal(
    workflow.parseSha256File(`${valid}  HouseholdBalanceSheet.zip\n`),
    valid
  );
  assert.equal(workflow.parseSha256File('not-hex'), null);
  assert.equal(workflow.parseSha256File('abc'), null, '长度不足应被拒绝');
});

test('verifySha256 对大小写不敏感且拒绝非 64 位摘要', async () => {
  const workflow = await import('../src/update-workflow.ts');
  const lower = 'a'.repeat(64);
  const upper = lower.toUpperCase();

  assert.equal(workflow.verifySha256(lower, upper), true);
  assert.equal(workflow.verifySha256('a'.repeat(63), 'a'.repeat(64)), false);
  assert.equal(workflow.verifySha256('zzz', 'a'.repeat(64)), false);
});

test('findSha256AssetUrl 在 release 资产列表中找到配套 .sha256 文件', async () => {
  const workflow = await import('../src/update-workflow.ts');
  const release = {
    tag_name: 'v0.2.0',
    draft: false,
    prerelease: false,
    assets: [
      {
        name: 'HouseholdBalanceSheet-0.2.0-macos-arm64.zip',
        browser_download_url: 'https://example.com/zip',
      },
      {
        name: 'HouseholdBalanceSheet-0.2.0-macos-arm64.zip.sha256',
        browser_download_url: 'https://example.com/sha256',
      },
    ],
  };
  assert.equal(
    workflow.findSha256AssetUrl(
      release,
      'HouseholdBalanceSheet-0.2.0-macos-arm64.zip'
    ),
    'https://example.com/sha256'
  );
  assert.equal(
    workflow.findSha256AssetUrl(release, 'no-such-file.zip'),
    null
  );
});

test('pickUpdateCandidate 在 release 中带回 sha256AssetUrl', async () => {
  const workflow = await import('../src/update-workflow.ts');

  const candidate = workflow.pickUpdateCandidate({
    currentVersion: '0.1.0',
    arch: 'arm64',
    releases: [
      {
        tag_name: 'v0.2.0',
        draft: false,
        prerelease: false,
        assets: [
          {
            name: 'HouseholdBalanceSheet-0.2.0-macos-arm64.zip',
            browser_download_url: 'https://example.com/zip',
          },
          {
            name: 'HouseholdBalanceSheet-0.2.0-macos-arm64.zip.sha256',
            browser_download_url: 'https://example.com/sha256',
          },
        ],
      },
    ],
  });

  assert.ok(candidate, 'candidate 应被选中');
  assert.equal(candidate?.sha256AssetUrl, 'https://example.com/sha256');
});

test('更新工作流会为下载和安装阶段提供显式状态迁移', async () => {
  const workflow = await import('../src/update-workflow.ts');

  const idleState = workflow.createDefaultUpdateState('0.1.0');
  const availableState = workflow.applyUpdateStateTransition(
    idleState,
    workflow.toAvailableState({
      currentVersion: '0.1.0',
      candidate: {
        version: '0.2.0',
        tagName: 'v0.2.0',
        title: 'v0.2.0 手动更新',
        releaseUrl: 'https://example.com/releases/v0.2.0',
        publishedAt: '2026-07-03T00:00:00Z',
        asset: {
          name: 'HouseholdBalanceSheet-0.2.0-macos-arm64.zip',
          url: 'https://example.com/download/arm64.zip',
        },
      },
    })
  );

  assert.equal(availableState.status, 'available');
  assert.equal(availableState.releaseTitle, 'v0.2.0 手动更新');
  assert.equal(availableState.publishedAt, '2026-07-03T00:00:00Z');

  const downloadedState = workflow.applyUpdateStateTransition(
    availableState,
    workflow.toDownloadedState({
      downloadedFilePath: '/tmp/updates/HouseholdBalanceSheet-0.2.0-macos-arm64.zip',
      downloadedAt: '2026-04-01T00:00:00.000Z',
      downloadedBytes: 1200,
    })
  );
  assert.equal(downloadedState.status, 'downloaded');

  const preparingState = workflow.applyUpdateStateTransition(
    downloadedState,
    workflow.toPreparingInstallState()
  );
  assert.equal(preparingState.status, 'preparing');

  const installingState = workflow.applyUpdateStateTransition(
    preparingState,
    workflow.toInstallingState()
  );
  assert.equal(installingState.status, 'installing');
});

test('更新工作流会拒绝版本、架构或扩展名不合法的安装包', async () => {
  const workflow = await import('../src/update-workflow.ts');

  assert.deepEqual(
    workflow.validateDownloadedUpdate({
      latestVersion: '0.2.0',
      arch: 'arm64',
      assetName: 'HouseholdBalanceSheet-0.2.0-macos-arm64.zip',
      downloadedFilePath: '/tmp/HouseholdBalanceSheet-0.2.0-macos-arm64.zip',
    }),
    { ok: true }
  );

  assert.deepEqual(
    workflow.validateDownloadedUpdate({
      latestVersion: '0.2.0',
      arch: 'arm64',
      assetName: 'HouseholdBalanceSheet-0.2.0-macos-x64.zip',
      downloadedFilePath: '/tmp/HouseholdBalanceSheet-0.2.0-macos-x64.zip',
    }),
    {
      ok: false,
      message: '更新包与当前设备架构或目标版本不匹配',
    }
  );

  assert.deepEqual(
    workflow.validateDownloadedUpdate({
      latestVersion: '0.2.0',
      arch: 'arm64',
      assetName: 'HouseholdBalanceSheet-0.2.0-macos-arm64.dmg',
      downloadedFilePath: '/tmp/HouseholdBalanceSheet-0.2.0-macos-arm64.dmg',
    }),
    {
      ok: false,
      message: '更新包格式无效，仅支持 zip 安装包',
    }
  );
});

test('toNetworkDegradedState 仅返回诊断字段，不覆盖 status', async () => {
  const workflow = await import('../src/update-workflow.ts');
  const previousState = workflow.createDefaultUpdateState('0.1.0');
  const fragment = workflow.toNetworkDegradedState({
    previousState,
    now: 1_700_000_000_000,
  });

  // 关键：返回的 Partial 只含诊断字段，让调用方 spread 时保留 previousState 的所有既有字段。
  assert.deepEqual(fragment, {
    lastNetworkErrorAt: 1_700_000_000_000,
    consecutiveNetworkFailures: 1,
  });
});

test('toNetworkDegradedState 保留 previousState 的 errorKind（网络降级不清洗历史错误分类）', async () => {
  const workflow = await import('../src/update-workflow.ts');
  const previousState = {
    ...workflow.createDefaultUpdateState('0.1.0'),
    status: 'error' as const,
    errorKind: 'download' as const,
    errorMessage: '下载中断',
    error: '下载中断',
  };
  const next = {
    ...previousState,
    ...workflow.toNetworkDegradedState({ previousState, now: 1_700_000_000_000 }),
  };
  assert.equal(next.status, 'error', 'status 应保留 previousState 的 error');
  assert.equal(
    next.errorKind,
    'download',
    'errorKind 应保留 previousState 的下载错误分类'
  );
  assert.equal(
    next.errorMessage,
    '下载中断',
    'errorMessage 应保留 previousState 的下载错误文本'
  );
});

test('toNetworkDegradedState 会在 previousState 基础上累加 consecutiveNetworkFailures', async () => {
  const workflow = await import('../src/update-workflow.ts');
  const previousState = {
    ...workflow.createDefaultUpdateState('0.1.0'),
    consecutiveNetworkFailures: 4,
  };
  const fragment = workflow.toNetworkDegradedState({
    previousState,
    now: 1_700_000_000_000,
  });
  assert.equal(fragment.consecutiveNetworkFailures, 5);
});

test('错误分类构造函数会分别设置对应的 errorKind', async () => {
  const workflow = await import('../src/update-workflow.ts');

  assert.deepEqual(workflow.toDownloadErrorState('下载中断'), {
    status: 'error',
    errorKind: 'download',
    progress: undefined,
    errorMessage: '下载中断',
    error: '下载中断',
  });
  assert.deepEqual(workflow.toValidationErrorState('校验失败'), {
    status: 'error',
    errorKind: 'validation',
    progress: undefined,
    errorMessage: '校验失败',
    error: '校验失败',
  });
  assert.deepEqual(workflow.toInstallErrorState('安装失败'), {
    status: 'error',
    errorKind: 'install',
    progress: undefined,
    errorMessage: '安装失败',
    error: '安装失败',
  });
});

test('successfulCheckHealthFields 会重置网络失败计数器并记录最新已知版本', async () => {
  const workflow = await import('../src/update-workflow.ts');

  const withUpdate = workflow.successfulCheckHealthFields({
    now: 1_700_000_000_000,
    latestVersion: '0.2.0',
  });
  assert.equal(withUpdate.lastSuccessfulCheckAt, 1_700_000_000_000);
  assert.equal(withUpdate.consecutiveNetworkFailures, 0);
  assert.equal(withUpdate.lastNetworkErrorAt, undefined);
  assert.equal(withUpdate.lastKnownLatestVersion, '0.2.0');

  const noUpdate = workflow.successfulCheckHealthFields({
    now: 1_700_000_000_000,
    latestVersion: null,
  });
  assert.equal(noUpdate.lastKnownLatestVersion, null, '无更新时 latestVersion 应为 null');
});
