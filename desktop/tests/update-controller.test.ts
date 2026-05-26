import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

test('检测到新候选包后会自动后台触发下载，状态不停留在 available', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');

  const release = {
    tag_name: 'v0.2.0',
    name: 'v0.2.0',
    draft: false,
    prerelease: false,
    html_url: 'https://example.test/r/0.2.0',
    assets: [
      {
        name: 'HouseholdBalanceSheet-0.2.0-macos-arm64.zip',
        browser_download_url: 'https://example.test/asset.zip',
        size: 1024,
      },
      {
        name: 'HouseholdBalanceSheet-0.2.0-macos-arm64.zip.sha256',
        browser_download_url: 'https://example.test/asset.zip.sha256',
      },
    ],
  };

  const fetchCalls: string[] = [];
  const originalFetch = global.fetch;
  // mock fetch：sha256 拉取直接 5xx，让自动下载快速失败到 'error'，但能确认它确实被触发了
  global.fetch = (async (input: unknown) => {
    const url =
      typeof input === 'string'
        ? input
        : input && typeof input === 'object' && 'url' in input
          ? String((input as { url: unknown }).url)
          : '';
    fetchCalls.push(url);
    return {
      ok: false,
      status: 503,
      body: null,
      headers: new Headers(),
      text: async () => '',
      json: async () => ({}),
    } as unknown as Response;
  }) as typeof fetch;

  const stateLog: string[] = [];

  try {
    const controller = updateControllerModule.createUpdateController({
      appVersion: '0.1.0',
      arch: 'arm64',
      isPackaged: true,
      userDataDir: '/tmp/hbs-userdata-auto-download',
      fetchJsonReleases: async () => [release as never],
      scheduleInterval() {
        return { dispose() {} };
      },
      loadPersistedState: () => null,
      persistState: () => undefined,
      now: () => 1_700_000_000_000,
    });

    const unsubscribe = controller.subscribe((s) => stateLog.push(s.status));

    await controller.checkForUpdates();
    // fire-and-forget downloadUpdate 在 microtask 队列里，等到状态离开 'available'
    const deadline = Date.now() + 500;
    while (
      ['checking', 'available'].includes(controller.getState().status) &&
      Date.now() < deadline
    ) {
      await new Promise((r) => setTimeout(r, 5));
    }

    unsubscribe();

    // 关键断言：自动下载被触发，状态进入 downloading（且最终因 mock fetch 失败到 error）
    assert.ok(
      stateLog.includes('downloading'),
      `期望 status 经过 'downloading'（自动下载启动），实际序列: ${stateLog.join(' → ')}`
    );
    assert.ok(
      fetchCalls.some((url) => url.endsWith('.sha256')),
      `期望 sha256 校验文件被 fetch（自动下载真的发出请求），实际请求: ${fetchCalls.join(', ')}`
    );
    assert.notEqual(
      controller.getState().status,
      'available',
      '不应停留在 available 状态：用户描述要求"后台静默下载"，无需用户点击'
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('启动期清理会删除遗留的 .partial 半截下载文件', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const userDataDir = '/tmp/hbs-userdata-partial-cleanup';
  const updatesDir = join(userDataDir, 'updates');
  mkdirSync(updatesDir, { recursive: true });

  const leftoverPartial = join(updatesDir, 'HouseholdBalanceSheet-0.2.0-macos-arm64.zip.partial');
  writeFileSync(leftoverPartial, 'half-zip-bytes');
  assert.equal(existsSync(leftoverPartial), true, '前置：.partial 文件应已写入');

  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.1.0',
    arch: 'arm64',
    isPackaged: true,
    userDataDir,
    fetchJsonReleases: async () => [],
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => null,
    persistState: () => undefined,
    now: () => 1_700_000_000_000,
  });

  await controller.start();

  assert.equal(
    existsSync(leftoverPartial),
    false,
    '启动期清理应当删除遗留的 .partial 文件，避免下次下载混淆'
  );
});

test('listener 抛出异常不会影响其他 listener 与状态广播', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');

  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.1.0',
    arch: 'arm64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-userdata-listener-isolation',
    fetchJsonReleases: async () => [],
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => null,
    persistState: () => undefined,
    now: () => 1_700_000_000_000,
  });

  const goodLog: string[] = [];
  controller.subscribe(() => {
    throw new Error('boom from bad listener');
  });
  controller.subscribe((s) => {
    goodLog.push(s.status);
  });

  // 静默 stderr 噪声：D7 emitState 会把 listener 异常打到 stderr，测试期间隔离
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((_chunk: string | Uint8Array) => true) as typeof process.stderr.write;
  try {
    await controller.start();
  } finally {
    process.stderr.write = originalWrite;
  }

  assert.ok(
    goodLog.length > 0,
    '即使前一个 listener 抛错，后续 listener 仍应收到状态广播'
  );
});

