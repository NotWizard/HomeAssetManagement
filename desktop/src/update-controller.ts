import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { chmod, mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

import {
  applyUpdateStateTransition,
  buildExpectedAssetName,
  compareVersions,
  createDefaultUpdateState,
  parseSha256File,
  pickUpdateCandidate,
  successfulCheckHealthFields,
  toAvailableState,
  toDownloadErrorState,
  toDownloadedState,
  toErrorState,
  toInstallErrorState,
  toInstallingState,
  toNetworkDegradedState,
  toPreparingInstallState,
  toValidationErrorState,
  verifySha256,
  type GithubRelease,
  type GithubReleaseAsset,
  type UpdateState,
  validateDownloadedUpdate,
} from './update-workflow.ts';

const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
// 网络检查连续失败的退避阶梯：避免短时间反复撞 GitHub API 未认证限速（60 req/h）。
const UPDATE_BACKOFF_POLL_INTERVAL_MS = 4 * 60 * 60 * 1000;
const UPDATE_LONG_BACKOFF_POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_BACKOFF_THRESHOLD = 3;
const UPDATE_LONG_BACKOFF_THRESHOLD = 10;
// 启动时读到 error 状态：若 lastCheckedAt 距今已超过 TTL，视为过期，清洗回 idle。
// 1h 阈值与 GitHub 限速窗口（1h）对齐，避免用户下次启动仍看到上一轮 403 残留。
const UPDATE_ERROR_STATE_TTL_MS = 60 * 60 * 1000;
// 重启后如果上次网络失败距今超过此阈值，清零 consecutiveNetworkFailures，
// 让新一轮检查能从短退避起步，而不是继承几小时前的长退避。
const UPDATE_NETWORK_FAILURE_MEMORY_MS = 24 * 60 * 60 * 1000;
const UPDATE_SUBDIR = 'updates';
const UPDATE_STATE_FILE = 'state.json';
const RELEASES_API_URL =
  'https://api.github.com/repos/NotWizard/HouseholdBalanceSheet/releases';
const RELEASES_LATEST_URL =
  'https://github.com/NotWizard/HouseholdBalanceSheet/releases/latest';
const RELEASE_TAG_BASE_URL =
  'https://github.com/NotWizard/HouseholdBalanceSheet/releases/tag';
const RELEASE_DOWNLOAD_BASE_URL =
  'https://github.com/NotWizard/HouseholdBalanceSheet/releases/download';
const CHANNEL_PREFIX = 'hbs:update';

function computeBackoffPollIntervalMs(consecutiveNetworkFailures: number): number {
  if (consecutiveNetworkFailures >= UPDATE_LONG_BACKOFF_THRESHOLD) {
    return UPDATE_LONG_BACKOFF_POLL_INTERVAL_MS;
  }
  if (consecutiveNetworkFailures >= UPDATE_BACKOFF_THRESHOLD) {
    return UPDATE_BACKOFF_POLL_INTERVAL_MS;
  }
  return UPDATE_CHECK_INTERVAL_MS;
}

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
  persistState?: (state: UpdateState) => Promise<void> | void;
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

function sanitizePersistedState(
  appVersion: string,
  persisted: UpdateState | null,
  now: number
): UpdateState {
  if (!persisted) {
    return createDefaultUpdateState(appVersion);
  }

  let nextState: UpdateState = {
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
      // 保留"已知世界状态"让下次检查能降级到上次结论
      lastSuccessfulCheckAt: nextState.lastSuccessfulCheckAt,
      lastKnownLatestVersion: nextState.lastKnownLatestVersion,
    };
  }

  // === error 状态 TTL 清洗 ===
  // 超过 1h 的陈旧 error（典型：上一轮 GitHub 403 后用户未重启的冷 state.json）
  // 复位到 idle，避免每次启动都误显"更新失败"。保留 lastSuccessfulCheckAt 让
  // 紧接着的 checkForUpdates 若再次失败仍能降级到"上次结论"。
  if (
    nextState.status === 'error' &&
    typeof nextState.lastCheckedAt === 'number' &&
    now - nextState.lastCheckedAt > UPDATE_ERROR_STATE_TTL_MS
  ) {
    nextState = {
      ...createDefaultUpdateState(appVersion),
      lastCheckedAt: nextState.lastCheckedAt,
      lastSuccessfulCheckAt: nextState.lastSuccessfulCheckAt,
      lastKnownLatestVersion: nextState.lastKnownLatestVersion,
    };
  }

  // === 向后兼容：旧 state.json 没有 lastSuccessfulCheckAt 字段 ===
  // 旧版本里 status=idle 且 lastCheckedAt 存在 = "上次成功检查后无新版本"。
  // 谨慎起见只从 idle 推断；error 状态已在上面清洗时一并处理；
  // downloaded/available 等有业务含义的状态不推断，避免误判"已确认无更新"。
  if (
    typeof nextState.lastSuccessfulCheckAt !== 'number' &&
    typeof nextState.lastCheckedAt === 'number' &&
    nextState.status === 'idle'
  ) {
    nextState.lastSuccessfulCheckAt = nextState.lastCheckedAt;
  }

  // === 网络失败计数器老化重置 ===
  // 上一轮网络失败距今超过 24h，清零 consecutiveNetworkFailures，让新一轮
  // 检查从短退避起步；避免几小时前的偶发故障继续拉长下一轮轮询间隔。
  if (
    typeof nextState.consecutiveNetworkFailures === 'number' &&
    nextState.consecutiveNetworkFailures > 0 &&
    typeof nextState.lastNetworkErrorAt === 'number' &&
    now - nextState.lastNetworkErrorAt > UPDATE_NETWORK_FAILURE_MEMORY_MS
  ) {
    nextState.consecutiveNetworkFailures = 0;
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
    // 改 async：原 writeFileSync 在每次 emitState 都同步阻塞主线程做一次 fsync
    // （download 节流后仍每秒 ~4 次），改 fs/promises.writeFile 后只在事件循环
    // 上排一次微任务；updates dir 在 controller.start() 一次性建好，不再每次 persist mkdir。
    async persist(state: UpdateState): Promise<void> {
      await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
    },
  };
}

