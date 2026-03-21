import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const FRONTEND_ROOT = process.cwd();

test('桌面运行时配置可以覆盖 Vite 环境变量中的 API 地址', async () => {
  const runtimeModule = await import('../src/config/runtime.ts');

  assert.equal(
    runtimeModule.resolveApiBaseUrl(
      { apiBaseUrl: 'http://127.0.0.1:9527/api/v1' },
      'http://127.0.0.1:8000/api/v1'
    ),
    'http://127.0.0.1:9527/api/v1'
  );
});

test('缺少运行时配置时会回退到默认 API 地址', async () => {
  const runtimeModule = await import('../src/config/runtime.ts');

  assert.equal(
    runtimeModule.resolveApiBaseUrl(undefined, undefined),
    'http://127.0.0.1:8000/api/v1'
  );
});

test('桌面版同源托管时会优先回退到当前窗口 origin 下的 API 地址', async () => {
  const runtimeModule = await import('../src/config/runtime.ts');

  assert.equal(
    runtimeModule.resolveApiBaseUrl(
      undefined,
      undefined,
      'http://127.0.0.1:18991'
    ),
    'http://127.0.0.1:18991/api/v1'
  );
});

test('服务层统一通过运行时配置模块解析 API 地址', () => {
  const apiClientSource = readFileSync(resolve(FRONTEND_ROOT, 'src/services/apiClient.ts'), 'utf8');

  assert.match(apiClientSource, /getApiBaseUrl\(\)/);
});

test('运行时配置模块可以识别桌面 bridge', async () => {
  const runtimeModule = await import('../src/config/runtime.ts');

  assert.equal(
    runtimeModule.isDesktopRuntime({
      __HBS_DESKTOP__: {
        isDesktop: true,
      },
    }),
    true
  );
});

test('桌面 bridge 类型应包含更新流程能力', () => {
  const runtimeSource = readFileSync(resolve(FRONTEND_ROOT, 'src/config/runtime.ts'), 'utf8');

  assert.match(runtimeSource, /getUpdateState:\s*\(\)\s*=>\s*Promise<unknown>/);
  assert.match(runtimeSource, /checkForUpdates:\s*\(\)\s*=>\s*Promise<unknown>/);
  assert.match(runtimeSource, /downloadUpdate:\s*\(\)\s*=>\s*Promise<unknown>/);
  assert.match(runtimeSource, /installUpdate:\s*\(\)\s*=>\s*Promise<unknown>/);
  assert.match(runtimeSource, /onUpdateStateChanged:\s*\(listener:\s*\(state:\s*unknown\)\s*=>\s*void\)\s*=>\s*\(\(\)\s*=>\s*void\)/);
});
