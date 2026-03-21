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

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const desktopRoot = resolve(scriptDir, '..');
const packageJsonPath = resolve(desktopRoot, 'package.json');

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

function collectArtifacts(makeRoot, arch) {
  if (!statSafe(makeRoot)?.isDirectory()) {
    return [];
  }

  return walkFiles(makeRoot).filter((filePath) => isMatchingArtifactPath(filePath, arch));
}

function readPackageVersion() {
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;
}

export function makeMacOSRelease(targetArchOption = 'all') {
  const architectures = resolveReleaseArchitectures(targetArchOption);
  const version = readPackageVersion();
  const { makeRoot, outRoot, releaseRoot } = resolveReleasePaths(desktopRoot);

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
      'npx',
      [
        'electron-forge',
        'make',
        `--arch=${arch}`,
        '--targets=@electron-forge/maker-dmg,@electron-forge/maker-zip',
      ],
      desktopRoot
    );

    for (const artifactPath of collectArtifacts(makeRoot, arch)) {
      const extension = artifactPath.toLowerCase().endsWith('.dmg') ? 'dmg' : 'zip';
      const releasePath = resolve(
        releaseRoot,
        buildReleaseArtifactName({
          arch,
          extension,
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
  makeMacOSRelease(parseArchFlag(process.argv));
}
