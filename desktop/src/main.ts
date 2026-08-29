import { app, BrowserWindow, ipcMain, powerMonitor, screen, session, shell } from 'electron';
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildApiBaseUrl,
  buildAppUrl,
  buildBackendEnvironment,
  buildDesktopPaths,
} from './config.js';
import { createBackendController, type BackendProcess } from './backend-controller.js';
import { createBootstrapController } from './bootstrap-controller.js';
import { resolvePythonExecutable } from './python-executable.js';
import { createErrorPage, createLoadingPage } from './startup-page.js';
import { buildMainWindowWebPreferences } from './window-options.js';
import {
  getWindowStatePath,
  isBoundsVisibleOnDisplays,
  loadWindowBounds,
  saveWindowBounds,
} from './window-state.js';
import {
  probeBackendHealth,
  waitForBackendReadyWithHealthCheck,
} from './backend-health.js';
import {
  UPDATE_IPC_CHANNELS,
  createUpdateController,
} from './update-controller.js';
import { createFileLogger, type FileLogger } from './file-logger.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, '..', '..');
// 冷启动慢盘场景下 PyInstaller 解压 + Python import 可能 >15s；放宽到 45s 减少误判。
const BACKEND_READY_TIMEOUT_MS = 45_000;
const BACKEND_READY_POLL_INTERVAL_MS = 150;
const BACKEND_HEALTH_REQUEST_TIMEOUT_MS = 1_500;
// before-quit 阶段 SIGTERM 后再等的宽限期，超过则强制 SIGKILL 兜底，防止 PyInstaller 二进制忽略信号变僵尸。
const BACKEND_KILL_GRACE_MS = 4_000;
// macOS sleep/wake 后调健康检查，失败则重启 sidecar；30s 节流避免一次唤醒触发多次重启。
const SLEEP_WAKE_RESTART_THROTTLE_MS = 30_000;
let lastSleepWakeRestartAt = 0;

let mainWindow: BrowserWindow | null = null;
let windowPort: number | null = null;
let resolvedAppUrl: string | null = null;
// 主进程进程级 file logger：app.whenReady 之后才允许 app.getPath('logs')，
// 因此 ready 之前为 null；console-message handler 在判空后写入。
let fileLogger: FileLogger | null = null;

// 进程级一次性 API token：每次 Electron 主进程启动时随机生成，注入 sidecar env，
// 同时通过 IPC handler `hbs:get-runtime-token` 异步提供给 preload，使 renderer 在每次
// 调用 backend 时携带 X-HBS-Token 头；token 不进 process.argv，避免被 ps -ef 旁路。
const apiToken = randomBytes(32).toString('hex');
const updateController = createUpdateController({
  appVersion: app.getVersion(),
  arch: process.arch === 'arm64' ? 'arm64' : 'x64',
  isPackaged: app.isPackaged,
  userDataDir: app.getPath('userData'),
  onRequestQuit: () => {
    app.quit();
  },
});

function createPageUrl(content: string): string {
  return `data:text/html;charset=UTF-8,${encodeURIComponent(content)}`;
}

async function findAvailablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('无法分配本地端口'));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(address.port);
      });
    });
  });
}

function isCommandAvailable(command: string): boolean {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return !result.error;
}

function resolveDesktopPaths() {
  return buildDesktopPaths({
    userDataDir: app.getPath('userData'),
    projectRoot,
    resourcesPath: process.resourcesPath,
    isPackaged: app.isPackaged,
    platform: process.platform,
  });
}

function ensureFrontendEntryExists(frontendEntryUrl: string): void {
  if (!existsSync(fileURLToPath(frontendEntryUrl))) {
    throw new Error(`缺少前端入口文件: ${frontendEntryUrl}`);
  }
}

