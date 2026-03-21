import { resolve } from 'node:path';
import process from 'node:process';

export const DESKTOP_ARCHITECTURES = ['arm64', 'x64'];
const ARCH_ALIASES = new Map([
  ['arm64', 'arm64'],
  ['aarch64', 'arm64'],
  ['x64', 'x64'],
  ['x86_64', 'x64'],
  ['amd64', 'x64'],
  ['all', 'all'],
]);
const PRODUCT_NAME = 'HouseholdBalanceSheet';

function isPathCandidate(value) {
  return value.includes('/') || value.includes('\\');
}

function buildPythonExecutablePath(rootDir, venvName, platform) {
  const segments = platform === 'win32'
    ? [venvName, 'Scripts', 'python.exe']
    : [venvName, 'bin', 'python'];

  return resolve(rootDir, ...segments);
}

export function normalizeDesktopArch(value, { allowAll = false } = {}) {
  const rawValue = String(value ?? process.arch).trim().toLowerCase();
  const normalized = ARCH_ALIASES.get(rawValue);

  if (normalized === 'all' && allowAll) {
    return 'all';
  }

  if (normalized && normalized !== 'all') {
    return normalized;
  }

  throw new Error(`不支持的桌面目标架构: ${rawValue}`);
}

export function parseArchFlag(argv, defaultValue = 'all') {
  const archArg = argv.find((value) => value.startsWith('--arch='));
  return archArg ? archArg.slice('--arch='.length) : defaultValue;
}

export function resolveReleaseArchitectures(value = 'all') {
  const normalized = normalizeDesktopArch(value, { allowAll: true });
  return normalized === 'all' ? [...DESKTOP_ARCHITECTURES] : [normalized];
}

export function resolveBackendBundleDir({ desktopRoot, arch }) {
  return resolve(desktopRoot, '../backend/dist-desktop', normalizeDesktopArch(arch));
}

export function resolveReleasePaths(desktopRoot) {
  return {
    makeRoot: resolve(desktopRoot, 'out', 'make'),
    outRoot: resolve(desktopRoot, 'out'),
    releaseRoot: resolve(desktopRoot, 'out', 'release'),
  };
}

export function resolvePythonForArch({
  env = process.env,
  existsSync,
  extraPathCandidates = [],
  fallbackCandidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'],
  hostArch = normalizeDesktopArch(process.arch),
  platform = process.platform,
  projectRoot,
  targetArch,
}) {
  const normalizedArch = normalizeDesktopArch(targetArch);
  const envVarName = `HBS_DESKTOP_PYTHON_${normalizedArch.toUpperCase()}`;
  const candidates = [];
  const explicitCandidate = env[envVarName];

  if (explicitCandidate) {
    candidates.push(explicitCandidate);
  }

  candidates.push(buildPythonExecutablePath(projectRoot, `.venv-${normalizedArch}`, platform));
  candidates.push(...extraPathCandidates);

  if (normalizedArch === hostArch) {
    candidates.push(buildPythonExecutablePath(projectRoot, '.venv', platform), ...fallbackCandidates);
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (isPathCandidate(candidate)) {
      if (existsSync(candidate)) {
        return candidate;
      }
      continue;
    }

    return candidate;
  }

  throw new Error(
    `缺少用于构建 ${normalizedArch} 桌面后端的 Python 解释器。请设置 ${envVarName}，或准备 ${buildPythonExecutablePath(
      projectRoot,
      `.venv-${normalizedArch}`,
      platform
    )}。`
  );
}

export function buildReleaseArtifactName({
  arch,
  extension,
  productName = PRODUCT_NAME,
  version,
}) {
  return `${productName}-${version}-macos-${normalizeDesktopArch(arch)}.${extension}`;
}
