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

    return {
      version: item.version,
      tagName: item.release.tag_name,
      title: item.release.name,
      releaseUrl: item.release.html_url,
      publishedAt: item.release.published_at,
      asset,
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
}): Partial<UpdateState> {
  return {
    status: 'downloaded',
    downloadedFilePath: options.downloadedFilePath,
    downloadedAt: options.downloadedAt,
    downloadedBytes: options.downloadedBytes,
    totalBytes: options.totalBytes,
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