function spawnBackend(port: number): ChildProcessWithoutNullStreams {
  const desktopPaths = resolveDesktopPaths();
  mkdirSync(desktopPaths.storageDir, { recursive: true });

  const env = {
    ...process.env,
    ...buildBackendEnvironment({
      port,
      storageDir: desktopPaths.storageDir,
      databaseUrl: desktopPaths.databaseUrl,
      // 让 backend 通过 HBS_FRONTEND_DIST_DIR serve 前端，避免 file:// → http://127.0.0.1
      // 跨 origin 触发的 CORS 预检失败（带 X-HBS-Token + JSON Content-Type 必预检，
      // 而桌面同源场景 CORSMiddleware 不挂载，预检永远拿不到 Access-Control-Allow-*）。
      frontendDistDir: desktopPaths.frontendDistDir,
      apiToken,
      requireAuth: true,
    }),
  };

  if (app.isPackaged) {
    if (!existsSync(desktopPaths.backendEntry)) {
      throw new Error(`缺少打包后的后端可执行文件: ${desktopPaths.backendEntry}`);
    }
    if (!existsSync(desktopPaths.frontendDistDir)) {
      throw new Error(`缺少前端构建产物目录: ${desktopPaths.frontendDistDir}`);
    }
    ensureFrontendEntryExists(desktopPaths.frontendEntryUrl);

    return spawn(desktopPaths.backendEntry, [], {
      env,
      stdio: 'pipe',
    });
  }

  const python = resolvePythonExecutable({
    projectRoot,
    platform: process.platform,
    existsSync,
    isCommandAvailable,
  });
  return spawn(python, [desktopPaths.backendEntry], {
    cwd: projectRoot,
    env,
    stdio: 'pipe',
  });
}

function wireBackendLogs(processRef: BackendProcess): void {
  processRef.stdout?.on('data', (chunk) => {
    process.stdout.write(`[hbs-backend] ${chunk}`);
  });
  processRef.stderr?.on('data', (chunk) => {
    process.stderr.write(`[hbs-backend] ${chunk}`);
  });
}

async function waitForBackendReady(
  port: number,
  processRef: BackendProcess
): Promise<void> {
  const healthUrl = `${buildAppUrl(port)}/health`;
  const attempts = Math.ceil(
    BACKEND_READY_TIMEOUT_MS / BACKEND_READY_POLL_INTERVAL_MS
  );

  await waitForBackendReadyWithHealthCheck({
    healthUrl,
    attempts,
    pollIntervalMs: BACKEND_READY_POLL_INTERVAL_MS,
    requestTimeoutMs: BACKEND_HEALTH_REQUEST_TIMEOUT_MS,
    isProcessExited: () => processRef.exitCode !== null,
    getExitCode: () => processRef.exitCode,
  });
}

function buildWindowArguments(): string[] {
  const port = backendController.getPort();
  if (port === null) {
    return [];
  }

  return [`--hbs-api-base-url=${buildApiBaseUrl(port)}`];
}

function isWindowAvailable(window: BrowserWindow | null): window is BrowserWindow {
  return window !== null && !window.isDestroyed();
}

function broadcastUpdateState(): void {
  if (!isWindowAvailable(mainWindow)) {
    return;
  }

  mainWindow.webContents.send(
    UPDATE_IPC_CHANNELS.changed,
    updateController.getState()
  );
}

function focusWindow(window: BrowserWindow): void {
  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.focus();
}

function showWindowError(window: BrowserWindow, message: string): void {
  process.stderr.write(`[hbs-window] ${message}\n`);
  window
    .loadURL(createPageUrl(createErrorPage(message)))
    .catch(() => undefined);
}

/**
 * 拦截一切试图离开本应用边界的导航 / 新窗口请求。
 *
 * - `will-navigate`：拒绝渲染端尝试导航到非 file:// 或非 127.0.0.1 sidecar 的 URL；外链一律 `shell.openExternal`
 * - `setWindowOpenHandler`：拒绝任何 window.open / target=_blank，直接 deny + 通过系统浏览器打开白名单 URL
 * - `web-contents-created`：上面两条对将来创建的任何 webContents 同样生效
 */
