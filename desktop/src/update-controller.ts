import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { chmod, mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const UPDATE_SUBDIR = 'updates';
const UPDATE_STATE_FILE = 'state.json';
const RELEASES_API_URL =
  'https://api.github.com/repos/NotWizard/HomeAssetManagement/releases';
const CHANNEL_PREFIX = 'hbs:update';

export const UPDATE_IPC_CHANNELS = {
  getState: `${CHANNEL_PREFIX}:get-state`,
  check: `${CHANNEL_PREFIX}:check`,
  download: `${CHANNEL_PREFIX}:download`,
  install: `${CHANNEL_PREFIX}:install`,
  changed: `${CHANNEL_PREFIX}:changed`,
} as const;

export type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseTag?: string;
  releaseUrl?: string;
  assetName?: string;
  assetUrl?: string;
  downloadedFilePath?: string;
  downloadedAt?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  progress?: number;
  lastCheckedAt?: number;
  errorMessage?: string;
  error?: string;
};

export type UpdateControllerOptions = {
  appVersion: string;
  arch: 'arm64' | 'x64';
  isPackaged: boolean;
  userDataDir: string;
  now?: () => number;
  fetchJsonReleases?: () => Promise<unknown[]>;
  scheduleInterval?: (
    handler: () => Promise<void>,
    intervalMs: number
  ) => { dispose: () => void };
  loadPersistedState?: () => UpdateState | null;
  persistState?: (state: UpdateState) => void;
  platform?: NodeJS.Platform;
  processExecPath?: string;
  processPid?: number;
  onRequestQuit?: () => void;
  runCommand?: (
    command: string,
    args: string[]
  ) => { status: number | null; error?: Error };
};

type UpdateListener = (state: UpdateState) => void;

type GithubRelease = {
  tag_name: string;
  name?: string;
  html_url?: string;
  draft: boolean;
  prerelease: boolean;
  published_at?: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size?: number;
  }>;
};

async function loadUpdateService(): Promise<typeof import('./update-service.ts')> {
  return import(new URL('./update-service.ts', import.meta.url).href);
}

function toArch(value: string): 'arm64' | 'x64' {
  return value === 'arm64' ? 'arm64' : 'x64';
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "'\\''");
}

function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function shellQuote(value: string): string {
  return `'${escapeSingleQuotes(value)}'`;
}

function findAppBundlePath(execPath: string): string {
  const resolved = resolve(execPath);
  const marker = '.app/';
  const markerIndex = resolved.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return resolved.slice(0, markerIndex + '.app'.length);
  }

  return resolved;
}

export function resolveInstallTargetPath(execPath: string): string {
  const appBundle = findAppBundlePath(execPath);
  if (appBundle.startsWith('/Volumes/')) {
    return '/Applications/HouseholdBalanceSheet.app';
  }

  return appBundle;
}

export function buildDetachedInstallScript(options: {
  pid: number;
  sourceAppPath: string;
  targetAppPath: string;
}): string {
  const sourceApp = shellQuote(options.sourceAppPath);
  const targetApp = shellQuote(options.targetAppPath);
  const adminCommand = `rm -rf ${targetApp} && ditto ${sourceApp} ${targetApp}`;

  return `#!/bin/sh
set -eu

TARGET_PID="${options.pid}"
SOURCE_APP=${sourceApp}
TARGET_APP=${targetApp}

while kill -0 "$TARGET_PID" 2>/dev/null; do
  sleep 1
done

if rm -rf "$TARGET_APP" && ditto "$SOURCE_APP" "$TARGET_APP"; then
  open "$TARGET_APP"
  exit 0
fi

osascript -e "do shell script \\"${escapeForAppleScript(
    adminCommand
  )}\\" with administrator privileges"
open "$TARGET_APP"
`;
}

async function findAppBundleInDirectory(directory: string): Promise<string | null> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory() && entry.name.endsWith('.app')) {
      return fullPath;
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const nested = await findAppBundleInDirectory(join(directory, entry.name));
    if (nested) {
      return nested;
    }
  }

  return null;
}

function createDefaultState(appVersion: string): UpdateState {
  return {
    status: 'idle',
    currentVersion: appVersion,
  };
}

function sanitizePersistedState(appVersion: string, persisted: UpdateState | null): UpdateState {
  if (!persisted) {
    return createDefaultState(appVersion);
  }

  const nextState: UpdateState = {
    ...createDefaultState(appVersion),
    ...persisted,
    currentVersion: appVersion,
  };

  if (
    nextState.status === 'downloaded' &&
    (!nextState.downloadedFilePath || !existsSync(nextState.downloadedFilePath))
  ) {
    return {
      ...createDefaultState(appVersion),
      lastCheckedAt: nextState.lastCheckedAt,
      latestVersion: nextState.latestVersion,
      releaseTag: nextState.releaseTag,
      releaseUrl: nextState.releaseUrl,
      assetName: nextState.assetName,
      assetUrl: nextState.assetUrl,
      totalBytes: nextState.totalBytes,
    };
  }

  return nextState;
}

