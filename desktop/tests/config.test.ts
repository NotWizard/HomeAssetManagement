import assert from 'node:assert/strict';
import test from 'node:test';

test('桌面配置会把 SQLite 和存储目录放到用户数据目录下', async () => {
  const configModule = await import('../src/config.ts');

  const paths = configModule.buildDesktopPaths({
    userDataDir: '/Users/demo/Library/Application Support/HouseholdBalanceSheet',
    projectRoot: '/repo/HouseholdBalanceSheet',
    isPackaged: false,
    platform: 'darwin',
  });

  assert.equal(
    paths.storageDir,
    '/Users/demo/Library/Application Support/HouseholdBalanceSheet/data'
  );
  assert.equal(
    paths.databaseUrl,
    'sqlite:////Users/demo/Library/Application Support/HouseholdBalanceSheet/data/app.db'
  );
});

test('桌面配置会为后端拼装运行环境变量', async () => {
  const configModule = await import('../src/config.ts');

  const env = configModule.buildBackendEnvironment({
    port: 18400,
    storageDir: '/Users/demo/Library/Application Support/HouseholdBalanceSheet/data',
    databaseUrl:
      'sqlite:////Users/demo/Library/Application Support/HouseholdBalanceSheet/data/app.db',
    frontendDistDir: '/repo/HouseholdBalanceSheet/frontend/dist',
  });

  assert.equal(env.HBS_APP_HOST, '127.0.0.1');
  assert.equal(env.HBS_APP_PORT, '18400');
  assert.equal(
    env.HBS_FRONTEND_DIST_DIR,
    '/repo/HouseholdBalanceSheet/frontend/dist'
  );
});

test('桌面配置会根据打包状态解析前端和后端入口', async () => {
  const configModule = await import('../src/config.ts');

  const devPaths = configModule.buildDesktopPaths({
    userDataDir: '/Users/demo/Library/Application Support/HouseholdBalanceSheet',
    projectRoot: '/repo/HouseholdBalanceSheet',
    isPackaged: false,
    platform: 'darwin',
  });
  const packagedPaths = configModule.buildDesktopPaths({
    userDataDir: '/Users/demo/Library/Application Support/HouseholdBalanceSheet',
    projectRoot: '/repo/HouseholdBalanceSheet',
    resourcesPath: '/Applications/HouseholdBalanceSheet.app/Contents/Resources',
    isPackaged: true,
    platform: 'darwin',
  });

  assert.equal(devPaths.frontendDistDir, '/repo/HouseholdBalanceSheet/frontend/dist');
  assert.equal(devPaths.frontendEntryUrl, 'file:///repo/HouseholdBalanceSheet/frontend/dist/index.html');
  assert.equal(devPaths.backendEntry, '/repo/HouseholdBalanceSheet/backend/desktop_server.py');
  assert.equal(
    packagedPaths.frontendDistDir,
    '/Applications/HouseholdBalanceSheet.app/Contents/Resources/frontend-dist'
  );
  assert.equal(
    packagedPaths.frontendEntryUrl,
    'file:///Applications/HouseholdBalanceSheet.app/Contents/Resources/frontend-dist/index.html'
  );
  assert.equal(
    packagedPaths.backendEntry,
    '/Applications/HouseholdBalanceSheet.app/Contents/Resources/backend/hbs-backend/hbs-backend'
  );
});