function wireNavigationGuards(): void {
  const isInternalUrl = (url: string): boolean => {
    if (url.startsWith('file://')) return true;
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
      );
    } catch {
      return false;
    }
  };

  const isExternalHttpUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isInternalUrl(url)) {
        event.preventDefault();
        if (isExternalHttpUrl(url)) {
          void shell.openExternal(url);
        }
      }
    });

    contents.setWindowOpenHandler(({ url }) => {
      if (isExternalHttpUrl(url)) {
        void shell.openExternal(url);
      }
      return { action: 'deny' };
    });
  });
}

/**
 * 在默认 session 上注入 Content-Security-Policy 头：
 * - default-src 'self'：只允许同源（file:// 在 Electron 下被视为 'self'）
 * - connect-src 同源 + http://127.0.0.1:* 用于 sidecar 调用
 * - img-src 'self' data:（图标 / 内嵌 base64）
 * - 拒绝 eval / inline script（'unsafe-inline' 仅留给 style，因 React 内联样式）
 */
function wireContentSecurityPolicy(): void {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "connect-src 'self' http://127.0.0.1:* http://localhost:*",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...(details.responseHeaders ?? {}) };
    responseHeaders['Content-Security-Policy'] = [csp];
    callback({ responseHeaders });
  });
}

function wireWindowDiagnostics(window: BrowserWindow): void {
  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) {
        return;
      }

      const failedUrl = validatedURL || '未知地址';
      showWindowError(
        window,
        `桌面界面加载失败（${errorCode}）：${errorDescription || '未知错误'}\n${failedUrl}`
      );
    }
  );

  window.webContents.on('render-process-gone', (_event, details) => {
    showWindowError(window, `桌面界面渲染进程已退出：${details.reason}`);
  });

  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    // Electron level：0=verbose, 1=info, 2=warning, 3=error。
    // 打包态只转发 warning/error，避免 renderer 大量 info/debug 噪声把日志撑爆；
    // 开发态依旧全转，方便调试。
    if (app.isPackaged && level < 2) {
      return;
    }
    const channel = level >= 2 ? 'stderr' : 'stdout';
    const prefix = `[hbs-renderer] ${sourceId || 'unknown'}:${line} ${message}\n`;
    if (channel === 'stderr') {
      process.stderr.write(prefix);
    } else {
      process.stdout.write(prefix);
    }
    // 同时落到磁盘 main.log（行缓冲 1s flush），仅在 logger 已初始化后写
    fileLogger?.write(prefix);
  });
}

function ensureMainWindow(): BrowserWindow {
  const currentPort = backendController.getPort();
  if (isWindowAvailable(mainWindow) && windowPort === currentPort) {
    return mainWindow;
  }

  if (isWindowAvailable(mainWindow) && windowPort !== currentPort) {
    // Port changed (e.g. retry after failed startup). Recreate window to refresh runtime args.
    mainWindow.destroy();
    mainWindow = null;
    windowPort = null;
  }

  // 还原上次关闭时的窗口位置/大小；外接屏拔掉、分辨率变化等情况下若 bounds
  // 落到所有 display 之外，回退到默认 1440x960 居中。
  const windowStatePath = getWindowStatePath(app.getPath('userData'));
  const savedBounds = loadWindowBounds(windowStatePath);
  const displays = screen
    .getAllDisplays()
    .map((display) => display.workArea);
  const restoredBounds =
    savedBounds && isBoundsVisibleOnDisplays(savedBounds, displays)
      ? savedBounds
      : null;

  const window = new BrowserWindow({
    ...(restoredBounds
      ? {
          x: restoredBounds.x,
          y: restoredBounds.y,
          width: restoredBounds.width,
          height: restoredBounds.height,
        }
      : { width: 1440, height: 960 }),
    minWidth: 1200,
    minHeight: 760,
    autoHideMenuBar: true,
    title: '家庭资产负债表',
    // show:false + ready-to-show 消除首启白闪：原 backgroundColor:#ffffff 在 loadURL 之前
    // 会用 Electron 默认白底渲染 200-500ms 才切换到 loading 页；改为窗口先隐藏，
    // backgroundColor 匹配 loading 渐变首帧色（startup-page.ts --bg-top），
    // ready-to-show 后再 show()，渲染过程对用户完全不可见。
    // paintWhenInitiallyHidden:true 保证隐藏期间仍走完渲染管线，ready-to-show 能可靠触发。
    show: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#f4efe5',
    webPreferences: buildMainWindowWebPreferences(
      currentDir,
      buildWindowArguments()
    ),
  });

  window.once('ready-to-show', () => {
    window.show();
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const isReload = (input.meta || input.control) && input.key.toLowerCase() === 'r';
    if (isReload || input.key === 'F5') {
      event.preventDefault();
      if (resolvedAppUrl) {
        window.webContents.loadURL(resolvedAppUrl);
      }
    }
  });
  // 窗口关闭前把当前 bounds 持久化，下次启动还原；最小化 / 全屏状态下 getBounds
  // 仍能返回普通窗体的最近一次位置，符合用户期望。
  window.on('close', () => {
    if (!window.isDestroyed()) {
      saveWindowBounds(windowStatePath, window.getBounds());
    }
  });
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
      windowPort = null;
    }
  });
  wireWindowDiagnostics(window);

  mainWindow = window;
  windowPort = currentPort ?? null;
  return window;
}

