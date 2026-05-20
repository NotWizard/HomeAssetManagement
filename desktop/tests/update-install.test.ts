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