function parseVersionTagFromLocation(location: string | null): string | null {
  if (!location) {
    return null;
  }

  const url = new URL(location, RELEASES_LATEST_URL);
  const matched = url.pathname.match(/\/releases\/tag\/([^/]+)$/);
  return matched ? decodeURIComponent(matched[1]) : null;
}

function parseVersionFromTag(tagName: string): string | null {
  const matched = tagName.match(/(\d+)\.(\d+)\.(\d+)/);
  return matched ? `${matched[1]}.${matched[2]}.${matched[3]}` : null;
}

async function headReleaseAsset(
  tagName: string,
  assetName: string
): Promise<GithubReleaseAsset | null> {
  const url = `${RELEASE_DOWNLOAD_BASE_URL}/${encodeURIComponent(tagName)}/${encodeURIComponent(assetName)}`;
  const response = await fetch(url, {
    method: 'HEAD',
    headers: {
      'User-Agent': 'HouseholdBalanceSheet-Updater',
    },
  });

  if (!response.ok) {
    return null;
  }

  const size = Number(response.headers.get('content-length'));
  return {
    name: assetName,
    browser_download_url: url,
    size: Number.isFinite(size) ? size : undefined,
  };
}

async function fetchLatestReleaseByRedirect(): Promise<GithubRelease[]> {
  const response = await fetch(RELEASES_LATEST_URL, {
    method: 'HEAD',
    redirect: 'manual',
    headers: {
      'User-Agent': 'HouseholdBalanceSheet-Updater',
    },
  });
  const tagName = parseVersionTagFromLocation(response.headers.get('location'));
  const version = tagName ? parseVersionFromTag(tagName) : null;
  if (!tagName || !version) {
    throw new Error('无法从 GitHub releases/latest 解析最新版本');
  }

  const assets: GithubReleaseAsset[] = [];
  for (const arch of ['arm64', 'x64'] as const) {
    const zipName = buildExpectedAssetName(version, arch);
    const zipAsset = await headReleaseAsset(tagName, zipName);
    if (!zipAsset) {
      continue;
    }
    assets.push(zipAsset);

    const sha256Asset = await headReleaseAsset(tagName, `${zipName}.sha256`);
    if (sha256Asset) {
      assets.push(sha256Asset);
    }
  }

  if (assets.length === 0) {
    throw new Error(`GitHub release ${tagName} 中未找到可用更新包`);
  }

  return [
    {
      tag_name: tagName,
      name: tagName,
      html_url: `${RELEASE_TAG_BASE_URL}/${encodeURIComponent(tagName)}`,
      draft: false,
      prerelease: false,
      assets,
    },
  ];
}

