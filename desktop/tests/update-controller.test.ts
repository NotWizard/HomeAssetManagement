import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('更新控制器启动后会立即检查并按 12 小时轮询', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const calls: string[] = [];
  let scheduled: (() => Promise<void>) | null = null;
  // 时间可变：第一次 check 成功后 nextAllowedCheckAt = now + 12h；
  // 第二次 scheduled 触发时如果 still in backoff window 会被 noop 跳过，
  // 因此必须把时间拨到 12h 之后才能观察到第二次 fetchReleases。
  let currentTime = 1_700_000_000_000;

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
    now: () => currentTime,
  });

  await controller.start();
  assert.equal(calls.includes('fetchReleases'), true);
  assert.equal(calls.includes('schedule:43200000'), true);

  if (!scheduled) {
    throw new Error('轮询回调未注册');
  }
  // 退避窗口内调用 noop：不应触发新 fetch
  await scheduled();
  assert.equal(
    calls.filter((entry) => entry === 'fetchReleases').length,
    1,
    '退避窗口内轮询应 noop，不重复 fetch'
  );
  // 时间拨过 12h 后再次触发，fetch 才应该真正执行
  currentTime += 12 * 60 * 60 * 1000 + 1;
  await scheduled();
  assert.equal(calls.filter((entry) => entry === 'fetchReleases').length >= 2, true);
});

