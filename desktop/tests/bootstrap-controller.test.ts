import assert from 'node:assert/strict';
import test from 'node:test';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('重复触发启动时会复用同一个启动流程，并在后端就绪前先显示加载界面', async () => {
  const bootstrapModule = await import('../src/bootstrap-controller.ts');
  const deferred = createDeferred<{ appUrl: string }>();
  const events: string[] = [];
  let ensureWindowCalls = 0;
  let startBackendCalls = 0;

  const controller = bootstrapModule.createBootstrapController({
    ensureWindow() {
      ensureWindowCalls += 1;
      return {
        async showLoading() {
          events.push('loading');
        },
        async showApp(url: string) {
          events.push(`app:${url}`);
        },
        async showError(message: string) {
          events.push(`error:${message}`);
        },
        focus() {
          events.push('focus');
        },
      };
    },
    async startBackend() {
      startBackendCalls += 1;
      return deferred.promise;
    },
    showErrorDialog(message: string) {
      events.push(`dialog:${message}`);
    },
  });

  const firstBootstrap = controller.bootstrap();
  const secondBootstrap = controller.bootstrap();

  assert.equal(firstBootstrap, secondBootstrap);
  assert.equal(ensureWindowCalls, 1);
  assert.equal(startBackendCalls, 1);
  assert.deepEqual(events, ['loading', 'focus']);

  deferred.resolve({ appUrl: 'http://127.0.0.1:62166/' });
  await firstBootstrap;

  assert.deepEqual(events, ['loading', 'focus', 'app:http://127.0.0.1:62166/']);
});

test('启动失败后会在同一个窗口里显示错误页，不会额外留下第二个窗口', async () => {
  const bootstrapModule = await import('../src/bootstrap-controller.ts');
  const events: string[] = [];
  const failure = new Error('后端健康检查超时');
  let ensureWindowCalls = 0;
  let startBackendCalls = 0;

  const controller = bootstrapModule.createBootstrapController({
    ensureWindow() {
      ensureWindowCalls += 1;
      return {
        async showLoading() {
          events.push('loading');
        },
        async showApp(url: string) {
          events.push(`app:${url}`);
        },
        async showError(message: string) {
          events.push(`error:${message}`);
        },
        focus() {
          events.push('focus');
        },
      };
    },
    async startBackend() {
      startBackendCalls += 1;
      throw failure;
    },
    showErrorDialog(message: string) {
      events.push(`dialog:${message}`);
    },
  });

  await controller.bootstrap();

  assert.equal(ensureWindowCalls, 1);
  assert.equal(startBackendCalls, 1);
  assert.deepEqual(events, [
    'loading',
    'focus',
    'dialog:后端健康检查超时',
    'error:后端健康检查超时',
  ]);
});
