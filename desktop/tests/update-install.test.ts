import assert from 'node:assert/strict';
import test from 'node:test';

test('当当前 app 位于 /Volumes 时安装目标会回退到 /Applications', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');

  assert.equal(
    updateControllerModule.resolveInstallTargetPath(
      '/Volumes/HouseholdBalanceSheet/HouseholdBalanceSheet.app/Contents/MacOS/HouseholdBalanceSheet'
    ),
    '/Applications/HouseholdBalanceSheet.app'
  );
});

test('安装脚本会包含等待主进程退出、复制新 app 与失败后管理员权限回退', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const script = updateControllerModule.buildDetachedInstallScript({
    pid: 1234,
    sourceAppPath: '/tmp/hbs-update/HouseholdBalanceSheet.app',
    targetAppPath: '/Applications/HouseholdBalanceSheet.app',
    backupPath: '/tmp/hbs-update/backup/previous.app',
  });

  assert.match(script, /while kill -0 "\$TARGET_PID"/);
  assert.match(script, /ditto "\$SOURCE_APP" "\$TARGET_APP"/);
  assert.match(script, /administrator privileges/);
  assert.match(script, /open "\$TARGET_APP"/);
});

test('安装脚本采用 staging→backup→swap 路径，失败时能从 BACKUP 还原 TARGET', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const script = updateControllerModule.buildDetachedInstallScript({
    pid: 1234,
    sourceAppPath: '/tmp/hbs-update/staged/HouseholdBalanceSheet.app',
    targetAppPath: '/Applications/HouseholdBalanceSheet.app',
    backupPath: '/tmp/hbs-update/backup/previous.app',
  });

  // 必须先 mv old → backup（不能直接 rm），保证可回滚
  assert.match(script, /mv "\$TARGET_APP" "\$BACKUP_APP"/);
  // 校验：成功后 rm backup，避免污染 userData/updates/backup
  assert.match(script, /rm -rf "\$BACKUP_APP"/);
  // 校验：ditto 失败后从 BACKUP 还原 TARGET
  assert.match(script, /mv "\$BACKUP_APP" "\$TARGET_APP"/);
  // 校验：BACKUP_APP 变量已注入
  assert.match(script, /BACKUP_APP=/);
});

test('安装脚本会移除新 app 的 macOS 隔离标记，避免升级后用户被要求重新授权', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const script = updateControllerModule.buildDetachedInstallScript({
    pid: 1234,
    sourceAppPath: '/tmp/hbs-update/staged/HouseholdBalanceSheet.app',
    targetAppPath: '/Applications/HouseholdBalanceSheet.app',
    backupPath: '/tmp/hbs-update/backup/previous.app',
  });

  // 必须递归剥离 com.apple.quarantine xattr，否则没签名的 zip 解压出的新 .app
  // 启动时会被 Gatekeeper 拦截，要求用户去 系统设置→隐私与安全 重新放行
  assert.match(script, /xattr -dr com\.apple\.quarantine/);
  // remove_quarantine 必须在 ditto 成功后、open 之前调用（这样 open 启动的是干净的 app）
  const dittoSuccessBlock = script.match(
    /ditto "\$SOURCE_APP" "\$TARGET_APP";[\s\S]*?exit 0/
  );
  assert.ok(dittoSuccessBlock, '未找到 ditto 成功分支');
  assert.match(dittoSuccessBlock![0], /remove_quarantine "\$TARGET_APP"/);
  // 提权 fallback 也必须经过 remove_quarantine（osascript with admin 写入的文件同样带 quarantine）
  const adminFallbackBlock = script.match(
    /administrator privileges"[\s\S]*$/
  );
  assert.ok(adminFallbackBlock, '未找到 admin fallback 分支');
  assert.match(adminFallbackBlock![0], /remove_quarantine "\$TARGET_APP"/);
});

test('安装阶段的清理与解压走异步命令通道（runCommandAsync）', async () => {
  const updateControllerModule = await import('../src/update-controller.ts');
  const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const userDataDir = mkdtempSync(join(tmpdir(), 'hbs-install-async-'));
  const updatesDir = join(userDataDir, 'updates');
  mkdirSync(updatesDir, { recursive: true });
  const assetName = 'HouseholdBalanceSheet-0.6.0-macos-arm64.zip';
  const downloadedFilePath = join(updatesDir, assetName);
  writeFileSync(downloadedFilePath, 'zip-bytes');

  const calls: string[] = [];
  try {
    const controller = updateControllerModule.createUpdateController({
      appVersion: '0.5.0',
      arch: 'arm64',
      isPackaged: true,
      userDataDir,
      fetchJsonReleases: async () => [],
      scheduleInterval() {
        return { dispose() {} };
      },
      loadPersistedState: () => ({
        status: 'downloaded',
        currentVersion: '0.5.0',
        latestVersion: '0.6.0',
        assetName,
        downloadedFilePath,
        lastCheckedAt: 1_700_000_000_000,
      }),
      persistState: () => undefined,
      now: () => 1_700_000_000_100,
      platform: 'darwin',
      // 只注入异步通道：若实现仍走同步 runCommand，本测试会因 ditto 未执行而失败
      runCommandAsync: async (command, args) => {
        calls.push(`${command} ${args.join(' ')}`);
        // ditto 解压返回非零，验证失败后还会再清理一次 staged
        return { status: command === 'ditto' ? 1 : 0 };
      },
    });

    await controller.start();
    const state = await controller.installUpdate();

    assert.equal(state.status, 'error');
    assert.equal(state.errorKind, 'install');
    assert.deepEqual(calls, [
      `/bin/rm -rf ${join(updatesDir, 'staged')}`,
      `ditto -x -k ${downloadedFilePath} ${join(updatesDir, 'staged')}`,
      `/bin/rm -rf ${join(updatesDir, 'staged')}`,
    ]);
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
  }
});