test('GitHub API 限流时会从 releases/latest 重定向兜底发现最新版本', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const originalFetch = global.fetch;
  const calls: string[] = [];

  global.fetch = (async (input: unknown, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input && typeof input === 'object' && 'url' in input
          ? String((input as { url: unknown }).url)
          : '';
    calls.push(`${init?.method ?? 'GET'} ${url}`);

    if (url === 'https://api.github.com/repos/NotWizard/HouseholdBalanceSheet/releases') {
      return new Response(JSON.stringify({ message: 'rate limit exceeded' }), {
        status: 403,
      });
    }

    if (url === 'https://github.com/NotWizard/HouseholdBalanceSheet/releases/latest') {
      return new Response(null, {
        status: 302,
        headers: {
          location: '/NotWizard/HouseholdBalanceSheet/releases/tag/v0.3.3',
        },
      });
    }

    if (url.includes('HouseholdBalanceSheet-0.3.3-macos-arm64.zip')) {
      return new Response(null, {
        status: 200,
        headers: { 'content-length': '149037741' },
      });
    }

    return new Response(null, { status: 404 });
  }) as typeof fetch;

  try {
    const releases = await updateControllerModule.fetchLatestReleases();

    assert.equal(releases[0]?.tag_name, 'v0.3.3');
    assert.deepEqual(
      releases[0]?.assets.map((asset) => asset.name),
      [
        'HouseholdBalanceSheet-0.3.3-macos-arm64.zip',
        'HouseholdBalanceSheet-0.3.3-macos-arm64.zip.sha256',
      ]
    );
    assert.ok(
      calls.includes('HEAD https://github.com/NotWizard/HouseholdBalanceSheet/releases/latest')
    );
  } finally {
    global.fetch = originalFetch;
  }
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

test('安装前会通过系统命令清理包含 app.asar 的 staging 目录', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const userDataDir = mkdtempSync(join(tmpdir(), 'hbs-update-stage-'));
  const updatesDir = join(userDataDir, 'updates');
  const stageDir = join(updatesDir, 'staged');
  const downloadedFilePath = join(
    updatesDir,
    'HouseholdBalanceSheet-0.2.0-macos-arm64.zip'
  );
  const commands: Array<{ command: string; args: string[] }> = [];

  mkdirSync(join(stageDir, 'HouseholdBalanceSheet.app', 'Contents', 'Resources'), {
    recursive: true,
  });
  writeFileSync(
    join(stageDir, 'HouseholdBalanceSheet.app', 'Contents', 'Resources', 'app.asar'),
    'stale'
  );
  writeFileSync(downloadedFilePath, 'dummy');

  try {
    const controller = updateControllerModule.createUpdateController({
      appVersion: '0.1.0',
      arch: 'arm64',
      isPackaged: true,
      userDataDir,
      fetchJsonReleases: async () => [],
      scheduleInterval() {
        return { dispose() {} };
      },
      loadPersistedState: () => ({
        status: 'downloaded',
        currentVersion: '0.1.0',
        latestVersion: '0.2.0',
        assetName: 'HouseholdBalanceSheet-0.2.0-macos-arm64.zip',
        downloadedFilePath,
        lastCheckedAt: 1_700_000_000_000,
      }),
      persistState: () => undefined,
      now: () => 1_700_000_000_100,
      platform: 'darwin',
      runCommand(command, args) {
        commands.push({ command, args });
        return { status: command === '/bin/rm' ? 0 : 1 };
      },
    });

    await controller.start();
    await controller.installUpdate();

    assert.deepEqual(commands[0], {
      command: '/bin/rm',
      args: ['-rf', stageDir],
    });
  } finally {
    rmSync(userDataDir, { force: true, recursive: true });
  }
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
    // fire-and-forget downloadUpdate 在 microtask 队列里，等到它实际请求校验文件；
    // downloading 状态会在首次 await 前广播，不能只以状态变化判断网络请求已发生。
    const deadline = Date.now() + 500;
    while (
      !fetchCalls.some((url) => url.endsWith('.sha256')) &&
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

test('手动检查发现新版后停在 available 且不会下载', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const userDataDir = mkdtempSync(join(tmpdir(), 'hbs-manual-update-'));
  const originalFetch = global.fetch;
  let assetFetchCount = 0;

  global.fetch = (async () => {
    assetFetchCount += 1;
    return new Response(null, { status: 503 });
  }) as typeof fetch;

  try {
    const controller = updateControllerModule.createUpdateController({
      appVersion: '0.4.1',
      arch: 'arm64',
      isPackaged: true,
      userDataDir,
      fetchJsonReleases: async () => [
        {
          tag_name: 'v0.5.0',
          name: 'v0.5.0 手动更新',
          html_url: 'https://example.test/releases/v0.5.0',
          published_at: '2026-07-03T00:00:00Z',
          draft: false,
          prerelease: false,
          assets: [
            {
              name: 'HouseholdBalanceSheet-0.5.0-macos-arm64.zip',
              browser_download_url: 'https://example.test/update.zip',
              size: 1024,
            },
            {
              name: 'HouseholdBalanceSheet-0.5.0-macos-arm64.zip.sha256',
              browser_download_url: 'https://example.test/update.zip.sha256',
            },
          ],
        },
      ],
      scheduleInterval() {
        return { dispose() {} };
      },
      loadPersistedState: () => null,
      persistState: () => undefined,
    });

    const state = await controller.checkForUpdates({ manual: true });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(state.status, 'available');
    assert.equal(state.releaseTitle, 'v0.5.0 手动更新');
    assert.equal(state.publishedAt, '2026-07-03T00:00:00Z');
    assert.equal(assetFetchCount, 0, '手动检查不应自动请求更新包');
  } finally {
    global.fetch = originalFetch;
    rmSync(userDataDir, { force: true, recursive: true });
  }
});

test('并发检查只会发起一次 Release 请求', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  let releaseFetchCount = 0;
  let resolveReleases: ((value: never[]) => void) | null = null;
  const pendingReleases = new Promise<never[]>((resolve) => {
    resolveReleases = resolve;
  });

  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.4.1',
    arch: 'arm64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-update-concurrent-check',
    fetchJsonReleases: async () => {
      releaseFetchCount += 1;
      return pendingReleases;
    },
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => null,
    persistState: () => undefined,
  });

  const firstCheck = controller.checkForUpdates({ manual: true });
  const secondCheck = controller.checkForUpdates({ manual: true });
  resolveReleases?.([]);
  await Promise.all([firstCheck, secondCheck]);

  assert.equal(releaseFetchCount, 1);
});

