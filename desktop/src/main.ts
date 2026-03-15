import { app, BrowserWindow } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
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
import { createBootstrapController } from './bootstrap-controller.js';
import { createErrorPage, createLoadingPage } from './startup-page.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, '..', '..');
const BACKEND_READY_TIMEOUT_MS = 15_000;
const BACKEND_READY_POLL_INTERVAL_MS = 150;

let backendProcess: ChildProcessWithoutNullStreams | null = null;
let backendPort: number | null = null;
let mainWindow: BrowserWindow | null = null;
let backendReadyPromise: Promise<void> | null = null;

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

function resolvePythonExecutable(): string {
  const venvPython =
    process.platform === 'win32'
      ? join(projectRoot, '.venv', 'Scripts', 'python.exe')
      : join(projectRoot, '.venv', 'bin', 'python');

  return existsSync(venvPython) ? venvPython : 'python3';
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

  return spawn(resolvePythonExecutable(), [desktopPaths.backendEntry], {
    cwd: projectRoot,
    env,
    stdio: 'pipe',
  });
}

function wireBackendLogs(processRef: ChildProcessWithoutNullStreams): void {
  processRef.stdout.on('data', (chunk) => {
    process.stdout.write(`[ham-backend] ${chunk}`);
  });
  processRef.stderr.on('data', (chunk) => {
    process.stderr.write(`[ham-backend] ${chunk}`);
  });
}

async function waitForBackendReady(port: number): Promise<void> {
  const healthUrl = `${buildAppUrl(port)}/health`;
  const attempts = Math.ceil(
    BACKEND_READY_TIMEOUT_MS / BACKEND_READY_POLL_INTERVAL_MS
  );

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (backendProcess?.exitCode !== null) {
      throw new Error(`后端进程提前退出，退出码: ${backendProcess?.exitCode ?? 'unknown'}`);
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
  if (backendPort === null) {
    return [];
  }

  return [`--ham-api-base-url=${buildApiBaseUrl(backendPort)}`];
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
  if (isWindowAvailable(mainWindow)) {
    return mainWindow;
  }

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    autoHideMenuBar: true,
    title: 'Home Asset Management',
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
    }
  });

  mainWindow = window;
  return window;
}

async function ensureBackendReady(): Promise<number> {
  if (backendPort === null) {
    backendPort = await findAvailablePort();
  }

  if (backendProcess && backendProcess.exitCode !== null) {
    backendProcess = null;
    backendReadyPromise = null;
  }

  if (!backendProcess) {
    backendProcess = spawnBackend(backendPort);
    wireBackendLogs(backendProcess);
    backendReadyPromise = waitForBackendReady(backendPort)
      .catch((error) => {
        stopBackend();
        throw error;
      })
      .finally(() => {
        backendReadyPromise = null;
      });
  }

  if (backendReadyPromise) {
    await backendReadyPromise;
  }

  return backendPort;
}

function stopBackend(): void {
  if (!backendProcess || backendProcess.killed) {
    backendProcess = null;
    backendReadyPromise = null;
    return;
  }

  backendProcess.kill();
  backendProcess = null;
  backendReadyPromise = null;
}

const bootstrapController = createBootstrapController({
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
    const port = await ensureBackendReady();
    return { appUrl: buildAppUrl(port) };
  },
});

function bootstrap(): Promise<void> {
  return bootstrapController.bootstrap();
}

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
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
