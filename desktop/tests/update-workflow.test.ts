import assert from 'node:assert/strict';
import test from 'node:test';

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
        asset: {
          name: 'HouseholdBalanceSheet-0.2.0-macos-arm64.zip',
          url: 'https://example.com/download/arm64.zip',
        },
      },
    })
  );

  assert.equal(availableState.status, 'available');

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
