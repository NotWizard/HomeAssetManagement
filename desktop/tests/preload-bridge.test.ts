import assert from 'node:assert/strict';
import test from 'node:test';

import {
  API_BASE_ARG_PREFIX,
  UPDATE_CHECK_CHANNEL,
  UPDATE_DOWNLOAD_CHANNEL,
  UPDATE_GET_STATE_CHANNEL,
  UPDATE_INSTALL_CHANNEL,
  createDesktopBridge,
  resolveApiBaseUrl,
  resolveApiUrl,
  serializeHeaders,
} from '../src/preload-bridge.ts';
import { buildMainWindowWebPreferences } from '../src/window-options.ts';

test('resolveApiBaseUrl 与 resolveApiUrl 会正确拼接桌面 sidecar 地址', () => {
  const apiBaseUrl = resolveApiBaseUrl([
    'electron',
    `${API_BASE_ARG_PREFIX}http://127.0.0.1:18991/api/v1`,
  ]);

  assert.equal(apiBaseUrl, 'http://127.0.0.1:18991/api/v1');
  assert.equal(resolveApiUrl('/health', apiBaseUrl), 'http://127.0.0.1:18991/api/v1/health');
  assert.equal(resolveApiUrl('holdings', apiBaseUrl), 'http://127.0.0.1:18991/api/v1/holdings');
  assert.throws(() => resolveApiUrl('/health', undefined), /未检测到桌面运行时 API 基地址/);
});

test('serializeHeaders 会统一输出小写 header 键名', () => {
  const headers = new Headers({ 'Content-Type': 'application/json', ETag: 'abc' });
  assert.deepEqual(serializeHeaders(headers), {
    'content-type': 'application/json',
    etag: 'abc',
  });
});

test('createDesktopBridge 会按能力域暴露 api、bootstrap、updates', async () => {
  const invokedChannels: string[] = [];
  let subscribed = false;
  const bridge = createDesktopBridge({
    argv: ['electron', `${API_BASE_ARG_PREFIX}http://127.0.0.1:18991/api/v1`],
    fetchImpl: async () =>
      new Response(JSON.stringify({ code: 0, message: 'ok', data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    invokeIpc: async (channel: string) => {
      invokedChannels.push(channel);
      return channel;
    },
    subscribeToUpdateState: (listener) => {
      subscribed = true;
      listener({ status: 'idle' });
      return () => undefined;
    },
  });

  assert.equal(bridge.isDesktop, true);
  assert.equal(typeof bridge.api.requestJson, 'function');
  assert.equal(typeof bridge.api.requestBinary, 'function');
  assert.equal(typeof bridge.api.postForm, 'function');
  assert.equal(typeof bridge.bootstrap.retry, 'function');
  assert.equal(typeof bridge.updates.getState, 'function');
  assert.equal(typeof bridge.updates.check, 'function');
  assert.equal(typeof bridge.updates.download, 'function');
  assert.equal(typeof bridge.updates.install, 'function');

  await bridge.bootstrap.retry();
  await bridge.updates.getState();
  await bridge.updates.check();
  await bridge.updates.download();
  await bridge.updates.install();
  const unsubscribe = bridge.updates.onStateChanged(() => undefined);
  unsubscribe();

  assert.equal(subscribed, true);
  assert.deepEqual(invokedChannels, [
    'hbs:retry-bootstrap',
    UPDATE_GET_STATE_CHANNEL,
    UPDATE_CHECK_CHANNEL,
    UPDATE_DOWNLOAD_CHANNEL,
    UPDATE_INSTALL_CHANNEL,
  ]);
});

test('buildMainWindowWebPreferences 会固定 CommonJS preload 与隔离配置', () => {
  assert.deepEqual(
    buildMainWindowWebPreferences('/tmp/desktop', ['--hbs-api-base-url=http://127.0.0.1:18991/api/v1']),
    {
      preload: '/tmp/desktop/preload.cjs',
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: ['--hbs-api-base-url=http://127.0.0.1:18991/api/v1'],
    }
  );
});
