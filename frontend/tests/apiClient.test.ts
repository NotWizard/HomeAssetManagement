import assert from 'node:assert/strict';
import test from 'node:test';

// 直接 import 底层 transport 模块，避免触发 services/apiClient -> config/runtime 的整树副作用
import {
  ApiError,
  ApiTimeoutError,
  fetchWithTimeout,
  safeParseJson,
} from '../src/services/apiTransport.ts';

test('fetchWithTimeout 在超时时抛出 ApiTimeoutError 而不是 AbortError', async () => {
  const stuckFetch: typeof fetch = (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(init.signal?.reason);
      });
    });

  await assert.rejects(
    fetchWithTimeout(
      'http://localhost/test',
      {},
      { timeoutMs: 50 },
      stuckFetch
    ),
    (err: unknown) => err instanceof ApiTimeoutError
  );
});

test('fetchWithTimeout 在外部 signal 取消时不会把取消错误吞掉', async () => {
  const controller = new AbortController();
  const cancelReason = new Error('user-cancel');
  const stuckFetch: typeof fetch = (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(init.signal?.reason);
      });
    });

  setTimeout(() => controller.abort(cancelReason), 20);
  await assert.rejects(
    fetchWithTimeout(
      'http://localhost/test',
      {},
      { timeoutMs: 1_000, signal: controller.signal },
      stuckFetch
    ),
    (err: unknown) => err === cancelReason
  );
});

test('safeParseJson 对非 JSON 响应抛 ApiError 而非 SyntaxError', async () => {
  const response = new Response('<html>502 Bad Gateway</html>', {
    status: 502,
    headers: { 'Content-Type': 'text/html' },
  });
  await assert.rejects(safeParseJson(response), (err: unknown) => {
    if (!(err instanceof ApiError)) {
      return false;
    }
    return err.status === 502 && /502/.test(err.message);
  });
});

test('safeParseJson 解析合法 JSON 为对象', async () => {
  const response = new Response(
    JSON.stringify({ code: 0, message: 'ok', data: { x: 1 } }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
  const value = await safeParseJson(response);
  assert.deepEqual(value, { code: 0, message: 'ok', data: { x: 1 } });
});

test('safeParseJson 对空响应体返回 undefined 不抛错', async () => {
  const response = new Response('', { status: 200 });
  const value = await safeParseJson(response);
  assert.equal(value, undefined);
});

test('withRequestTimeout 在桌面桥挂起时按超时抛出 ApiTimeoutError', async () => {
  const { withRequestTimeout } = await import('../src/services/apiTransport.ts');

  const stuck = new Promise<never>(() => {});
  await assert.rejects(
    withRequestTimeout(stuck, { timeoutMs: 30 }),
    (err: unknown) => err instanceof ApiTimeoutError
  );
});

test('withRequestTimeout 透传外部 signal 取消原因', async () => {
  const { withRequestTimeout } = await import('../src/services/apiTransport.ts');

  const controller = new AbortController();
  const cancelReason = new Error('react-query-unmount');
  const stuck = new Promise<never>(() => {});
  setTimeout(() => controller.abort(cancelReason), 10);

  await assert.rejects(
    withRequestTimeout(stuck, { timeoutMs: 5_000, signal: controller.signal }),
    (err: unknown) => err === cancelReason
  );
});

test('withRequestTimeout 正常返回结果，且已取消的 signal 立即生效', async () => {
  const { withRequestTimeout } = await import('../src/services/apiTransport.ts');

  assert.equal(await withRequestTimeout(Promise.resolve(42)), 42);

  const controller = new AbortController();
  controller.abort(new Error('already-aborted'));
  await assert.rejects(
    withRequestTimeout(Promise.resolve(1), { signal: controller.signal }),
    (err: unknown) => (err as Error).message === 'already-aborted'
  );
});
