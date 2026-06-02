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
  // ensureWindow 现在排在 `await dependencies.prepare?.()` 之后；即便 prepare 未提供，
  // `await undefined` 仍要走一个微任务，所以同步段里 ensureWindow 还没跑。flush 一拍后
  // 再看 dedup 与 loading + focus 的副作用。
  await Promise.resolve();
  await Promise.resolve();

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
  let prepareCalls = 0;

  const controller = bootstrapModule.createBootstrapController({
    async prepare() {
      prepareCalls += 1;
      events.push('prepare');
    },
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

  assert.equal(prepareCalls, 1);
  assert.equal(ensureWindowCalls, 1);
  assert.equal(startBackendCalls, 1);
  assert.deepEqual(events, [
    'prepare',
    'loading',
    'focus',
    'dialog:后端健康检查超时',
    'error:后端健康检查超时',
  ]);
});

test('启动流程会先完成准备步骤，再创建窗口与启动后端', async () => {
  const bootstrapModule = await import('../src/bootstrap-controller.ts');
  const events: string[] = [];
  let prepared = false;

  const controller = bootstrapModule.createBootstrapController({
    async prepare() {
      events.push('prepare:start');
      // 用真异步 I/O 模拟 findAvailablePort 跨 tick 的 libuv 行为：如果哪天 runBootstrap
      // 把 ensureWindow 放回 prepare 之前的并行段，这条 await 会让 prepared 标志在
      // ensureWindow 触发的同步段里仍是 false，断言立即翻车。
      await new Promise((resolve) => setTimeout(resolve, 0));
      prepared = true;
      events.push('prepare:end');
    },
    ensureWindow() {
      events.push(`ensureWindow:${prepared ? 'prepared' : 'unprepared'}`);
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
      events.push(`startBackend:${prepared ? 'prepared' : 'unprepared'}`);
      return { appUrl: 'http://127.0.0.1:41001' };
    },
  });

  await controller.bootstrap();

  assert.deepEqual(events, [
    'prepare:start',
    'prepare:end',
    'ensureWindow:prepared',
    'loading',
    'focus',
    'startBackend:prepared',
    'app:http://127.0.0.1:41001',
  ]);
});

test('准备阶段失败时仍会创建窗口并展示错误页', async () => {
  const bootstrapModule = await import('../src/bootstrap-controller.ts');
  const events: string[] = [];
  let ensureWindowCalls = 0;
  let startBackendCalls = 0;

  const controller = bootstrapModule.createBootstrapController({
    async prepare() {
      events.push('prepare');
      throw new Error('无法分配本地端口');
    },
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
      return { appUrl: 'http://127.0.0.1:41001' };
    },
    showErrorDialog(message: string) {
      events.push(`dialog:${message}`);
    },
  });

  await controller.bootstrap();

  assert.equal(ensureWindowCalls, 1);
  assert.equal(startBackendCalls, 0);
  // prepare 抛错时窗口尚未创建，进入 catch 分支：兜底 ensureWindow → focus → showError。
  // 不再先展示 loading，再切到 error；这样可以避免前端拿不到 baseURL 时 loading 一闪而过
  // 又被错误页覆盖造成的视觉抖动。
  assert.deepEqual(events, [
    'prepare',
    'focus',
    'dialog:无法分配本地端口',
    'error:无法分配本地端口',
  ]);
});