export async function fetchLatestReleases(): Promise<GithubRelease[]> {
  let apiError: unknown = null;
  try {
    const response = await fetch(RELEASES_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'HouseholdBalanceSheet-Updater',
      },
    });
    if (response.ok) {
      return (await response.json()) as GithubRelease[];
    }
    apiError = new Error(`检查更新失败: HTTP ${response.status}`);
  } catch (error) {
    apiError = error;
  }

  try {
    return await fetchLatestReleaseByRedirect();
  } catch {
    if (apiError instanceof Error) {
      throw apiError;
    }
    throw new Error('检查更新失败');
  }
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
  // 下一次允许执行 checkForUpdates 的最早时间戳（毫秒）。
  // - 初始 0：启动期立即跑一次 check，尽快拿到"是否最新版"的结论。
  // - 网络成功：now + BASE_POLL_INTERVAL_MS（12h）。
  // - 网络失败：now + backoff（4h/24h 按连续失败次数递增）。
  // 用户手动触发（点"重试"按钮）无视此门槛。
  let nextAllowedCheckAt = 0;
  const listeners = new Set<UpdateListener>();

  function emitState(): void {
    // persistState 现在可能返回 Promise（默认 fs/promises.writeFile）；fire-and-forget
    // 并捕获异常打到 stderr，避免一次磁盘错误把整个 emit 链炸断。
    void Promise.resolve(persistState(state)).catch((error) => {
      process.stderr.write(
        `[hbs-update] 持久化更新状态失败: ${error instanceof Error ? error.message : String(error)}\n`
      );
    });
    for (const listener of listeners) {
      // 用 try/catch 包裹每个 listener，避免一个 listener 抛错影响其他 listener
      // 与状态广播（典型场景：窗口已销毁 webContents.send 抛 'Object has been destroyed'）。
      try {
        listener(state);
      } catch (error) {
        process.stderr.write(
          `[hbs-update] update listener 抛出异常: ${error instanceof Error ? error.message : String(error)}\n`
        );
      }
    }
  }

  function updateState(next: Partial<UpdateState>): UpdateState {
    state = applyUpdateStateTransition(state, next);
    emitState();
    return state;
  }

  async function checkForUpdates(
    checkOptions: { manual?: boolean } = {}
  ): Promise<UpdateState> {
    if (!isPackaged) {
      return state;
    }

    const nowTs = now();

    // === 退避守卫 ===
    // 非手动触发时，若仍处于网络失败后的 backoff 窗口，本次轮询直接 noop：
    // 不调用 fetchJsonReleases（不撞限速）、不 persist、不广播。
    // 用户手动点击"重试"按钮 → manual=true → 无视退避立即检查。
    if (!checkOptions.manual && nowTs < nextAllowedCheckAt) {
      return state;
    }

    const previousState = state;
    updateState({
      status: 'checking',
      errorMessage: undefined,
      error: undefined,
      errorKind: undefined,
      lastCheckedAt: nowTs,
      currentVersion: options.appVersion,
    });

    let releases: GithubRelease[];
    try {
      releases = (await fetchJsonReleases()) as GithubRelease[];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failures = (previousState.consecutiveNetworkFailures ?? 0) + 1;
      // 退避窗口按"连续失败次数"阶梯递增，避免短时间反复撞 GitHub 限速。
      nextAllowedCheckAt = nowTs + computeBackoffPollIntervalMs(failures);

      // === 关键修复：网络失败不进 error，保留 previousState 的稳定状态 ===
      // 把 checking 状态回退到 previousState.status（通常是 idle，也可能是
      // downloaded 等待用户安装），仅在 state 上追加诊断字段。
      // UI 看不到任何变化（status 没变 → broadcastUpdateState 推同样内容 → 不闪烁）。
      process.stderr.write(
        `[hbs-update] 网络检查失败（已降级到上次结论，连续第 ${failures} 次）: ${message}\n`
      );

      return updateState({
        ...previousState,
        ...toNetworkDegradedState({ previousState, now: nowTs }),
        // 防御性：万一 previousState.status 在并发下被改成 checking，兜底回 idle
        status:
          previousState.status === 'checking' ? 'idle' : previousState.status,
        lastCheckedAt: nowTs,
      });
    }

    // === 成功分支：重置健康跟踪 ===
    nextAllowedCheckAt = nowTs + UPDATE_CHECK_INTERVAL_MS;
    const healthFields = successfulCheckHealthFields({ now: nowTs, latestVersion: null });

    const candidate = pickUpdateCandidate({
      currentVersion: options.appVersion,
      arch,
      releases,
    });

    if (!candidate) {
      // 没有新版本；latestVersion 等字段清空，但仍把"已知无新版本"记录到
      // lastKnownLatestVersion=null，下次网络失败时能降级到这一结论。
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
          lastCheckedAt: nowTs,
          errorMessage: undefined,
          ...healthFields,
          lastKnownLatestVersion: previousState.latestVersion ?? null,
        });
      }

      return updateState({
        status: 'idle',
        latestVersion: undefined,
        releaseTag: undefined,
        releaseUrl: undefined,
        assetName: undefined,
        assetUrl: undefined,
        sha256AssetUrl: undefined,
        downloadedFilePath: undefined,
        downloadedAt: undefined,
        downloadedBytes: undefined,
        totalBytes: undefined,
        progress: undefined,
        errorMessage: undefined,
        error: undefined,
        errorKind: undefined,
        lastCheckedAt: nowTs,
        ...healthFields,
        lastKnownLatestVersion: null,
      });
    }

    // 有新版候选：记录 lastKnownLatestVersion = candidate.version
    const candidateHealthFields = successfulCheckHealthFields({
      now: nowTs,
      latestVersion: candidate.version,
    });

    const shouldKeepDownloaded =
      ['downloaded', 'preparing', 'installing'].includes(state.status) &&
      state.assetName === candidate.asset.name &&
      !!state.downloadedFilePath &&
      existsSync(state.downloadedFilePath);

    const nextState = updateState({
      ...toAvailableState({
        currentVersion: options.appVersion,
        candidate,
      }),
      ...candidateHealthFields,
      lastCheckedAt: nowTs,
    });

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
    // - 错误吞掉，downloadUpdate 内部已经通过分类 error state 写入 state。
    // - 用 status === 'available' 守卫，避免 12h 轮询期间正在下载又被重复触发。
    // 用户感知链路：idle → (静默 available/downloading) → downloaded（左下角才出现提醒）。
    if (state.status === 'available') {
      void downloadUpdate().catch(() => undefined);
    }

    return nextState;
  }

  async function downloadUpdate(): Promise<UpdateState> {
    if (!isPackaged) {
      return state;
    }
    if (!state.assetUrl || !state.assetName) {
      return updateState(toDownloadErrorState('当前没有可下载的更新包'));
    }
    if (state.status === 'downloaded' && state.downloadedFilePath) {
      return state;
    }

    // Hard gate：必须提供配套 .sha256 校验文件，否则拒绝下载（防 MITM/注入恶意更新包）。
    if (!state.sha256AssetUrl) {
      return updateState(
        toValidationErrorState(
          '更新包缺少完整性校验文件（.sha256），出于安全考虑已拒绝下载，请等待官方修复后再尝试'
        )
      );
    }

    const updatesDir = join(options.userDataDir, UPDATE_SUBDIR);
    await mkdir(updatesDir, { recursive: true });
    const archivePath = join(updatesDir, state.assetName);
    // 下载先落到 .partial，校验通过后 atomic rename 到最终路径；
    // 中途崩溃 / 断电只会留下 .partial（启动时清理），不会污染最终 archivePath。
    const partialPath = `${archivePath}.partial`;

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
      const fileStream = createWriteStream(partialPath);
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
        rmSync(partialPath, { force: true });
        throw new Error(
          `更新包 SHA-256 校验失败（expected=${expectedSha256.slice(0, 12)}…，actual=${actualSha256.slice(0, 12)}…），已丢弃下载`
        );
      }

      // 4) 校验通过，atomic rename partial → 最终 archivePath
      await rename(partialPath, archivePath);

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
      rmSync(partialPath, { force: true });
      const message = error instanceof Error ? error.message : String(error);
      // 按错误消息细分 download / validation：含 "SHA-256" 或 "校验" 关键字的走 validation，
      // 其他（HTTP 下载失败、流中断、文件写入错误）走 download。
      const isValidation = /SHA-256|校验/.test(message);
      return updateState(
        isValidation
          ? toValidationErrorState(message)
          : toDownloadErrorState(message)
      );
    }
  }

  async function installUpdate(): Promise<UpdateState> {
    if (!isPackaged) {
      return state;
    }
    if (!state.downloadedFilePath || !existsSync(state.downloadedFilePath)) {
      return updateState(toInstallErrorState('更新包不存在，请重新下载'));
    }
    if (platform !== 'darwin') {
      return updateState(toInstallErrorState('当前仅支持 macOS 自动安装'));
    }

    const validation = validateDownloadedUpdate({
      latestVersion: state.latestVersion,
      arch,
      assetName: state.assetName,
      downloadedFilePath: state.downloadedFilePath,
    });
    if (!validation.ok) {
      return updateState(toInstallErrorState(validation.message));
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
      return updateState(toInstallErrorState('解压更新包失败'));
    }

    const sourceAppPath = await findAppBundleInDirectory(stageDir);
    if (!sourceAppPath) {
      rmSync(stageDir, { force: true, recursive: true });
      return updateState(toInstallErrorState('更新包中未找到应用程序'));
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
      // 一次性把 updates dir 建好，后续 persistState 走 async writeFile 无需每次 mkdir。
      // 失败安静吞掉：emitState 内部已经把 persistState 错误打到 stderr，不阻塞主流程。
      try {
        await mkdir(persistence.updatesDir, { recursive: true });
      } catch {
        // ignore；async writeFile 失败会被 emitState 的 catch 报告
      }

      const persisted = loadPersistedState();
      state = sanitizePersistedState(options.appVersion, persisted, now());
      emitState();

      if (!isPackaged) {
        return;
      }

      // 启动期清理：删除超过 7 天的 install-update-*.sh 与孤儿 backup app；
      // 这些是上一次安装阶段产生的临时文件，留着会污染 userData/updates/。
      // 同时清理任何遗留的 .partial 文件（上一次下载中断 / 崩溃留下的半截 zip）。
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
            if (entry.isFile() && entry.name.endsWith('.partial')) {
              try {
                rmSync(fullPath, { force: true });
              } catch {
                // 忽略单个 .partial 清理失败，不影响 update 主流程
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
