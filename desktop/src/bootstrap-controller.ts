export interface BootstrapWindow {
  showLoading: () => Promise<void>;
  showApp: (url: string) => Promise<void>;
  showError: (message: string) => Promise<void>;
  focus: () => void;
  /**
   * 可选：把真实启动阶段推送到 loading 页（如果已渲染）。
   * 实现方应捕获 webContents 错误（页面可能尚未准备好）并安静吞掉，
   * 不影响主流程。
   */
  setStartupStage?: (title: string, body: string) => Promise<void>;
}

interface BackendStartupResult {
  appUrl: string;
}

interface BootstrapControllerDependencies {
  prepare?: () => Promise<void>;
  ensureWindow: () => BootstrapWindow;
  startBackend: () => Promise<BackendStartupResult>;
  showErrorDialog?: (message: string) => void;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

export function createBootstrapController(
  dependencies: BootstrapControllerDependencies
) {
  let bootstrapPromise: Promise<void> | null = null;

  async function runBootstrap(): Promise<void> {
    let window: BootstrapWindow | null = null;
    let loadingPromise: Promise<void> | null = null;
    try {
      // 并行启动 prepare 与 window 构造：prepare 是异步 I/O（findAvailablePort 5-15ms），
      // ensureWindow 是同步阻塞构造 BrowserWindow（80-150ms）。先发起 prepare 让其 I/O
      // 在后台跑，紧接着同步构造窗口；窗口阻塞 JS 期间 libuv 仍能推进 prepare 的 I/O，
      // 之后再 await preparePromise 通常已 resolve。spawnBackend 仍在 prepare resolve
      // 后才发起（依赖 port）。
      const preparePromise = dependencies.prepare?.();

      window = dependencies.ensureWindow();
      loadingPromise = window.showLoading();
      window.focus();

      if (preparePromise) {
        await preparePromise;
      }
      const backendPromise = dependencies.startBackend();

      await loadingPromise;
      // loading 页已渲染：推第一阶段真实文案（替换 fake 轮播第一帧），
      // 让用户知道目前正在等的是「后端服务就绪」
      await window
        .setStartupStage?.(
          '正在等待本地服务就绪',
          '本地后端进程已启动，正在等待健康检查通过。首次启动通常需要 2-5 秒。'
        )
        .catch(() => undefined);
      const { appUrl } = await backendPromise;
      // 后端 ready，进入「载入应用」阶段
      await window
        .setStartupStage?.(
          '正在加载主界面',
          '本地服务已就绪，前端资源最后接好就会切换到工作台。'
        )
        .catch(() => undefined);
      await window.showApp(appUrl);
    } catch (error) {
      const message = getErrorMessage(error);
      dependencies.showErrorDialog?.(message);
      const errorWindow = window ?? dependencies.ensureWindow();
      if (!window) {
        errorWindow.focus();
      }
      await loadingPromise?.catch(() => undefined);
      await errorWindow.showError(message);
    }
  }

  return {
    bootstrap(): Promise<void> {
      if (!bootstrapPromise) {
        bootstrapPromise = runBootstrap().finally(() => {
          bootstrapPromise = null;
        });
      }

      return bootstrapPromise;
    },
  };
}
