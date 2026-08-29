import assert from 'node:assert/strict';
import test from 'node:test';

function createAbortError() {
  const error = new Error('aborted');
  Object.assign(error, { name: 'AbortError' });
  return error;
}

test('健康探测会在响应正常且 payload.status 为 ok 时返回 ready', async () => {
  const module = await import('../src/backend-health.ts');

  const result = await module.probeBackendHealth({
    healthUrl: 'http://127.0.0.1:41001/health',
    requestTimeoutMs: 100,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
    }),
  });

  assert.deepEqual(result, { kind: 'ready' });
});

test('健康探测会把请求超时分类为 timeout', async () => {
  const module = await import('../src/backend-health.ts');

  const result = await module.probeBackendHealth({
    healthUrl: 'http://127.0.0.1:41001/health',
    requestTimeoutMs: 5,
    fetchImpl: async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(createAbortError()), { once: true });
      }),
  });

  assert.deepEqual(result, { kind: 'timeout' });
});

test('健康探测会把端口拒绝连接分类为 connection_refused', async () => {
  const module = await import('../src/backend-health.ts');

  const result = await module.probeBackendHealth({
    healthUrl: 'http://127.0.0.1:41001/health',
    requestTimeoutMs: 100,
    fetchImpl: async () => {
      const error = new TypeError('fetch failed');
      Object.assign(error, { cause: { code: 'ECONNREFUSED' } });
      throw error;
    },
  });

  assert.deepEqual(result, { kind: 'connection_refused' });
});

test('健康探测会把非 200 响应分类为 http_error', async () => {
  const module = await import('../src/backend-health.ts');

  const result = await module.probeBackendHealth({
    healthUrl: 'http://127.0.0.1:41001/health',
    requestTimeoutMs: 100,
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ status: 'error' }),
    }),
  });

  assert.deepEqual(result, { kind: 'http_error', status: 500 });
});

test('健康探测会把无效 payload 分类为 invalid_payload', async () => {
  const module = await import('../src/backend-health.ts');

  const result = await module.probeBackendHealth({
    healthUrl: 'http://127.0.0.1:41001/health',
    requestTimeoutMs: 100,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }),
  });

  assert.deepEqual(result, { kind: 'invalid_payload' });
});

test('等待后端就绪超时时会带上最后一次失败分类', async () => {
  const module = await import('../src/backend-health.ts');
  const attempts: number[] = [];

  await assert.rejects(
    module.waitForBackendReadyWithHealthCheck({
      healthUrl: 'http://127.0.0.1:41001/health',
      attempts: 2,
      pollIntervalMs: 0,
      requestTimeoutMs: 100,
      isProcessExited: () => false,
      getExitCode: () => null,
      sleep: async () => undefined,
      fetchImpl: async () => {
        attempts.push(1);
        return {
          ok: false,
          status: 500,
          json: async () => ({ status: 'error' }),
        };
      },
    }),
    /后端健康检查超时：健康检查返回 HTTP 500/
  );

  assert.equal(attempts.length, 2);
});

test('健康探测会校验 app_name，防止端口被其他服务抢占后误判就绪', async () => {
  const module = await import('../src/backend-health.ts');

  // 其他服务返回了同形 ok payload，但 app_name 不符 → 不是我们的后端
  const wrongService = await module.probeBackendHealth({
    healthUrl: 'http://127.0.0.1:41001/health',
    requestTimeoutMs: 100,
    expectedAppName: 'Household Balance Sheet',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', app_name: 'Some Other Service' }),
    }),
  });
  assert.deepEqual(wrongService, {
    kind: 'unexpected_service',
    appName: 'Some Other Service',
  });

  // app_name 匹配才算就绪
  const ready = await module.probeBackendHealth({
    healthUrl: 'http://127.0.0.1:41001/health',
    requestTimeoutMs: 100,
    expectedAppName: 'Household Balance Sheet',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', app_name: 'Household Balance Sheet' }),
    }),
  });
  assert.deepEqual(ready, { kind: 'ready' });

  // 未传 expectedAppName 时保持旧行为（仅校验 status）
  const legacy = await module.probeBackendHealth({
    healthUrl: 'http://127.0.0.1:41001/health',
    requestTimeoutMs: 100,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
    }),
  });
  assert.deepEqual(legacy, { kind: 'ready' });

  // 失败文案包含重试指引
  assert.match(
    module.formatBackendHealthFailure({ kind: 'unexpected_service', appName: 'X' }),
    /端口被其他服务占用/
  );
});
