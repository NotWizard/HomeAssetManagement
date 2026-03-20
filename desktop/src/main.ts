import { app, BrowserWindow, ipcMain } from 'electron';
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
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

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, '..', '..');
const BACKEND_READY_TIMEOUT_MS = 15_000;
const BACKEND_READY_POLL_INTERVAL_MS = 150;

let mainWindow: BrowserWindow | null = null;
let windowPort: number | null = null;

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

function spawnBackend(port: number): ChildProcessWithoutNullStreams {
  const desktopPaths = resolveDesktopPaths();
  mkdirSync(desktopPaths.storageDir, { recursive: true });

  const env = {
    ...process.env,
    ...buildBackendEnvironment({
      port,
      storageDir: desktopPaths.storageDir,
      databaseUrl: desktopPaths.databaseUrl,
      frontendDistDir: desktopPaths.frontendDistDir,
    }),
  };

  if (app.isPackaged) {
    if (!existsSync(desktopPaths.backendEntry)) {
      throw new Error(`缺少打包后的后端可执行文件: ${desktopPaths.backendEntry}`);
    }
    if (!existsSync(desktopPaths.frontendDistDir)) {
      throw new Error(`缺少前端构建产物目录: ${desktopPaths.frontendDistDir}`);
    }

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

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (processRef.exitCode !== null) {
      throw new Error(`后端进程提前退出，退出码: ${processRef.exitCode ?? 'unknown'}`);
    }

    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }

    await delay(BACKEND_READY_POLL_INTERVAL_MS);
  }

  throw new Error('后端健康检查超时');
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

function focusWindow(window: BrowserWindow): void {
  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.focus();
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
    webPreferences: {
      preload: join(currentDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: buildWindowArguments(),
    },
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
      windowPort = null;
    }
  });

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
    const result = await backendController.ensureReady();
    return { appUrl: result.appUrl };
  },
});

function bootstrap(): Promise<void> {
  return bootstrapController.bootstrap();
}

ipcMain.handle('hbs:retry-bootstrap', async () => {
  backendController.stopAndResetPort();
  await bootstrap();
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(bootstrap);

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
  backendController.stopAndResetPort();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
