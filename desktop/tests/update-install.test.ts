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
  });

  assert.match(script, /while kill -0 "\$TARGET_PID"/);
  assert.match(script, /ditto "\$SOURCE_APP" "\$TARGET_APP"/);
  assert.match(script, /administrator privileges/);
  assert.match(script, /open "\$TARGET_APP"/);
});
