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