test('成功检查命中同一候选时会保留已下载文件且不重复下载', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const userDataDir = mkdtempSync(join(tmpdir(), 'hbs-downloaded-refresh-'));
  const updatesDir = join(userDataDir, 'updates');
  const assetName = 'HouseholdBalanceSheet-0.5.0-macos-arm64.zip';
  const downloadedFilePath = join(updatesDir, assetName);
  const originalFetch = global.fetch;
  let assetFetchCount = 0;

  mkdirSync(updatesDir, { recursive: true });
  writeFileSync(downloadedFilePath, 'verified-update');
  global.fetch = (async () => {
    assetFetchCount += 1;
    return new Response(null, { status: 503 });
  }) as typeof fetch;

  try {
    const controller = updateControllerModule.createUpdateController({
      appVersion: '0.4.1',
      arch: 'arm64',
      isPackaged: true,
      userDataDir,
      fetchJsonReleases: async () => [
        {
          tag_name: 'v0.5.0',
          name: 'v0.5.0 手动更新',
          html_url: 'https://example.test/releases/v0.5.0',
          published_at: '2026-07-03T00:00:00Z',
          draft: false,
          prerelease: false,
          assets: [
            {
              name: assetName,
              browser_download_url: 'https://example.test/update.zip',
              size: 1024,
            },
            {
              name: `${assetName}.sha256`,
              browser_download_url: 'https://example.test/update.zip.sha256',
            },
          ],
        },
      ],
      scheduleInterval() {
        return { dispose() {} };
      },
      loadPersistedState: () => ({
        status: 'downloaded',
        currentVersion: '0.4.1',
        latestVersion: '0.5.0',
        assetName,
        assetUrl: 'https://example.test/update.zip',
        sha256AssetUrl: 'https://example.test/update.zip.sha256',
        downloadedFilePath,
        downloadedAt: '2026-07-03T00:00:00.000Z',
        progress: 100,
      }),
      persistState: () => undefined,
    });

    await controller.start();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(controller.getState().status, 'downloaded');
    assert.equal(controller.getState().downloadedFilePath, downloadedFilePath);
    assert.equal(assetFetchCount, 0);
  } finally {
    global.fetch = originalFetch;
    rmSync(userDataDir, { force: true, recursive: true });
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

test('网络检查失败时不进 error 状态，而是保留 previousState 的稳定态（idle）', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const states: Array<{ status: string; errorKind?: string }> = [];

  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.3.1',
    arch: 'arm64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-userdata-network-idle',
    fetchJsonReleases: async () => {
      throw new Error('检查更新失败: HTTP 403');
    },
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => null,
    persistState: (state) => {
      states.push({ status: state.status, errorKind: state.errorKind });
    },
    now: () => 1_700_000_000_000,
  });

  // 静默 stderr 的"网络检查失败"噪声
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    await controller.start();
  } finally {
    process.stderr.write = originalWrite;
  }

  const finalState = controller.getState();
  assert.equal(finalState.status, 'idle', '网络失败后应保持 idle 而非 error');
  assert.equal(finalState.errorKind, undefined);
  assert.equal(finalState.errorMessage, undefined, '不应残留 errorMessage');
  assert.equal(
    finalState.lastNetworkErrorAt,
    1_700_000_000_000,
    '应记录诊断时间戳'
  );
  assert.equal(finalState.consecutiveNetworkFailures, 1);
  // 中间状态序列里绝不应出现 status === 'error'
  assert.equal(
    states.some((entry) => entry.status === 'error'),
    false,
    '整个生命周期不应出现 error 状态'
  );
});

test('网络检查失败时若 previousState 为 downloaded 应保持 downloaded（等待用户安装）', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const downloadDir = '/tmp/hbs-userdata-network-keep-dl/updates';
  const downloadedFilePath = `${downloadDir}/update.zip`;
  mkdirSync(downloadDir, { recursive: true });
  writeFileSync(downloadedFilePath, 'dummy');

  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.3.1',
    arch: 'arm64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-userdata-network-keep-dl',
    fetchJsonReleases: async () => {
      throw new Error('HTTP 403');
    },
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => ({
      status: 'downloaded',
      currentVersion: '0.3.1',
      latestVersion: '0.4.0',
      assetName: 'HouseholdBalanceSheet-0.4.0-macos-arm64.zip',
      downloadedFilePath,
      lastCheckedAt: 1_699_999_000_000,
    }),
    persistState: () => undefined,
    now: () => 1_700_000_000_000,
  });

  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    await controller.start();
  } finally {
    process.stderr.write = originalWrite;
  }

  const finalState = controller.getState();
  assert.equal(
    finalState.status,
    'downloaded',
    '网络失败不应打扰已等待用户安装的 downloaded 状态'
  );
  assert.equal(finalState.downloadedFilePath, downloadedFilePath);
  assert.equal(finalState.consecutiveNetworkFailures, 1);
});

