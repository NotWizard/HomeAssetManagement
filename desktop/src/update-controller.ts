import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { chmod, mkdir, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

import {
  applyUpdateStateTransition,
  compareVersions,
  createDefaultUpdateState,
  parseSha256File,
  pickUpdateCandidate,
  toAvailableState,
  toDownloadedState,
  toErrorState,
  toInstallingState,
  toPreparingInstallState,
  verifySha256,
  type GithubRelease,
  type UpdateState,
  validateDownloadedUpdate,
} from './update-workflow.ts';

const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const UPDATE_SUBDIR = 'updates';
const UPDATE_STATE_FILE = 'state.json';
const RELEASES_API_URL =
  'https://api.github.com/repos/NotWizard/HouseholdBalanceSheet/releases';
const CHANNEL_PREFIX = 'hbs:update';

export const UPDATE_IPC_CHANNELS = {
  getState: `${CHANNEL_PREFIX}:get-state`,
  check: `${CHANNEL_PREFIX}:check`,
  download: `${CHANNEL_PREFIX}:download`,
  install: `${CHANNEL_PREFIX}:install`,
  changed: `${CHANNEL_PREFIX}:changed`,
} as const;

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
  /** 安装失败时回滚旧 app 的备份目录路径。 */
  backupPath: string;
}): string {
  const sourceApp = shellQuote(options.sourceAppPath);
  const targetApp = shellQuote(options.targetAppPath);
  const backupPath = shellQuote(options.backupPath);
  // 提权 fallback 路径：直接对目标做覆盖；如果上一步常规路径已经移除/还原过 backup，
  // 这里仅在常规路径完全失败且 backup 不存在时才走（极端情况）。
  const adminCommand = `ditto ${sourceApp} ${targetApp}`;

  return `#!/bin/sh
set -eu

TARGET_PID="${options.pid}"
SOURCE_APP=${sourceApp}
TARGET_APP=${targetApp}
BACKUP_APP=${backupPath}

# 移除新 app 的 macOS 隔离标记（com.apple.quarantine xattr）。
# 没签名的 zip 解压出的 .app 默认带 quarantine attr，启动时会被 Gatekeeper 拦截
# 弹"无法验证开发者..."要求用户去 系统设置 → 隐私与安全 重新放行；
# 这里在装入目标位置之后立即递归剥离，让用户从旧版升级到新版无需任何额外授权操作。
# 失败时（比如 xattr 不在 / 命令缺失）不阻塞主流程。
remove_quarantine() {
  if [ -e "$1" ]; then
    xattr -dr com.apple.quarantine "$1" 2>/dev/null || true
  fi
}

while kill -0 "$TARGET_PID" 2>/dev/null; do
  sleep 1
done

# 1) 把旧 app 移到备份位置（保留可还原状态），不做 rm
rm -rf "$BACKUP_APP"
if [ -d "$TARGET_APP" ]; then
  if ! mv "$TARGET_APP" "$BACKUP_APP"; then
    osascript -e "do shell script \\"${escapeForAppleScript(
      adminCommand
    )}\\" with administrator privileges"
    remove_quarantine "$TARGET_APP"
    open "$TARGET_APP"
    exit 0
  fi
fi

# 2) 把新 app 落到目标位置；失败 → 还原 BACKUP_APP，绝不留下"被删却没装上"的状态
if ditto "$SOURCE_APP" "$TARGET_APP"; then
  rm -rf "$BACKUP_APP"
  remove_quarantine "$TARGET_APP"
  open "$TARGET_APP"
  exit 0
fi

# 3) ditto 失败：尝试还原备份
rm -rf "$TARGET_APP"
if [ -d "$BACKUP_APP" ]; then
  mv "$BACKUP_APP" "$TARGET_APP"
fi

# 4) 提权 fallback：用 osascript 重做 ditto
osascript -e "do shell script \\"${escapeForAppleScript(
    adminCommand
  )}\\" with administrator privileges"
remove_quarantine "$TARGET_APP"
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

function sanitizePersistedState(appVersion: string, persisted: UpdateState | null): UpdateState {
  if (!persisted) {
    return createDefaultUpdateState(appVersion);
  }

  const nextState: UpdateState = {
    ...createDefaultUpdateState(appVersion),
    ...persisted,
    currentVersion: appVersion,
  };

  if (
    ['preparing', 'installing'].includes(nextState.status) &&
    nextState.downloadedFilePath &&
    existsSync(nextState.downloadedFilePath)
  ) {
    return {
      ...nextState,
      status: 'downloaded',
      progress: 100,
      errorMessage: undefined,
      error: undefined,
    };
  }

  if (
    ['downloaded', 'preparing', 'installing'].includes(nextState.status) &&
    (!nextState.downloadedFilePath || !existsSync(nextState.downloadedFilePath))
  ) {
    return {
      ...createDefaultUpdateState(appVersion),
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

  let state = createDefaultUpdateState(options.appVersion);
  let pollingTimer: { dispose: () => void } | null = null;
  const listeners = new Set<UpdateListener>();

  function emitState(): void {
    persistState(state);
    for (const listener of listeners) {
      listener(state);
    }
  }

  function updateState(next: Partial<UpdateState>): UpdateState {
    state = applyUpdateStateTransition(state, next);
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
      const candidate = pickUpdateCandidate({
        currentVersion: options.appVersion,
        arch,
        releases,
      });

      if (!candidate) {
        const shouldKeepDownloaded =
          previousState.status === 'downloaded' &&
          typeof previousState.latestVersion === 'string' &&
          compareVersions(previousState.latestVersion, options.appVersion) > 0 &&
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
        ['downloaded', 'preparing', 'installing'].includes(state.status) &&
        state.assetName === candidate.asset.name &&
        !!state.downloadedFilePath &&
        existsSync(state.downloadedFilePath);

      const nextState = updateState(
        toAvailableState({
          currentVersion: options.appVersion,
          candidate,
        })
      );

      if (shouldKeepDownloaded) {
        return updateState({
          ...nextState,
          status: 'downloaded',
          downloadedFilePath: state.downloadedFilePath,
          downloadedAt: state.downloadedAt,
          downloadedBytes: state.downloadedBytes,
          totalBytes: candidate.asset.size,
          progress: 100,
        });
      }

      // 后台静默下载：检测到新候选包后立即触发下载，不等待用户操作。
      // - 不 await，让 checkForUpdates 立刻返回，不阻塞 12h 轮询。
      // - 错误吞掉，downloadUpdate 内部已经通过 toErrorState 写入 state。
      // - 用 status === 'available' 守卫，避免 12h 轮询期间正在下载又被重复触发。
      // 用户感知链路：idle → (静默 available/downloading) → downloaded（左下角才出现提醒）。
      if (state.status === 'available') {
        void downloadUpdate().catch(() => undefined);
      }

      return nextState;
    } catch (error) {
      return updateState(
        toErrorState(error instanceof Error ? error.message : String(error))
      );
    }
  }

  async function downloadUpdate(): Promise<UpdateState> {
    if (!isPackaged) {
      return state;
    }
    if (!state.assetUrl || !state.assetName) {
      return updateState(toErrorState('当前没有可下载的更新包'));
    }
    if (state.status === 'downloaded' && state.downloadedFilePath) {
      return state;
    }

    // Hard gate：必须提供配套 .sha256 校验文件，否则拒绝下载（防 MITM/注入恶意更新包）。
    if (!state.sha256AssetUrl) {
      return updateState(
        toErrorState(
          '更新包缺少完整性校验文件（.sha256），出于安全考虑已拒绝下载，请等待官方修复后再尝试'
        )
      );
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
      // 1) 先取期望摘要（短文本，独立请求，失败即拒绝下载）
      const shaResponse = await fetch(state.sha256AssetUrl, {
        headers: { 'User-Agent': 'HouseholdBalanceSheet-Updater' },
      });
      if (!shaResponse.ok) {
        throw new Error(`无法获取 SHA-256 校验文件: HTTP ${shaResponse.status}`);
      }
      const expectedSha256 = parseSha256File(await shaResponse.text());
      if (!expectedSha256) {
        throw new Error('SHA-256 校验文件格式不合法');
      }

      // 2) 下载主资产并同步增量计算 SHA-256
      const response = await fetch(state.assetUrl, {
        headers: { 'User-Agent': 'HouseholdBalanceSheet-Updater' },
      });
      if (!response.ok || !response.body) {
        throw new Error(`下载更新失败: HTTP ${response.status}`);
      }

      const totalBytesHeader = response.headers.get('content-length');
      const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : undefined;
      const fileStream = createWriteStream(archivePath);
      const reader = response.body.getReader();
      const hasher = createHash('sha256');
      let downloadedBytes = 0;
      // 下载进度节流：原来每个 chunk 都触发 updateState → persistState（fsync state.json）
      // + 全 listener 广播；100MB 包 ×（64KB chunk = 1600+ 次 / 5MB chunk = 20+ 次）
      // 都过多。改为 250ms 节流：常见 fetch chunk 间隔 < 250ms 时跳过中间帧。
      // 最后一次状态由循环结束后的 flush 统一写出，保证持久化到最终值。
      const PROGRESS_THROTTLE_MS = 250;
      let lastProgressEmitAt = 0;
      let pendingProgress: { downloadedBytes: number; totalBytes: number | undefined } | null = null;

      const flushProgressNow = () => {
        if (!pendingProgress) return;
        updateState({
          status: 'downloading',
          downloadedBytes: pendingProgress.downloadedBytes,
          totalBytes: pendingProgress.totalBytes ?? state.totalBytes,
          progress: calculateProgress(
            pendingProgress.downloadedBytes,
            pendingProgress.totalBytes ?? state.totalBytes
          ),
        });
        lastProgressEmitAt = Date.now();
        pendingProgress = null;
      };

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        const buf = Buffer.from(chunk.value);
        hasher.update(buf);
        downloadedBytes += chunk.value.byteLength;
        fileStream.write(buf);
        pendingProgress = { downloadedBytes, totalBytes };
        if (Date.now() - lastProgressEmitAt >= PROGRESS_THROTTLE_MS) {
          flushProgressNow();
        }
      }
      // 循环结束 flush 一次，保证 100% / 最终 downloadedBytes 落到 state.json + listeners
      flushProgressNow();

      await new Promise<void>((resolveWrite, rejectWrite) => {
        fileStream.on('error', rejectWrite);
        fileStream.end(() => resolveWrite());
      });

      // 3) 校验：实际 vs 期望，不一致立刻丢弃下载
      const actualSha256 = hasher.digest('hex');
      if (!verifySha256(actualSha256, expectedSha256)) {
        rmSync(archivePath, { force: true });
        throw new Error(
          `更新包 SHA-256 校验失败（expected=${expectedSha256.slice(0, 12)}…，actual=${actualSha256.slice(0, 12)}…），已丢弃下载`
        );
      }

      return updateState(
        toDownloadedState({
          downloadedFilePath: archivePath,
          downloadedAt: new Date(now()).toISOString(),
          downloadedBytes,
          totalBytes: totalBytes ?? state.totalBytes,
          verifiedSha256: actualSha256,
        })
      );
    } catch (error) {
      rmSync(archivePath, { force: true });
      return updateState(
        toErrorState(error instanceof Error ? error.message : String(error))
      );
    }
  }

  async function installUpdate(): Promise<UpdateState> {
    if (!isPackaged) {
      return state;
    }
    if (!state.downloadedFilePath || !existsSync(state.downloadedFilePath)) {
      return updateState(toErrorState('更新包不存在，请重新下载'));
    }
    if (platform !== 'darwin') {
      return updateState(toErrorState('当前仅支持 macOS 自动安装'));
    }

    const validation = validateDownloadedUpdate({
      latestVersion: state.latestVersion,
      arch,
      assetName: state.assetName,
      downloadedFilePath: state.downloadedFilePath,
    });
    if (!validation.ok) {
      return updateState(toErrorState(validation.message));
    }

    const updatesDir = join(options.userDataDir, UPDATE_SUBDIR);
    const stageDir = join(updatesDir, 'staged');
    rmSync(stageDir, { force: true, recursive: true });
    mkdirSync(stageDir, { recursive: true });
    updateState(toPreparingInstallState());

    const unzipResult = runCommand('ditto', [
      '-x',
      '-k',
      state.downloadedFilePath,
      stageDir,
    ]);
    if (unzipResult.status !== 0) {
      rmSync(stageDir, { force: true, recursive: true });
      return updateState(toErrorState('解压更新包失败'));
    }

    const sourceAppPath = await findAppBundleInDirectory(stageDir);
    if (!sourceAppPath) {
      rmSync(stageDir, { force: true, recursive: true });
      return updateState(toErrorState('更新包中未找到应用程序'));
    }

    const targetAppPath = resolveInstallTargetPath(processExecPath);
    const backupPath = join(updatesDir, 'backup', `previous-${Date.now()}.app`);
    mkdirSync(dirname(backupPath), { recursive: true });
    const scriptPath = join(updatesDir, `install-update-${Date.now()}.sh`);
    const scriptContent = buildDetachedInstallScript({
      pid: processPid,
      sourceAppPath,
      targetAppPath,
      backupPath,
    });

    await writeFile(scriptPath, scriptContent, 'utf8');
    await chmod(scriptPath, 0o755);
    updateState(toInstallingState());

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

      // 启动期清理：删除超过 7 天的 install-update-*.sh 与孤儿 backup app；
      // 这些是上一次安装阶段产生的临时文件，留着会污染 userData/updates/。
      try {
        const updatesDir = join(options.userDataDir, UPDATE_SUBDIR);
        if (existsSync(updatesDir)) {
          const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const entries = await readdir(updatesDir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(updatesDir, entry.name);
            const isOld =
              entry.name.startsWith('install-update-') &&
              entry.name.endsWith('.sh');
            if (isOld) {
              try {
                if (statSync(fullPath).mtimeMs < cutoff) {
                  rmSync(fullPath, { force: true });
                }
              } catch {
                // 忽略单个文件清理失败，不影响 update 主流程
              }
            }
          }
          // backup 目录里的 previous-*.app：上一次安装成功后理应被脚本 rm；保留作 fallback。
          // 同样按 7 天阈值清理避免无限堆积。
          const backupDir = join(updatesDir, 'backup');
          if (existsSync(backupDir)) {
            const backups = await readdir(backupDir, { withFileTypes: true });
            for (const backup of backups) {
              const fullPath = join(backupDir, backup.name);
              try {
                if (statSync(fullPath).mtimeMs < cutoff) {
                  rmSync(fullPath, { force: true, recursive: true });
                }
              } catch {
                // ignore
              }
            }
          }
        }
      } catch {
        // 启动期清理是尽力而为，失败不阻塞 update controller
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
