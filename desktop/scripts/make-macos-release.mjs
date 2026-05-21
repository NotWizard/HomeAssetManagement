import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildReleaseArtifactName,
  parseArchFlag,
  resolveReleaseArchitectures,
  resolveReleasePaths,
} from './release-utils.mjs';
import { buildDmgArtifact, resolveAppPath } from './build-dmg.mjs';

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

function runCommand(command, args, cwd) {
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

function statSafe(filePath) {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

function walkFiles(rootDir) {
  return readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = resolve(rootDir, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(fullPath);
    }
    return [fullPath];
  });
}

export function isMatchingArtifactPath(filePath, arch) {
  const lowerPath = filePath.toLowerCase();
  return lowerPath.includes(`-${arch}`) && (lowerPath.endsWith('.dmg') || lowerPath.endsWith('.zip'));
}

function collectZipArtifacts(makeRoot, arch) {
  if (!statSafe(makeRoot)?.isDirectory()) {
    return [];
  }

  return walkFiles(makeRoot).filter(
    (filePath) => filePath.toLowerCase().endsWith('.zip') && filePath.toLowerCase().includes(`-${arch}`)
  );
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

export async function makeMacOSRelease(targetArchOption = 'all') {
  const architectures = resolveReleaseArchitectures(targetArchOption);
  const version = readPackageVersion();
  const { makeRoot, outRoot, releaseRoot } = resolveReleasePaths(desktopRoot);
  const dmgConfig = await loadDmgVisualConfig();

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
    // dmg 这一步改用 macOS 自带 hdiutil 自制，避开 maker-dmg 那条会被 Node 版本影响的
    // appdmg/macos-alias 原生编译链路。
    const appPath = resolveAppPath({ makeRoot, productName: 'HouseholdBalanceSheet', arch });
    buildDmgArtifact({
      appPath,
      arch,
      version,
      releaseDir: releaseRoot,
      dmgConfig,
    });

    for (const artifactPath of collectZipArtifacts(makeRoot, arch)) {
      const releasePath = resolve(
        releaseRoot,
        buildReleaseArtifactName({
          arch,
          extension: 'zip',
          version,
        })
      );
      cpSync(artifactPath, releasePath);
    }
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
