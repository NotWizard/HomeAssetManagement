import { app, BrowserWindow, ipcMain } from 'electron';
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
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
  probeBackendHealth,
  waitForBackendReadyWithHealthCheck,
} from './backend-health.js';
import {
  UPDATE_IPC_CHANNELS,
  createUpdateController,
} from './update-controller.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, '..', '..');
const BACKEND_READY_TIMEOUT_MS = 15_000;
const BACKEND_READY_POLL_INTERVAL_MS = 150;
const BACKEND_HEALTH_REQUEST_TIMEOUT_MS = 1_500;

let mainWindow: BrowserWindow | null = null;
let windowPort: number | null = null;
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
    const channel = level >= 2 ? 'stderr' : 'stdout';
    const prefix = `[hbs-renderer] ${sourceId || 'unknown'}:${line} ${message}\n`;
    if (channel === 'stderr') {
      process.stderr.write(prefix);
      return;
    }
    process.stdout.write(prefix);
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

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    autoHideMenuBar: true,
    title: '家庭资产负债表',
    backgroundColor: '#ffffff',
    webPreferences: buildMainWindowWebPreferences(
      currentDir,
      buildWindowArguments()
    ),
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
        await window.loadURL(url);
      },
      showError: async (message: string) => {
        await window.loadURL(createPageUrl(createErrorPage(message)));
      },
      focus: () => {
        focusWindow(window);
      },
    };
  },
  startBackend: async () => {
    await backendController.ensureReady();
    const desktopPaths = resolveDesktopPaths();
    ensureFrontendEntryExists(desktopPaths.frontendEntryUrl);
    return { appUrl: desktopPaths.frontendEntryUrl };
  },
});

function bootstrap(): Promise<void> {
  return bootstrapController.bootstrap();
}

ipcMain.handle('hbs:retry-bootstrap', async () => {
  backendController.stopAndResetPort();
  await bootstrap();
});
ipcMain.handle(UPDATE_IPC_CHANNELS.getState, async () => updateController.getState());
ipcMain.handle(UPDATE_IPC_CHANNELS.check, async () => updateController.checkForUpdates());
ipcMain.handle(UPDATE_IPC_CHANNELS.download, async () => updateController.downloadUpdate());
ipcMain.handle(UPDATE_IPC_CHANNELS.install, async () => updateController.installUpdate());

updateController.subscribe(() => {
  broadcastUpdateState();
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
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

app.on('before-quit', () => {
  updateController.stop();
  backendController.stopAndResetPort();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