const backendController = createBackendController({
  buildApiBaseUrl,
  buildAppUrl,
  findAvailablePort,
  spawnBackend,
  waitForBackendReady,
  wireBackendLogs,
});

backendController.onUnexpectedExit((message) => {
  if (!isWindowAvailable(mainWindow)) {
    return;
  }

  mainWindow
    .loadURL(createPageUrl(createErrorPage(message)))
    .catch(() => undefined);
});

const bootstrapController = createBootstrapController({
  prepare: async () => {
    await backendController.preparePort();
  },
  ensureWindow() {
    const window = ensureMainWindow();

    return {
      showLoading: async () => {
        await window.loadURL(createPageUrl(createLoadingPage()));
      },
      showApp: async (url: string) => {
        resolvedAppUrl = url;
        await window.loadURL(url);
      },
      showError: async (message: string) => {
        await window.loadURL(createPageUrl(createErrorPage(message)));
      },
      focus: () => {
        focusWindow(window);
      },
      // 把 bootstrap stage 推送到 loading 页里的 window.setStartupStage(title, body)。
      // 页面可能尚未渲染完成（executeJavaScript 会 reject），全部安静吞掉，
      // 不影响主 bootstrap 流程。
      setStartupStage: async (title: string, body: string) => {
        const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        await window.webContents
          .executeJavaScript(
            `typeof window.setStartupStage === "function" && window.setStartupStage("${escape(title)}", "${escape(body)}")`,
            true
          )
          .catch(() => undefined);
      },
    };
  },
  startBackend: async () => {
    await backendController.ensureReady();
    const desktopPaths = resolveDesktopPaths();
    // 仍然校验前端构建产物存在：让后端 serve 前端（同源）后，dist 缺失从启动时就报错，
    // 而不是等用户跳到某个路由才看到 404。
    ensureFrontendEntryExists(desktopPaths.frontendEntryUrl);
    const currentPort = backendController.getPort();
    if (currentPort === null) {
      throw new Error('后端端口尚未分配，无法构造前端入口 URL');
    }
    // 改走 http://127.0.0.1:<port>/ 让前端与后端同源，消除 file:// 跨 origin 引发的
    // CORS 预检失败。前端的 HashRouter 不依赖 server-side rewrite，仍能正常工作。
    return { appUrl: `${buildAppUrl(currentPort)}/` };
  },
});

function bootstrap(): Promise<void> {
  return bootstrapController.bootstrap();
}

/**
 * macOS 休眠唤醒后探一次 backend /health；不 ready 才走 stopAndResetPort + bootstrap。
 * 30s 内重复 resume 事件只重启一次，避免合上盖子开几秒又合上反复触发。
 * 仅 darwin 启用：Windows / Linux 的 sleep/resume 语义差异较大，本任务范围只覆盖 macOS。
 */
