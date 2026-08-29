import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';

type FakeProcessOptions = {
  exitCode?: number | null;
};

class FakeStream extends EventEmitter {
  write(_chunk: unknown) {}
}

class FakeBackendProcess extends EventEmitter {
  exitCode: number | null;
  killed = false;
  stdout = new FakeStream();
  stderr = new FakeStream();

  constructor(options: FakeProcessOptions = {}) {
    super();
    this.exitCode = options.exitCode ?? null;
  }

  kill() {
    this.killed = true;
    this.exitCode = 0;
    queueMicrotask(() => {
      this.emit('exit', 0, null);
    });
  }
}

test('后端启动失败后再次确保就绪会重新选择端口', async () => {
  const backendModule = await import('../src/backend-controller.ts');

  const usedPorts: number[] = [];
  const controller = backendModule.createBackendController({
    buildApiBaseUrl(port: number) {
      return `http://127.0.0.1:${port}/api/v1`;
    },
    buildAppUrl(port: number) {
      return `http://127.0.0.1:${port}`;
    },
    async findAvailablePort() {
      return usedPorts.length === 0 ? 41001 : 41002;
    },
    spawnBackend(port: number) {
      usedPorts.push(port);
      return new FakeBackendProcess();
    },
    async waitForBackendReady(_port: number, _proc: unknown) {
      if (usedPorts.length === 1) {
        throw new Error('后端健康检查超时：健康检查请求超时');
      }
    },
    wireBackendLogs() {},
  });

  await assert.rejects(controller.ensureReady(), /后端健康检查超时：健康检查请求超时/);
  await controller.ensureReady();

  assert.deepEqual(usedPorts, [41001, 41002]);
});

test('后端在启动成功后异常退出时会触发可感知事件并保留端口', async () => {
  const backendModule = await import('../src/backend-controller.ts');

  const proc = new FakeBackendProcess();
  let crashMessage: string | null = null;

  const controller = backendModule.createBackendController({
    buildApiBaseUrl(port: number) {
      return `http://127.0.0.1:${port}/api/v1`;
    },
    buildAppUrl(port: number) {
      return `http://127.0.0.1:${port}`;
    },
    async findAvailablePort() {
      return 41003;
    },
    spawnBackend(_port: number) {
      return proc;
    },
    async waitForBackendReady() {},
    wireBackendLogs() {},
  });

  controller.onUnexpectedExit((message: string) => {
    crashMessage = message;
  });

  const ready = await controller.ensureReady();
  assert.equal(ready.port, 41003);

  proc.exitCode = 1;
  proc.emit('exit', 1, null);

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(crashMessage?.includes('本地服务已退出'));
  assert.equal(controller.getPort(), 41003);
});

test('后端在启动完成前触发 error 事件时会重置端口并允许重试', async () => {
  const backendModule = await import('../src/backend-controller.ts');

  const usedPorts: number[] = [];
  let proc: FakeBackendProcess | null = null;

  const controller = backendModule.createBackendController({
    buildApiBaseUrl(port: number) {
      return `http://127.0.0.1:${port}/api/v1`;
    },
    buildAppUrl(port: number) {
      return `http://127.0.0.1:${port}`;
    },
    async findAvailablePort() {
      return usedPorts.length === 0 ? 41004 : 41005;
    },
    spawnBackend(port: number) {
      usedPorts.push(port);
      proc = new FakeBackendProcess();
      return proc;
    },
    async waitForBackendReady() {
      await new Promise((resolve) => setTimeout(resolve, 20));
    },
    wireBackendLogs() {},
  });

  const pendingReady = controller.ensureReady();
  await new Promise((resolve) => setTimeout(resolve, 0));
  proc?.emit('error', new Error('spawn EACCES'));

  await assert.rejects(pendingReady, /spawn EACCES/);
  await controller.ensureReady();

  assert.deepEqual(usedPorts, [41004, 41005]);
});

test('退出链路：SIGTERM 无响应时宽限期后升级 SIGKILL', async () => {
  const backendModule = await import('../src/backend-controller.ts');

  class StubbornProcess extends EventEmitter {
    exitCode: number | null = null;
    killed = false;
    stdout = new FakeStream();
    stderr = new FakeStream();
    signals: Array<NodeJS.Signals | number | undefined> = [];

    kill(signal?: NodeJS.Signals | number) {
      this.signals.push(signal);
      // SIGTERM 被忽略（模拟 PyInstaller 吞信号）；SIGKILL 才真正退出
      if (signal === 'SIGKILL') {
        queueMicrotask(() => {
          this.emit('exit', null, 'SIGKILL');
        });
      }
    }
  }

  const stubborn = new StubbornProcess();
  const controller = backendModule.createBackendController({
    buildApiBaseUrl: (port: number) => `http://127.0.0.1:${port}/api/v1`,
    buildAppUrl: (port: number) => `http://127.0.0.1:${port}`,
    findAvailablePort: async () => 41010,
    spawnBackend: () => stubborn,
    waitForBackendReady: async () => undefined,
    wireBackendLogs() {},
  });

  await controller.ensureReady();

  const startedAt = Date.now();
  // graceMs 用 30ms：验证升级逻辑而不拖慢测试
  await controller.stopAndWaitForExit(30);
  const elapsed = Date.now() - startedAt;

  assert.deepEqual(stubborn.signals, [undefined, 'SIGKILL']);
  assert.ok(elapsed >= 25, '应至少等待宽限期后才升级 SIGKILL');
});

test('退出链路：后端正常响应 SIGTERM 时不发 SIGKILL', async () => {
  const backendModule = await import('../src/backend-controller.ts');

  const cooperative = new FakeBackendProcess();
  const controller = backendModule.createBackendController({
    buildApiBaseUrl: (port: number) => `http://127.0.0.1:${port}/api/v1`,
    buildAppUrl: (port: number) => `http://127.0.0.1:${port}`,
    findAvailablePort: async () => 41011,
    spawnBackend: () => cooperative,
    waitForBackendReady: async () => undefined,
    wireBackendLogs() {},
  });

  await controller.ensureReady();

  const startedAt = Date.now();
  await controller.stopAndWaitForExit(4_000);
  const elapsed = Date.now() - startedAt;

  assert.equal(cooperative.killed, true);
  assert.ok(elapsed < 1_000, `正常退出应立即返回，实际耗时 ${elapsed}ms`);
  // 端口保留（resetPort=false 语义）：退出链路不需要重新分配端口
  assert.equal(controller.getPort(), 41011);
});

test('退出链路：后端从未成功启动（spawn error）时空等宽限期为 0', async () => {
  const backendModule = await import('../src/backend-controller.ts');

  const spawnFailed = new FakeBackendProcess();
  const controller = backendModule.createBackendController({
    buildApiBaseUrl: (port: number) => `http://127.0.0.1:${port}/api/v1`,
    buildAppUrl: (port: number) => `http://127.0.0.1:${port}`,
    findAvailablePort: async () => 41012,
    spawnBackend: () => spawnFailed,
    async waitForBackendReady() {
      // 模拟 spawn 失败：先触发 error 事件再让健康检查失败
      spawnFailed.emit('error', new Error('spawn ENOENT'));
      throw new Error('后端健康检查超时：进程已退出');
    },
    wireBackendLogs() {},
  });

  await assert.rejects(controller.ensureReady());

  const startedAt = Date.now();
  await controller.stopAndWaitForExit(4_000);
  const elapsed = Date.now() - startedAt;

  assert.ok(elapsed < 500, `进程从未启动时不应空等宽限期，实际耗时 ${elapsed}ms`);
});
