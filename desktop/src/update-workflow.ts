import { basename } from 'node:path';

export type GithubReleaseAsset = {
  name: string;
  browser_download_url: string;
  size?: number;
};

export type GithubRelease = {
  tag_name: string;
  name?: string;
  html_url?: string;
  draft: boolean;
  prerelease: boolean;
  published_at?: string;
  assets: GithubReleaseAsset[];
};

export type UpdateAssetCandidate = {
  name: string;
  url: string;
  size?: number;
};

export type UpdateCandidate = {
  version: string;
  tagName: string;
  title?: string;
  releaseUrl?: string;
  publishedAt?: string;
  asset: UpdateAssetCandidate;
  /** 可选：与 asset 同名的 .sha256 校验文件 URL，用于下载后做完整性校验。 */
  sha256AssetUrl?: string;
};

export type PickUpdateCandidateOptions = {
  currentVersion: string;
  arch: 'arm64' | 'x64';
  releases: GithubRelease[];
};

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'preparing'
  | 'installing'
  | 'error';

/**
 * 更新流程的错误分类。
 *
 * - `network`：fetch releases 失败 / HTTP 非 2xx（含 403 限速、429、5xx、断网）。
 *   这类错误属于环境问题，不应该打扰用户；控制器会把状态降级到上一次成功结论，
 *   **不会**进入 `status: 'error'`。
 * - `download`：下载阶段失败（HTTP 下载错误、流中断）。
 * - `validation`：下载完成但校验失败（sha256 不匹配、asset 缺失、包格式错）。
 * - `install`：安装阶段失败（解压失败、未找到 .app、ditto 失败等）。
 *
 * 后三类属于用户可操作的错误，会进入 `status: 'error'` 并在左下角显示重试入口。
 */
export type UpdateErrorKind = 'network' | 'download' | 'validation' | 'install';

export type UpdateState = {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  releaseTag?: string;
  releaseUrl?: string;
  assetName?: string;
  assetUrl?: string;
  /** 与 assetUrl 同一 release 中 `<assetName>.sha256` 配套校验文件的下载 URL。 */
  sha256AssetUrl?: string;
  /** 下载阶段计算并校验通过的 SHA-256，便于安装阶段二次确认。 */
  verifiedSha256?: string;
  downloadedFilePath?: string;
  downloadedAt?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  progress?: number;
  lastCheckedAt?: number;
  errorMessage?: string;
  error?: string;
  /**
   * 仅 `status === 'error'` 时有值，用于 UI 细分错误文案与点击动作。
   * 网络类错误不会进入 error 状态，因此理论上不会出现 `'network'`。
   * 保留该值作为旧 state.json 兼容兜底。
   */
  errorKind?: UpdateErrorKind;
  /** 上一次成功 fetch releases 的时间戳（毫秒），用于网络失败时降级决策。 */
  lastSuccessfulCheckAt?: number;
  /**
   * 上一次成功检查得到的最新版本号；`null` 表示"当时确认无新版本"。
   * 与 `lastSuccessfulCheckAt` 一同作为"已知世界状态"，网络降级时不丢失。
   */
  lastKnownLatestVersion?: string | null;
  /** 最近一次网络类检查失败的时间戳（毫秒），用于诊断与退避决策。 */
  lastNetworkErrorAt?: number;
  /** 连续网络类检查失败次数；成功一次归零；用于计算退避轮询间隔。 */
  consecutiveNetworkFailures?: number;
};

function normalizeVersion(version: string): string {
  const matched = version.trim().match(/(\d+)\.(\d+)\.(\d+)/);
  if (!matched) {
    return '0.0.0';
  }

  return `${matched[1]}.${matched[2]}.${matched[3]}`;
}

export function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left).split('.').map(Number);
  const rightParts = normalizeVersion(right).split('.').map(Number);

  for (let index = 0; index < 3; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function parseReleaseVersion(tagName: string): string | null {
  const matched = tagName.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!matched) {
    return null;
  }

  return `${matched[1]}.${matched[2]}.${matched[3]}`;
}

export function buildExpectedAssetName(
  version: string,
  arch: 'arm64' | 'x64'
): string {
  return `HouseholdBalanceSheet-${version}-macos-${arch}.zip`;
}

