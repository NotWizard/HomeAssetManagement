import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('更新控制器启动后会立即检查并按 12 小时轮询', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const calls: string[] = [];
  let scheduled: (() => Promise<void>) | null = null;

  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.1.0',
    arch: 'arm64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-userdata',
    fetchJsonReleases: async () => {
      calls.push('fetchReleases');
      return [];
    },
    scheduleInterval(handler, intervalMs) {
      calls.push(`schedule:${intervalMs}`);
      scheduled = handler;
      return { dispose() {} };
    },
    loadPersistedState: () => null,
    persistState: () => undefined,
    now: () => 1_700_000_000_000,
  });

  await controller.start();
  assert.equal(calls.includes('fetchReleases'), true);
  assert.equal(calls.includes('schedule:43200000'), true);

  if (!scheduled) {
    throw new Error('轮询回调未注册');
  }
  await scheduled();
  assert.equal(calls.filter((entry) => entry === 'fetchReleases').length >= 2, true);
});

test('更新控制器会从持久化状态恢复已下载更新', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const downloadDir = '/tmp/hbs-userdata/updates';
  const downloadedFilePath = join(downloadDir, 'update.zip');
  mkdirSync(downloadDir, { recursive: true });
  writeFileSync(downloadedFilePath, 'dummy');

  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.1.0',
    arch: 'x64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-userdata',
    fetchJsonReleases: async () => [],
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => ({
      status: 'downloaded',
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
      assetName: 'HouseholdBalanceSheet-0.2.0-macos-x64.zip',
      downloadedFilePath,
      lastCheckedAt: 1_700_000_000_000,
    }),
    persistState: () => undefined,
    now: () => 1_700_000_000_100,
  });

  await controller.start();
  const state = controller.getState();
  assert.equal(state.status, 'downloaded');
  assert.equal(state.downloadedFilePath, downloadedFilePath);
});

test('持久化的已下载文件丢失时启动会回退为空闲状态', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const missingFilePath = '/tmp/hbs-userdata/updates/missing-update.zip';

  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.1.0',
    arch: 'x64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-userdata',
    fetchJsonReleases: async () => [],
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => ({
      status: 'downloaded',
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
      releaseTag: 'v0.2.0',
      assetName: 'HouseholdBalanceSheet-0.2.0-macos-x64.zip',
      assetUrl: 'https://example.com/download/x64.zip',
      downloadedFilePath: missingFilePath,
      lastCheckedAt: 1_700_000_000_000,
    }),
    persistState: () => undefined,
    now: () => 1_700_000_000_100,
  });

  await controller.start();
  const state = controller.getState();
  assert.equal(state.status, 'idle');
  assert.equal(state.downloadedFilePath, undefined);
});

test('当前版本已经追平已下载版本时不会继续显示待安装更新', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const downloadDir = '/tmp/hbs-userdata/updates';
  const downloadedFilePath = join(downloadDir, 'update-current.zip');
  mkdirSync(downloadDir, { recursive: true });
  writeFileSync(downloadedFilePath, 'dummy');

  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.2.0',
    arch: 'x64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-userdata',
    fetchJsonReleases: async () => [],
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => ({
      status: 'downloaded',
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
      assetName: 'HouseholdBalanceSheet-0.2.0-macos-x64.zip',
      downloadedFilePath,
      lastCheckedAt: 1_700_000_000_000,
    }),
    persistState: () => undefined,
    now: () => 1_700_000_000_100,
  });

  await controller.start();
  assert.equal(controller.getState().status, 'idle');
});

test('安装前会校验下载包是否与目标版本和架构匹配', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const downloadDir = '/tmp/hbs-userdata-invalid/updates';
  const downloadedFilePath = join(downloadDir, 'invalid-update.zip');
  mkdirSync(downloadDir, { recursive: true });
  writeFileSync(downloadedFilePath, 'dummy');

  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.1.0',
    arch: 'arm64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-userdata-invalid',
    fetchJsonReleases: async () => [],
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => ({
      status: 'downloaded',
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
      assetName: 'HouseholdBalanceSheet-0.2.0-macos-x64.zip',
      downloadedFilePath,
      lastCheckedAt: 1_700_000_000_000,
    }),
    persistState: () => undefined,
    now: () => 1_700_000_000_100,
    platform: 'darwin',
  });

  await controller.start();
  const state = await controller.installUpdate();
  assert.equal(state.status, 'error');
  assert.equal(state.errorMessage, '更新包与当前设备架构或目标版本不匹配');
});