async function probeAndRestartBackendOnResume(): Promise<void> {
  const currentPort = backendController.getPort();
  if (currentPort === null) {
    return;
  }

  const result = await probeBackendHealth({
    healthUrl: `${buildAppUrl(currentPort)}/health`,
    requestTimeoutMs: BACKEND_HEALTH_REQUEST_TIMEOUT_MS,
  });

  if (result.kind === 'ready') {
    return;
  }

  const now = Date.now();
  if (now - lastSleepWakeRestartAt < SLEEP_WAKE_RESTART_THROTTLE_MS) {
    return;
  }
  lastSleepWakeRestartAt = now;

  process.stderr.write(
    `[hbs-power-monitor] backend probe after resume failed (${result.kind})，restarting sidecar\n`
  );
  backendController.stopAndResetPort();
  try {
    await bootstrap();
  } catch (error) {
    process.stderr.write(
      `[hbs-power-monitor] restart failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
  }
}

function wirePowerMonitor(): void {
  if (process.platform !== 'darwin') {
    return;
  }
  powerMonitor.on('resume', () => {
    void probeAndRestartBackendOnResume();
  });
}

ipcMain.handle('hbs:retry-bootstrap', async () => {
  backendController.stopAndResetPort();
  await bootstrap();
});
ipcMain.handle('hbs:open-logs-dir', async () => {
  // 错误页 / future 设置面板可一键拉起系统文件管理器到 log 目录，
  // 方便用户把 main.log + backend log 提交给开发者排查。
  await shell.openPath(app.getPath('logs'));
});
ipcMain.handle('hbs:get-runtime-token', () => apiToken);
ipcMain.handle(UPDATE_IPC_CHANNELS.getState, async () => updateController.getState());
ipcMain.handle(UPDATE_IPC_CHANNELS.check, async () =>
  updateController.checkForUpdates({ manual: true })
);
ipcMain.handle(UPDATE_IPC_CHANNELS.download, async () => updateController.downloadUpdate());
ipcMain.handle(UPDATE_IPC_CHANNELS.install, async () => updateController.installUpdate());

updateController.subscribe(() => {
  broadcastUpdateState();
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    // app.getPath('logs') 只有在 ready 之后才可调用，在这里初始化 file logger，
    // 让随后的 wireWindowDiagnostics console-message 转发能落盘。
    try {
      fileLogger = createFileLogger({ logsDir: app.getPath('logs') });
    } catch (error) {
      process.stderr.write(
        `[hbs-file-logger] init failed: ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
    wireNavigationGuards();
    wireContentSecurityPolicy();
    wirePowerMonitor();
    const updateStartup = updateController.start().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[hbs-update] ${message}\n`);
    });
    await bootstrap();
    await updateStartup;
  });

  app.on('second-instance', async () => {
    if (!mainWindow) {
      await bootstrap();
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });
}

app.on('activate', async () => {
  if (isWindowAvailable(mainWindow)) {
    focusWindow(mainWindow);
    return;
  }

  await bootstrap();
});

// before-quit 只拦截一次：后端真正退出后置 true，app.exit(0) 重入时直接放行。
let backendShutdownComplete = false;

app.on('before-quit', (event) => {
  updateController.stop();
  if (backendShutdownComplete) {
    return;
  }
  // stopAndResetPort 的 SIGKILL 兜底是 unref 定时器，事件循环随退出销毁后
  // 永远不会执行（PyInstaller 二进制忽略 SIGTERM 即成僵尸 sidecar，还占着
  // 同一个 app.db）。拦截本次退出，异步等后端真的退出（SIGTERM → 宽限期 →
  // SIGKILL）后再放行。
  event.preventDefault();
  void (async () => {
    await backendController.stopAndWaitForExit(BACKEND_KILL_GRACE_MS);
    backendShutdownComplete = true;
    // 把残余缓冲 flush + end stream；fire-and-forget，不阻塞退出。
    void fileLogger?.close();
    app.exit(0);
  })();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