function findMatchingAsset(
  release: GithubRelease,
  version: string,
  arch: 'arm64' | 'x64'
): UpdateAssetCandidate | null {
  const expectedName = buildExpectedAssetName(version, arch);
  const asset = release.assets.find((item) => item.name === expectedName);
  if (
    !asset ||
    !asset.browser_download_url ||
    !asset.name.toLowerCase().endsWith('.zip')
  ) {
    return null;
  }

  return {
    name: asset.name,
    url: asset.browser_download_url,
    size: asset.size,
  };
}

/**
 * 在 release 资产列表中找到 `<assetName>.sha256` 配套校验文件（不区分大小写）。
 *
 * 该校验文件应仅包含 64 位十六进制 SHA-256 摘要（可选附文件名），由发版流水线生成并上传。
 * 找不到时返回 null，调用方可决定是否拒绝此 release 或继续宽松接收。
 */
export function findSha256AssetUrl(
  release: GithubRelease,
  assetName: string
): string | null {
  const expected = `${assetName}.sha256`.toLowerCase();
  const match = release.assets.find(
    (item) => item.name?.toLowerCase() === expected
  );
  return match?.browser_download_url ?? null;
}

/**
 * 解析 `.sha256` 文件内容为纯小写 64 位十六进制摘要。
 *
 * 支持以下两种常见格式：
 *   "abc...def\n"
 *   "abc...def  HouseholdBalanceSheet-1.2.3-macos-arm64.zip\n"
 */
export function parseSha256File(content: string): string | null {
  const firstToken = content.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!/^[0-9a-f]{64}$/.test(firstToken)) {
    return null;
  }
  return firstToken;
}

/**
 * 比较计算得到的 SHA-256 与期望摘要。大小写不敏感；任一侧不是合法 64 位十六进制时返回 false。
 */
export function verifySha256(actual: string, expected: string): boolean {
  const normalizedActual = actual.toLowerCase();
  const normalizedExpected = expected.toLowerCase();
  if (
    !/^[0-9a-f]{64}$/.test(normalizedActual) ||
    !/^[0-9a-f]{64}$/.test(normalizedExpected)
  ) {
    return false;
  }
  return normalizedActual === normalizedExpected;
}

export function pickUpdateCandidate(
  options: PickUpdateCandidateOptions
): UpdateCandidate | null {
  const stableReleases = options.releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => {
      const version = parseReleaseVersion(release.tag_name);
      return version ? { release, version } : null;
    })
    .filter(
      (value): value is { release: GithubRelease; version: string } =>
        value !== null
    )
    .sort((left, right) => compareVersions(right.version, left.version));

  for (const item of stableReleases) {
    if (compareVersions(item.version, options.currentVersion) <= 0) {
      continue;
    }

    const asset = findMatchingAsset(item.release, item.version, options.arch);
    if (!asset) {
      continue;
    }

    const sha256AssetUrl = findSha256AssetUrl(item.release, asset.name);

    return {
      version: item.version,
      tagName: item.release.tag_name,
      title: item.release.name,
      releaseUrl: item.release.html_url,
      publishedAt: item.release.published_at,
      asset,
      sha256AssetUrl: sha256AssetUrl ?? undefined,
    };
  }

  return null;
}

export function createDefaultUpdateState(appVersion: string): UpdateState {
  return {
    status: 'idle',
    currentVersion: appVersion,
  };
}

export function applyUpdateStateTransition(
  state: UpdateState,
  next: Partial<UpdateState>
): UpdateState {
  return {
    ...state,
    ...next,
  };
}

export function toAvailableState(options: {
  currentVersion: string;
  candidate: UpdateCandidate;
}): Partial<UpdateState> {
  return {
    status: 'available',
    currentVersion: options.currentVersion,
    latestVersion: options.candidate.version,
    releaseTag: options.candidate.tagName,
    releaseUrl: options.candidate.releaseUrl,
    assetName: options.candidate.asset.name,
    assetUrl: options.candidate.asset.url,
    sha256AssetUrl: options.candidate.sha256AssetUrl,
    verifiedSha256: undefined,
    totalBytes: options.candidate.asset.size,
    errorMessage: undefined,
    error: undefined,
  };
}

