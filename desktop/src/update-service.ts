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

function findMatchingAsset(
  release: GithubRelease,
  version: string,
  arch: 'arm64' | 'x64'
): UpdateAssetCandidate | null {
  const expectedName = `HouseholdBalanceSheet-${version}-macos-${arch}.zip`;
  const asset = release.assets.find((item) => item.name === expectedName);
  if (!asset) {
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
    .filter((value): value is { release: GithubRelease; version: string } => value !== null)
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
