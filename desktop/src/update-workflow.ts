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
