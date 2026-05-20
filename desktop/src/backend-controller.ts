export type BackendStartupResult = {
  port: number;
  appUrl: string;
  apiBaseUrl: string;
};

export type BackendProcess = {
  exitCode: number | null;
  killed?: boolean;
  /** 兼容 Node ChildProcess.kill；不传 signal 即默认 SIGTERM。 */
  kill: (signal?: NodeJS.Signals | number) => void;
  stdout?: {
    on: (event: 'data', listener: (chunk: unknown) => void) => void;
  };
  stderr?: {
    on: (event: 'data', listener: (chunk: unknown) => void) => void;
  };
  on: {
    (event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
    (event: 'error', listener: (error: Error) => void): void;
  };
};

/** before-quit 阶段 SIGTERM 后等待优雅退出的最长时间，超时即升级到 SIGKILL。 */
export const BACKEND_FORCE_KILL_GRACE_MS = 4_000;

export type BackendControllerDependencies = {
  buildApiBaseUrl: (port: number) => string;
  buildAppUrl: (port: number) => string;
  findAvailablePort: () => Promise<number>;
  spawnBackend: (port: number) => BackendProcess;
  waitForBackendReady: (port: number, proc: BackendProcess) => Promise<void>;
  wireBackendLogs: (proc: BackendProcess) => void;
};

type UnexpectedExitHandler = (message: string) => void;

function formatExitMessage(code: number | null, signal: NodeJS.Signals | null): string {
  const suffix = signal ? `signal=${signal}` : `code=${code ?? 'unknown'}`;
  return `本地服务已退出（${suffix}）。你可以先尝试重试启动，必要时退出应用后重新打开。`;
}

function formatProcessErrorMessage(error: Error): string {
  return `本地服务异常中断（${error.message || '未知错误'}）。你可以先尝试重试启动，必要时退出应用后重新打开。`;
}

export function createBackendController(deps: BackendControllerDependencies) {
  let port: number | null = null;
  let processRef: BackendProcess | null = null;
  let readyPromise: Promise<void> | null = null;
  let unexpectedExitHandler: UnexpectedExitHandler | null = null;
  let hasBeenReady = false;

  async function preparePort(): Promise<number> {
    if (port === null) {
      port = await deps.findAvailablePort();
    }
    return port;
  }

  function clearState({ resetPort }: { resetPort: boolean }) {
    processRef = null;
    readyPromise = null;
    hasBeenReady = false;
    if (resetPort) {
      port = null;
    }
  }

  function stop({ resetPort }: { resetPort: boolean }) {
    if (!processRef) {
      clearState({ resetPort });
      return;
    }

    if (processRef.killed || processRef.exitCode !== null) {
      clearState({ resetPort });
      return;
    }

    const target = processRef;
    try {
      target.kill();
      // SIGTERM 后启动 SIGKILL fallback：PyInstaller 二进制如果忽略 SIGTERM 不会变僵尸进程。
      // 不阻塞 stop()，定时器会被忽略如果进程已退出（kill -9 在已退出 pid 上为 no-op）。
      setTimeout(() => {
        try {
          if (!target.killed && target.exitCode === null) {
            target.kill('SIGKILL');
          }
        } catch {
          // 进程可能已经退出/被回收，忽略
        }
      }, BACKEND_FORCE_KILL_GRACE_MS).unref();
    } finally {
      clearState({ resetPort });
    }
  }

  function onUnexpectedExit(handler: UnexpectedExitHandler) {
    unexpectedExitHandler = handler;
  }

  function getPort(): number | null {
    return port;
  }

  async function ensureReady(): Promise<BackendStartupResult> {
    const ensuredPort = await preparePort();

    if (processRef && processRef.exitCode !== null) {
      clearState({ resetPort: false });
    }

    if (!processRef) {
      try {
        processRef = deps.spawnBackend(ensuredPort);
      } catch (error) {
        clearState({ resetPort: true });
        throw error;
      }

      const currentProcess = processRef;
      deps.wireBackendLogs(currentProcess);
      let unexpectedExitHandled = false;
      let startupSettled = false;
      let rejectStartup: (error: unknown) => void = () => undefined;

      currentProcess.on('exit', (code, signal) => {
        // 启动期就 exit：通过 rejectStartup 立刻报错，避免 waitForBackendReady 轮询到超时
        // 才返回笼统的 "backend never ready"，让用户看到真正的退出原因。
        if (!hasBeenReady) {
          rejectStartup(new Error(formatExitMessage(code, signal)));
          return;
        }
        if (unexpectedExitHandled) {
          return;
        }
        unexpectedExitHandled = true;

        const message = formatExitMessage(code, signal);
        unexpectedExitHandler?.(message);
        // Keep port stable so the existing window runtime config remains valid.
        clearState({ resetPort: false });
      });

      currentProcess.on('error', (error) => {
        if (hasBeenReady) {
          if (unexpectedExitHandled) {
            return;
          }
          unexpectedExitHandled = true;
          unexpectedExitHandler?.(formatProcessErrorMessage(error));
          clearState({ resetPort: false });
          return;
        }

        rejectStartup(error);
      });

      readyPromise = new Promise<void>((resolve, reject) => {
        rejectStartup = (error: unknown) => {
          if (startupSettled) {
            return;
          }
          startupSettled = true;
          stop({ resetPort: true });
          reject(error instanceof Error ? error : new Error(String(error)));
        };

        void deps
          .waitForBackendReady(ensuredPort, currentProcess)
          .then(() => {
            if (startupSettled) {
              return;
            }
            startupSettled = true;
            hasBeenReady = true;
            resolve();
          })
          .catch((error) => {
            rejectStartup(error);
          });
      })
        .finally(() => {
          readyPromise = null;
        });
    }

    if (readyPromise) {
      await readyPromise;
    }

    return {
      port: ensuredPort,
      appUrl: deps.buildAppUrl(ensuredPort),
      apiBaseUrl: deps.buildApiBaseUrl(ensuredPort),
    };
  }

  return {
    preparePort,
    ensureReady,
    stop: () => stop({ resetPort: false }),
    stopAndResetPort: () => stop({ resetPort: true }),
    onUnexpectedExit,
    getPort,
  };
}
