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
      // 必须先完成 prepare 再创建窗口：BrowserWindow 在 main.ts 里通过
      // additionalArguments 注入 `--hbs-api-base-url=http://127.0.0.1:<port>/api/v1`，
      // 这一步在窗口构造时同步求值。如果在 prepare（异步分配端口）resolve 之前就同步
      // 调 ensureWindow，preload 拿到的会是空 argv，apiBaseUrl 永远是 undefined。
      // findAvailablePort 跨 tick 的 libuv I/O 决定了\"先 fire prepare 再同步建窗口\"
      // 不可能让窗口拿到端口，原本注释里写的并行优化不成立。
      await dependencies.prepare?.();

      window = dependencies.ensureWindow();
      loadingPromise = window.showLoading();
      window.focus();

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
      // 先确保有窗口再弹错误对话框：prepare 阶段失败时 window 仍是 null，必须先建一个
      // BrowserWindow 让 showErrorDialog 有合适的 parent，避免无主对话框抢焦点。
      const errorWindow = window ?? dependencies.ensureWindow();
      if (!window) {
        errorWindow.focus();
      }
      dependencies.showErrorDialog?.(message);
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