function calculateProgress(
  downloadedBytes?: number,
  totalBytes?: number
): number | undefined {
  if (
    typeof downloadedBytes !== 'number' ||
    typeof totalBytes !== 'number' ||
    totalBytes <= 0
  ) {
    return undefined;
  }

  return Math.max(
    0,
    Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
  );
}

function createStatePersistence(userDataDir: string) {
  const updatesDir = join(userDataDir, UPDATE_SUBDIR);
  const statePath = join(updatesDir, UPDATE_STATE_FILE);

  return {
    updatesDir,
    statePath,
    load(): UpdateState | null {
      if (!existsSync(statePath)) {
        return null;
      }
      try {
        return JSON.parse(readFileSync(statePath, 'utf8')) as UpdateState;
      } catch {
        return null;
      }
    },
    persist(state: UpdateState): void {
      mkdirSync(updatesDir, { recursive: true });
      writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
    },
  };
}

async function fetchLatestReleases(): Promise<GithubRelease[]> {
  const response = await fetch(RELEASES_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'HouseholdBalanceSheet-Updater',
    },
  });
  if (!response.ok) {
    throw new Error(`检查更新失败: HTTP ${response.status}`);
  }

  return (await response.json()) as GithubRelease[];
}

function createInterval(
  handler: () => Promise<void>,
  intervalMs: number
): { dispose: () => void } {
  const timer = setInterval(() => {
    void handler();
  }, intervalMs);
  return {
    dispose: () => clearInterval(timer),
  };
}