test('成功检查更新后 lastSuccessfulCheckAt 与 lastKnownLatestVersion 会被写入', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');

  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.3.1',
    arch: 'arm64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-userdata-success-fields',
    fetchJsonReleases: async () => [],
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => null,
    persistState: () => undefined,
    now: () => 1_700_000_000_000,
  });

  await controller.start();
  const state = controller.getState();
  assert.equal(state.status, 'idle');
  assert.equal(state.lastSuccessfulCheckAt, 1_700_000_000_000);
  assert.equal(state.consecutiveNetworkFailures, 0);
  assert.equal(state.lastNetworkErrorAt, undefined);
  assert.equal(state.lastKnownLatestVersion, null, '无新版本时 lastKnownLatestVersion 应为 null');
});

test('网络失败累计 consecutiveNetworkFailures，成功后清零', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  let currentTime = 1_700_000_000_000;
  let shouldFail = true;

  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.3.1',
    arch: 'arm64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-userdata-failure-count',
    fetchJsonReleases: async () => {
      if (shouldFail) throw new Error('HTTP 500');
      return [];
    },
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => null,
    persistState: () => undefined,
    now: () => currentTime,
  });

  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    // 用 manual=true 强制每次真实 fetch，让计数器按预期累加
    await controller.start();
    assert.equal(controller.getState().consecutiveNetworkFailures, 1);

    await controller.checkForUpdates({ manual: true });
    assert.equal(controller.getState().consecutiveNetworkFailures, 2);

    // 拨到 12h 后让下一次 check 通过退避
    currentTime += 12 * 60 * 60 * 1000 + 1;
    shouldFail = false;
    await controller.checkForUpdates({ manual: true });
    assert.equal(
      controller.getState().consecutiveNetworkFailures,
      0,
      '成功后 consecutiveNetworkFailures 应归零'
    );
    assert.equal(controller.getState().lastNetworkErrorAt, undefined);
    assert.equal(
      controller.getState().lastSuccessfulCheckAt,
      currentTime
    );
  } finally {
    process.stderr.write = originalWrite;
  }
});

test('sanitize 启动时会把超过 1 小时的 error 状态清洗为 idle', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const errorTimestamp = 1_700_000_000_000;
  const nowTimestamp = errorTimestamp + 2 * 60 * 60 * 1000; // 2h 后

  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.3.1',
    arch: 'arm64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-userdata-sanitize-ttl',
    fetchJsonReleases: async () => [],
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => ({
      status: 'error',
      currentVersion: '0.3.1',
      errorMessage: '检查更新失败: HTTP 403',
      error: '检查更新失败: HTTP 403',
      lastCheckedAt: errorTimestamp,
    }),
    persistState: () => undefined,
    now: () => nowTimestamp,
  });

  // 让 fetch 也失败，避免 sanitize 后的 idle 状态又被 checkForUpdates 重新打成 error
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    await controller.start();
  } finally {
    process.stderr.write = originalWrite;
  }

  // 启动期 sanitize 后立刻 emitState 广播的是 idle（TTL 生效）；
  // 但紧接着 checkForUpdates 又因 fetch 失败降级，最终状态仍应是 idle。
  const state = controller.getState();
  assert.equal(state.status, 'idle', '陈旧的 error 状态应被 sanitize 清洗');
  assert.equal(state.errorMessage, undefined);
  assert.equal(state.errorKind, undefined);
});

test('sanitize 启动时未到 TTL 的 error 状态保持原样，让用户能重试', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const errorTimestamp = 1_700_000_000_000;
  const nowTimestamp = errorTimestamp + 30 * 60 * 1000; // 30min 后

  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.3.1',
    arch: 'arm64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-userdata-sanitize-fresh',
    fetchJsonReleases: async () => [],
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => ({
      status: 'error',
      currentVersion: '0.3.1',
      errorKind: 'download',
      errorMessage: '下载中断',
      lastCheckedAt: errorTimestamp,
    }),
    persistState: () => undefined,
    now: () => nowTimestamp,
  });

  // start 后 sanitize 阶段会先广播 error，随后 checkForUpdates 成功会把状态切到 idle。
  // 我们关心的是 sanitize 阶段：让 fetch 直接永不返回，仅观察 sanitize 后瞬间状态
  // —— 通过让 fetch 抛错的 controller 实例对比观察 sanitize 后的初始状态。
  const controller2 = updateControllerModule.createUpdateController({
    appVersion: '0.3.1',
    arch: 'arm64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-userdata-sanitize-fresh-2',
    fetchJsonReleases: async () => {
      throw new Error('HTTP 500');
    },
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => ({
      status: 'error',
      currentVersion: '0.3.1',
      errorKind: 'download',
      errorMessage: '下载中断',
      lastCheckedAt: errorTimestamp,
    }),
    persistState: () => undefined,
    now: () => nowTimestamp,
  });

  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    await controller2.start();
  } finally {
    process.stderr.write = originalWrite;
  }

  const state = controller2.getState();
  // 未到 TTL：sanitize 不动；checkForUpdates 失败降级也维持 error
  assert.equal(state.status, 'error');
  assert.equal(state.errorKind, 'download', '原始 errorKind 应被保留');
  assert.equal(state.errorMessage, '下载中断');
});

