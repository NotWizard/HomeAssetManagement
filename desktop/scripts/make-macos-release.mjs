import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseArchFlag,
  resolveReleaseArchitectures,
  resolveReleasePaths,
} from './release-utils.mjs';
import { buildDmgArtifact, resolveAppPath } from './build-dmg.mjs';
import {
  buildSignedZipArtifact,
  resolveMacReleaseSecurityConfig,
  signAndNotarizeApp,
  verifySignedApp,
} from './macos-release-security.mjs';

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const desktopRoot = resolve(scriptDir, '..');
const packageJsonPath = resolve(desktopRoot, 'package.json');
const electronForgeCliPath = resolve(
  desktopRoot,
  'node_modules',
  '@electron-forge',
  'cli',
  'dist',
  'electron-forge.js'
);

function runSubprocessCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function isMatchingArtifactPath(filePath, arch) {
  const lowerPath = filePath.toLowerCase();
  return lowerPath.includes(`-${arch}`) && (lowerPath.endsWith('.dmg') || lowerPath.endsWith('.zip'));
}

function readPackageVersion() {
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;
}

async function loadDmgVisualConfig() {
  const forgeModule = await import('../forge.config.ts');
  if (!forgeModule.dmgVisualConfig) {
    throw new Error('forge.config.ts 未导出 dmgVisualConfig');
  }
  return forgeModule.dmgVisualConfig;
}

export async function makeMacOSRelease(targetArchOption = 'all', overrides = {}) {
  const architectures = resolveReleaseArchitectures(targetArchOption);
  const version = readPackageVersion();
  const { makeRoot, outRoot, releaseRoot } = resolveReleasePaths(desktopRoot);
  const {
    buildDmgArtifact: buildDmgArtifactOverride = buildDmgArtifact,
    buildSignedZipArtifact: buildSignedZipArtifactOverride = buildSignedZipArtifact,
    loadDmgVisualConfig: loadDmgVisualConfigOverride = loadDmgVisualConfig,
    runCommand = runSubprocessCommand,
    resolveAppPath: resolveAppPathOverride = resolveAppPath,
    resolveSecurityConfig: resolveSecurityConfigOverride = resolveMacReleaseSecurityConfig,
    signAndNotarizeApp: signAndNotarizeAppOverride = signAndNotarizeApp,
    verifySignedApp: verifySignedAppOverride = verifySignedApp,
  } = overrides;
  const dmgConfig = await loadDmgVisualConfigOverride();
  const securityConfig = resolveSecurityConfigOverride();

  rmSync(makeRoot, { force: true, recursive: true });
  rmSync(releaseRoot, { force: true, recursive: true });
  mkdirSync(outRoot, { recursive: true });
  mkdirSync(releaseRoot, { recursive: true });

  runCommand('npm', ['--prefix', '../frontend', 'run', 'build'], desktopRoot);
  runCommand('npm', ['run', 'build'], desktopRoot);

  for (const arch of architectures) {
    runCommand('node', ['./scripts/build-backend.mjs', `--arch=${arch}`], desktopRoot);
    runCommand('node', ['./scripts/stage-resources.mjs', `--arch=${arch}`], desktopRoot);
    runCommand(
      'node',
      [
        electronForgeCliPath,
        'make',
        `--arch=${arch}`,
        '--targets=@electron-forge/maker-zip',
      ],
      desktopRoot
    );

    // forge make 已产出 ProductName-darwin-<arch>/ProductName.app + zip。
    // 先对 .app 做 codesign/notarize，再用这份已签名 bundle 生成 dmg / zip。
    const appPath = resolveAppPathOverride({ makeRoot, productName: 'HouseholdBalanceSheet', arch });
    if (securityConfig.enabled) {
      await signAndNotarizeAppOverride({ appPath, securityConfig });
      verifySignedAppOverride({ appPath });
    }
    buildDmgArtifactOverride({
      appPath,
      arch,
      version,
      releaseDir: releaseRoot,
      dmgConfig,
    });
    buildSignedZipArtifactOverride({
      appPath,
      arch,
      version,
      releaseDir: releaseRoot,
    });
  }
}

function isDirectExecution() {
  return process.argv[1] && resolve(process.argv[1]) === scriptFile;
}

if (isDirectExecution()) {
  makeMacOSRelease(parseArchFlag(process.argv)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
