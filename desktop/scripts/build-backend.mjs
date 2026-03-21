import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeDesktopArch, parseArchFlag, resolvePythonForArch } from './release-utils.mjs';

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const desktopRoot = resolve(scriptDir, '..');
const projectRoot = resolve(desktopRoot, '..');
const buildScriptPath = resolve(projectRoot, 'backend/build_desktop.py');

function buildPythonExecutablePath(rootDir, venvName) {
  const segments = process.platform === 'win32'
    ? [venvName, 'Scripts', 'python.exe']
    : [venvName, 'bin', 'python'];

  return resolve(rootDir, ...segments);
}

function resolveSharedWorkspaceRoot() {
  const result = spawnSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return resolve(result.stdout.trim(), '..');
}

export function buildPythonLaunchSpec(pythonExecutable, targetArch) {
  const normalizedArch = normalizeDesktopArch(targetArch);
  const scriptArgs = [buildScriptPath, `--arch=${normalizedArch}`];

  if (process.platform !== 'darwin') {
    return {
      args: scriptArgs,
      command: pythonExecutable,
    };
  }

  return {
    args: [normalizedArch === 'x64' ? '-x86_64' : '-arm64', pythonExecutable, ...scriptArgs],
    command: 'arch',
  };
}

export function buildBackendBundle(targetArch) {
  const normalizedArch = normalizeDesktopArch(targetArch);
  const sharedWorkspaceRoot = resolveSharedWorkspaceRoot();
  const extraPathCandidates = sharedWorkspaceRoot
    ? [
        buildPythonExecutablePath(sharedWorkspaceRoot, `.venv-${normalizedArch}`),
        buildPythonExecutablePath(sharedWorkspaceRoot, '.venv'),
      ]
    : [];
  const pythonExecutable = resolvePythonForArch({
    env: process.env,
    existsSync,
    extraPathCandidates,
    projectRoot,
    targetArch: normalizedArch,
  });
  const launchSpec = buildPythonLaunchSpec(pythonExecutable, normalizedArch);

  const result = spawnSync(launchSpec.command, launchSpec.args, {
    cwd: projectRoot,
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

function isDirectExecution() {
  return process.argv[1] && resolve(process.argv[1]) === scriptFile;
}

if (isDirectExecution()) {
  buildBackendBundle(parseArchFlag(process.argv, process.arch));
}
