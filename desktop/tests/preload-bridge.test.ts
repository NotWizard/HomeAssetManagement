import assert from 'node:assert/strict';
import test from 'node:test';

import {
  API_BASE_ARG_PREFIX,
  API_TOKEN_ARG_PREFIX,
  API_TOKEN_HEADER,
  UPDATE_CHECK_CHANNEL,
  UPDATE_DOWNLOAD_CHANNEL,
  UPDATE_GET_STATE_CHANNEL,
  UPDATE_INSTALL_CHANNEL,
  createDesktopBridge,
  resolveApiBaseUrl,
  resolveApiToken,
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

test('resolveApiToken 解析 --hbs-api-token 参数', () => {
  assert.equal(
    resolveApiToken(['electron', `${API_TOKEN_ARG_PREFIX}abc-123`]),
    'abc-123'
  );
  assert.equal(resolveApiToken(['electron']), undefined);
  assert.equal(
    resolveApiToken(['electron', `${API_TOKEN_ARG_PREFIX}`]),
    undefined,
    '空 token 视为未注入'
  );
});

test('createDesktopBridge 在每次后端调用时都会附加 X-HBS-Token 头', async () => {
  type FetchCall = {
    url: string;
    method: string;
    headers: Record<string, string>;
  };
  const fetchCalls: FetchCall[] = [];

  const bridge = createDesktopBridge({
    argv: [
      'electron',
      `${API_BASE_ARG_PREFIX}http://127.0.0.1:18991/api/v1`,
      `${API_TOKEN_ARG_PREFIX}secret-token-99`,
    ],
    fetchImpl: async (input, init) => {
      const headers: Record<string, string> = {};
      const incoming = init?.headers as
        | Record<string, string>
        | Headers
        | undefined;
      if (incoming instanceof Headers) {
        incoming.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });
      } else if (incoming) {
        for (const [key, value] of Object.entries(incoming)) {
          headers[key.toLowerCase()] = value;
        }
      }
      fetchCalls.push({
        url: String(input),
        method: init?.method ?? 'GET',
        headers,
      });
      return new Response(
        JSON.stringify({ code: 0, message: 'ok', data: {} }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    },
    invokeIpc: async () => undefined,
    subscribeToUpdateState: () => () => undefined,
  });

  await bridge.api.json.get('/settings');
  await bridge.api.json.post('/members', '{}');
  await bridge.api.binary.get('/imports/1/errors');
  await bridge.api.form.post('/imports/preview', [['file', 'csv']]);

  assert.equal(fetchCalls.length, 4);
  for (const call of fetchCalls) {
    assert.equal(
      call.headers[API_TOKEN_HEADER.toLowerCase()],
      'secret-token-99',
      `${call.method} ${call.url} 缺少 X-HBS-Token 头`
    );
  }
});

test('createDesktopBridge 未注入 token 时不附加 X-HBS-Token 头', async () => {
  let captured: Record<string, string> = {};
  const bridge = createDesktopBridge({
    argv: ['electron', `${API_BASE_ARG_PREFIX}http://127.0.0.1:18991/api/v1`],
    fetchImpl: async (_input, init) => {
      const incoming = init?.headers as Record<string, string> | undefined;
      captured = { ...(incoming ?? {}) };
      return new Response(
        JSON.stringify({ code: 0, message: 'ok', data: {} }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    },
    invokeIpc: async () => undefined,
    subscribeToUpdateState: () => () => undefined,
  });

  await bridge.api.json.get('/settings');
  assert.equal(captured[API_TOKEN_HEADER], undefined);
  assert.equal(captured[API_TOKEN_HEADER.toLowerCase()], undefined);
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
  const fetchCalls: Array<{ url: string; method: string; body: string | null }> = [];
  let subscribed = false;
  const bridge = createDesktopBridge({
    argv: ['electron', `${API_BASE_ARG_PREFIX}http://127.0.0.1:18991/api/v1`],
    fetchImpl: async (input, init) => {
      fetchCalls.push({
        url: String(input),
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? init.body : null,
      });
      return new Response(JSON.stringify({ code: 0, message: 'ok', data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
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
  assert.equal(typeof bridge.api.json.get, 'function');
  assert.equal(typeof bridge.api.json.post, 'function');
  assert.equal(typeof bridge.api.json.put, 'function');
  assert.equal(typeof bridge.api.json.delete, 'function');
  assert.equal(typeof bridge.api.binary.get, 'function');
  assert.equal(typeof bridge.api.binary.post, 'function');
  assert.equal(typeof bridge.api.form.post, 'function');
  assert.equal(typeof bridge.bootstrap.retry, 'function');
  assert.equal(typeof bridge.updates.getState, 'function');
  assert.equal(typeof bridge.updates.checkForUpdates, 'function');
  assert.equal(typeof bridge.updates.downloadUpdate, 'function');
  assert.equal(typeof bridge.updates.installUpdate, 'function');
  assert.equal(typeof bridge.updates.onUpdateStateChanged, 'function');
  assert.equal('requestJson' in bridge.api, false);
  assert.equal('requestBinary' in bridge.api, false);
  assert.equal('postForm' in bridge.api, false);
  assert.equal('check' in bridge.updates, false);
  assert.equal('download' in bridge.updates, false);
  assert.equal('install' in bridge.updates, false);
  assert.equal('onStateChanged' in bridge.updates, false);

  await bridge.api.json.get('/settings');
  await bridge.api.json.post('/members', '{"name":"Alice"}');
  await bridge.api.json.put('/settings', '{"base_currency":"USD"}');
  await bridge.api.json.delete('/holdings/1');
  await bridge.api.binary.get('/imports/1/errors');
  await bridge.api.binary.post('/migration/export');
  await bridge.api.form.post('/imports/preview', [['file', 'csv']]);
  await bridge.bootstrap.retry();
  await bridge.updates.getState();
  await bridge.updates.checkForUpdates();
  await bridge.updates.downloadUpdate();
  await bridge.updates.installUpdate();
  const unsubscribe = bridge.updates.onUpdateStateChanged(() => undefined);
  unsubscribe();

  assert.equal(subscribed, true);
  assert.deepEqual(fetchCalls, [
    {
      url: 'http://127.0.0.1:18991/api/v1/settings',
      method: 'GET',
      body: null,
    },
    {
      url: 'http://127.0.0.1:18991/api/v1/members',
      method: 'POST',
      body: '{"name":"Alice"}',
    },
    {
      url: 'http://127.0.0.1:18991/api/v1/settings',
      method: 'PUT',
      body: '{"base_currency":"USD"}',
    },
    {
      url: 'http://127.0.0.1:18991/api/v1/holdings/1',
      method: 'DELETE',
      body: null,
    },
    {
      url: 'http://127.0.0.1:18991/api/v1/imports/1/errors',
      method: 'GET',
      body: null,
    },
    {
      url: 'http://127.0.0.1:18991/api/v1/migration/export',
      method: 'POST',
      body: null,
    },
    {
      url: 'http://127.0.0.1:18991/api/v1/imports/preview',
      method: 'POST',
      body: null,
    },
  ]);
  assert.deepEqual(invokedChannels, [
    'hbs:retry-bootstrap',
    UPDATE_GET_STATE_CHANNEL,
    UPDATE_CHECK_CHANNEL,
    UPDATE_DOWNLOAD_CHANNEL,
    UPDATE_INSTALL_CHANNEL,
  ]);
});

test('buildMainWindowWebPreferences 会固定 CommonJS preload + 沙箱 + Web 安全约束', () => {
  assert.deepEqual(
    buildMainWindowWebPreferences('/tmp/desktop', ['--hbs-api-base-url=http://127.0.0.1:18991/api/v1']),
    {
      preload: '/tmp/desktop/preload.cjs',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      additionalArguments: ['--hbs-api-base-url=http://127.0.0.1:18991/api/v1'],
    }
  );
});