export function createUpdateController(options: UpdateControllerOptions) {
  const arch = toArch(options.arch);
  const now = options.now ?? (() => Date.now());
  const isPackaged = options.isPackaged;
  const persistence = createStatePersistence(options.userDataDir);
  const loadPersistedState = options.loadPersistedState ?? (() => persistence.load());
  const persistState = options.persistState ?? ((state: UpdateState) => persistence.persist(state));
  const fetchJsonReleases = options.fetchJsonReleases ?? fetchLatestReleases;
  const scheduleInterval = options.scheduleInterval ?? createInterval;
  const platform = options.platform ?? process.platform;
  const processExecPath = options.processExecPath ?? process.execPath;
  const processPid = options.processPid ?? process.pid;
  const onRequestQuit = options.onRequestQuit ?? (() => undefined);
  const runCommand =
    options.runCommand ??
    ((command: string, args: string[]) => spawnSync(command, args, { stdio: 'ignore' }));

  let state = createDefaultState(options.appVersion);
  let pollingTimer: { dispose: () => void } | null = null;
  const listeners = new Set<UpdateListener>();

  function emitState(): void {
    persistState(state);
    for (const listener of listeners) {
      listener(state);
    }
  }

  function updateState(next: Partial<UpdateState>): UpdateState {
    state = {
      ...state,
      ...next,
    };
    emitState();
    return state;
  }

  async function checkForUpdates(): Promise<UpdateState> {
    if (!isPackaged) {
      return state;
    }

    const previousState = state;
    updateState({
      status: 'checking',
      errorMessage: undefined,
      error: undefined,
      lastCheckedAt: now(),
      currentVersion: options.appVersion,
    });

    try {
      const releases = (await fetchJsonReleases()) as GithubRelease[];
      const updateService = await loadUpdateService();
      const candidate = updateService.pickUpdateCandidate({
        currentVersion: options.appVersion,
        arch,
        releases,
      });

      if (!candidate) {
        const shouldKeepDownloaded =
          previousState.status === 'downloaded' &&
          typeof previousState.latestVersion === 'string' &&
          updateService.compareVersions(previousState.latestVersion, options.appVersion) > 0 &&
          !!previousState.downloadedFilePath &&
          existsSync(previousState.downloadedFilePath);

        if (shouldKeepDownloaded) {
          return updateState({
            status: 'downloaded',
            downloadedFilePath: previousState.downloadedFilePath,
            assetName: previousState.assetName,
            assetUrl: previousState.assetUrl,
            downloadedAt: previousState.downloadedAt,
            downloadedBytes: previousState.downloadedBytes,
            totalBytes: previousState.totalBytes,
            progress: previousState.progress ?? 100,
            lastCheckedAt: now(),
            errorMessage: undefined,
          });
        }

        return updateState({
          status: 'idle',
          latestVersion: undefined,
          releaseTag: undefined,
          releaseUrl: undefined,
          assetName: undefined,
          assetUrl: undefined,
          downloadedFilePath: undefined,
          downloadedAt: undefined,
          downloadedBytes: undefined,
          totalBytes: undefined,
          progress: undefined,
          errorMessage: undefined,
        });
      }

      const shouldKeepDownloaded =
        state.status === 'downloaded' &&
        state.assetName === candidate.asset.name &&
        !!state.downloadedFilePath &&
        existsSync(state.downloadedFilePath);

      return updateState({
        status: shouldKeepDownloaded ? 'downloaded' : 'available',
        latestVersion: candidate.version,
        releaseTag: candidate.tagName,
        releaseUrl: candidate.releaseUrl,
        assetName: candidate.asset.name,
        assetUrl: candidate.asset.url,
        downloadedFilePath: shouldKeepDownloaded ? state.downloadedFilePath : undefined,
        downloadedAt: shouldKeepDownloaded ? state.downloadedAt : undefined,
        downloadedBytes: shouldKeepDownloaded ? state.downloadedBytes : undefined,
        totalBytes: candidate.asset.size,
        progress: shouldKeepDownloaded ? 100 : undefined,
        errorMessage: undefined,
      });
    } catch (error) {
      return updateState({
        status: 'error',
        progress: undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function downloadUpdate(): Promise<UpdateState> {
    if (!isPackaged) {
      return state;
    }
    if (!state.assetUrl || !state.assetName) {
      return updateState({
        status: 'error',
        errorMessage: '当前没有可下载的更新包',
        error: '当前没有可下载的更新包',
      });
    }
    if (state.status === 'downloaded' && state.downloadedFilePath) {
      return state;
    }

    const updatesDir = join(options.userDataDir, UPDATE_SUBDIR);
    await mkdir(updatesDir, { recursive: true });
    const archivePath = join(updatesDir, state.assetName);

    updateState({
      status: 'downloading',
      downloadedFilePath: archivePath,
      downloadedBytes: 0,
      progress: 0,
      errorMessage: undefined,
      error: undefined,
    });

    try {
      const response = await fetch(state.assetUrl, {
        headers: {
          'User-Agent': 'HouseholdBalanceSheet-Updater',
        },
      });
      if (!response.ok || !response.body) {
        throw new Error(`下载更新失败: HTTP ${response.status}`);
      }

      const totalBytesHeader = response.headers.get('content-length');
      const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : undefined;
      const fileStream = createWriteStream(archivePath);
      const reader = response.body.getReader();
      let downloadedBytes = 0;

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        downloadedBytes += chunk.value.byteLength;
        fileStream.write(Buffer.from(chunk.value));
        updateState({
          status: 'downloading',
          downloadedBytes,
          totalBytes: totalBytes ?? state.totalBytes,
          progress: calculateProgress(downloadedBytes, totalBytes ?? state.totalBytes),
        });
      }

      await new Promise<void>((resolveWrite, rejectWrite) => {
        fileStream.on('error', rejectWrite);
        fileStream.end(() => resolveWrite());
      });

      return updateState({
        status: 'downloaded',
        downloadedBytes,
        totalBytes: totalBytes ?? state.totalBytes,
        downloadedAt: new Date(now()).toISOString(),
        progress: 100,
      });
    } catch (error) {
      rmSync(archivePath, { force: true });
      return updateState({
        status: 'error',
        progress: undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function installUpdate(): Promise<UpdateState> {
    if (!isPackaged) {
      return state;
    }
    if (!state.downloadedFilePath || !existsSync(state.downloadedFilePath)) {
      return updateState({
        status: 'error',
        errorMessage: '更新包不存在，请重新下载',
        error: '更新包不存在，请重新下载',
      });
    }
    if (platform !== 'darwin') {
      return updateState({
        status: 'error',
        errorMessage: '当前仅支持 macOS 自动安装',
        error: '当前仅支持 macOS 自动安装',
      });
    }

    const updatesDir = join(options.userDataDir, UPDATE_SUBDIR);
    const stageDir = join(updatesDir, 'staged');
    rmSync(stageDir, { force: true, recursive: true });
    mkdirSync(stageDir, { recursive: true });

    const unzipResult = runCommand('ditto', [
      '-x',
      '-k',
      state.downloadedFilePath,
      stageDir,
    ]);
    if (unzipResult.status !== 0) {
      return updateState({
        status: 'error',
        errorMessage: '解压更新包失败',
        error: '解压更新包失败',
      });
    }

    const sourceAppPath = await findAppBundleInDirectory(stageDir);
    if (!sourceAppPath) {
      return updateState({
        status: 'error',
        errorMessage: '更新包中未找到应用程序',
        error: '更新包中未找到应用程序',
      });
    }

    const targetAppPath = resolveInstallTargetPath(processExecPath);
    const scriptPath = join(updatesDir, `install-update-${Date.now()}.sh`);
    const scriptContent = buildDetachedInstallScript({
      pid: processPid,
      sourceAppPath,
      targetAppPath,
    });

    await writeFile(scriptPath, scriptContent, 'utf8');
    await chmod(scriptPath, 0o755);

    const installer = spawn('sh', [scriptPath], {
      detached: true,
      stdio: 'ignore',
      cwd: dirname(scriptPath),
    });
    installer.unref();
    onRequestQuit();

    return state;
  }

  return {
    async start(): Promise<void> {
      const persisted = loadPersistedState();
      state = sanitizePersistedState(options.appVersion, persisted);
      emitState();

      if (!isPackaged) {
        return;
      }

      await checkForUpdates();
      pollingTimer?.dispose();
      pollingTimer = scheduleInterval(async () => {
        await checkForUpdates();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
    stop(): void {
      pollingTimer?.dispose();
      pollingTimer = null;
    },
    getState(): UpdateState {
      return state;
    },
    subscribe(listener: UpdateListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  };
}