test('旧 state.json（无 lastSuccessfulCheckAt）在 sanitize 时会被推断', async () => {
  // 模拟旧字段结构：无 lastSuccessfulCheckAt / consecutiveNetworkFailures / lastNetworkErrorAt
  const legacyPersisted = {
    status: 'idle' as const,
    currentVersion: '0.3.0',
    lastCheckedAt: 1_699_999_000_000,
  };

  const controllerModule = await import('../src/update-controller.ts');
  // 用 subscribe 拿 sanitize 阶段 emitState 广播的"瞬间"状态，避免被后续 checkForUpdates 覆盖
  let firstEmittedState: any = null;
  const controller = controllerModule.createUpdateController({
    appVersion: '0.3.1',
    arch: 'arm64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-userdata-legacy',
    fetchJsonReleases: async () => [],
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => legacyPersisted,
    persistState: () => undefined,
    now: () => 1_700_000_000_000,
  });
  controller.subscribe((state) => {
    if (firstEmittedState === null) firstEmittedState = state;
  });

  await controller.start();
  // sanitize 阶段会 emitState → 第一个 subscribe 回调拿到的就是 sanitize 后瞬间的快照
  assert.equal(
    firstEmittedState.lastSuccessfulCheckAt,
    1_699_999_000_000,
    '旧 idle 状态的 lastCheckedAt 应被推断为 lastSuccessfulCheckAt'
  );
  // 但 start 完成后 checkForUpdates 还会再跑一次，把 lastSuccessfulCheckAt 推到 now
  assert.equal(controller.getState().lastSuccessfulCheckAt, 1_700_000_000_000);
});

test('退避：连续网络失败 >=3 次后轮询 noop，manual=true 时无视退避', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  let currentTime = 1_700_000_000_000;
  let fetchCount = 0;

  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.3.1',
    arch: 'arm64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-userdata-backoff',
    fetchJsonReleases: async () => {
      fetchCount += 1;
      throw new Error('HTTP 500');
    },
    scheduleInterval() {
      return { dispose() {} };
    },
    loadPersistedState: () => null,
    persistState: () => undefined,
    now: () => currentTime,
  });

  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    // start() 触发第 1 次 check（fetchCount=1，consecutiveNetworkFailures=1）
    await controller.start();
    assert.equal(fetchCount, 1);

    // 退避窗口 12h 内普通调用 noop：fetch 不触发，计数器不变
    currentTime += 1_000;
    await controller.checkForUpdates();
    assert.equal(fetchCount, 1, '退避窗口内普通调用应 noop，不触发 fetch');
    assert.equal(
      controller.getState().consecutiveNetworkFailures,
      1,
      'noop 不应修改 consecutiveNetworkFailures'
    );

    // manual=true 无视退避
    await controller.checkForUpdates({ manual: true });
    assert.equal(fetchCount, 2, 'manual=true 应无视退避立即 fetch');
    assert.equal(controller.getState().consecutiveNetworkFailures, 2);

    // 再来一次手动到 consecutive=3
    await controller.checkForUpdates({ manual: true });
    await controller.checkForUpdates({ manual: true });
    assert.equal(controller.getState().consecutiveNetworkFailures, 4);

    // 连续失败 >=3 后，退避窗口应拉长到 4h；4h 内普通调用 noop
    fetchCount = 0;
    currentTime += 3 * 60 * 60 * 1000; // +3h，仍 < 4h
    await controller.checkForUpdates();
    assert.equal(fetchCount, 0, '4h 退避窗口内应 noop');

    // 4h 后再试应该放行
    currentTime += 2 * 60 * 60 * 1000; // +2h = 累计 5h > 4h
    await controller.checkForUpdates();
    assert.equal(fetchCount, 1, '4h 退避窗口过后应重新 fetch');
  } finally {
    process.stderr.write = originalWrite;
  }
});