export function toDownloadedState(options: {
  downloadedFilePath: string;
  downloadedAt: string;
  downloadedBytes?: number;
  totalBytes?: number;
  verifiedSha256?: string;
}): Partial<UpdateState> {
  return {
    status: 'downloaded',
    downloadedFilePath: options.downloadedFilePath,
    downloadedAt: options.downloadedAt,
    downloadedBytes: options.downloadedBytes,
    totalBytes: options.totalBytes,
    verifiedSha256: options.verifiedSha256,
    progress: 100,
    errorMessage: undefined,
    error: undefined,
  };
}

export function toPreparingInstallState(): Partial<UpdateState> {
  return {
    status: 'preparing',
    errorMessage: undefined,
    error: undefined,
  };
}

export function toInstallingState(): Partial<UpdateState> {
  return {
    status: 'installing',
    errorMessage: undefined,
    error: undefined,
  };
}

export function toErrorState(message: string): Partial<UpdateState> {
  return {
    status: 'error',
    progress: undefined,
    errorMessage: message,
    error: message,
  };
}

/**
 * 网络类检查失败的降级状态片段。
 *
 * **关键设计**：返回的 Partial 仅包含"本次网络失败新增的诊断字段"，不覆盖 previousState
 * 的任何既有业务字段（包括 status / errorKind / errorMessage）。
 * 这样 previousState 若是"下载失败等待重试"（status=error, errorMessage='下载中断'），
 * 网络降级后 UI 仍显示那个下载错误；若 previousState 是 idle，网络降级后仍 idle。
 *
 * 这是"网络失败永远不进 error 状态、也不清洗历史错误状态"的治本措施。
 */
export function toNetworkDegradedState(options: {
  previousState: UpdateState;
  now: number;
}): Partial<UpdateState> {
  return {
    lastNetworkErrorAt: options.now,
    consecutiveNetworkFailures:
      (options.previousState.consecutiveNetworkFailures ?? 0) + 1,
  };
}

export function toDownloadErrorState(message: string): Partial<UpdateState> {
  return {
    status: 'error',
    errorKind: 'download',
    progress: undefined,
    errorMessage: message,
    error: message,
  };
}

export function toValidationErrorState(message: string): Partial<UpdateState> {
  return {
    status: 'error',
    errorKind: 'validation',
    progress: undefined,
    errorMessage: message,
    error: message,
  };
}

export function toInstallErrorState(message: string): Partial<UpdateState> {
  return {
    status: 'error',
    errorKind: 'install',
    progress: undefined,
    errorMessage: message,
    error: message,
  };
}

/**
 * checkForUpdates 成功分支共用的"健康跟踪重置"字段。
 *
 * 把 lastSuccessfulCheckAt 推到当前时间、consecutiveNetworkFailures 清零、
 * lastNetworkErrorAt 清掉，让下一轮轮询能从干净的基线出发。
 */
export function successfulCheckHealthFields(options: {
  now: number;
  latestVersion: string | null;
}): Partial<UpdateState> {
  return {
    lastSuccessfulCheckAt: options.now,
    consecutiveNetworkFailures: 0,
    lastNetworkErrorAt: undefined,
    lastKnownLatestVersion: options.latestVersion,
  };
}

export function validateDownloadedUpdate(options: {
  latestVersion?: string;
  arch: 'arm64' | 'x64';
  assetName?: string;
  downloadedFilePath: string;
}):
  | { ok: true }
  | {
      ok: false;
      message: string;
    } {
  const candidateName =
    options.assetName || basename(options.downloadedFilePath || '');

  if (!candidateName.toLowerCase().endsWith('.zip')) {
    return {
      ok: false,
      message: '更新包格式无效，仅支持 zip 安装包',
    };
  }

  if (!options.latestVersion) {
    return {
      ok: false,
      message: '缺少目标版本信息，请重新检查更新',
    };
  }

  const expectedName = buildExpectedAssetName(options.latestVersion, options.arch);
  if (candidateName !== expectedName) {
    return {
      ok: false,
      message: '更新包与当前设备架构或目标版本不匹配',
    };
  }

  return { ok: true };
}
