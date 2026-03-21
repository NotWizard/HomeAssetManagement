import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeDesktopArch,
  parseArchFlag,
  resolveBackendBundleDir,
} from './release-utils.mjs';

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const desktopRoot = resolve(scriptDir, '..');
const stageRoot = resolve(desktopRoot, '.stage');
const frontendSourceDir = resolve(desktopRoot, '../frontend/dist');
const frontendTargetDir = resolve(stageRoot, 'frontend-dist');
const backendTargetDir = resolve(stageRoot, 'backend');

export function stageResources(targetArch) {
  const normalizedArch = normalizeDesktopArch(targetArch);
  const backendSourceDir = resolveBackendBundleDir({
    arch: normalizedArch,
    desktopRoot,
  });

  rmSync(stageRoot, { force: true, recursive: true });
  mkdirSync(stageRoot, { recursive: true });

  if (!existsSync(frontendSourceDir)) {
    throw new Error(`缺少前端构建产物，请先执行 frontend build: ${frontendSourceDir}`);
  }

  cpSync(frontendSourceDir, frontendTargetDir, { recursive: true });

  if (!existsSync(backendSourceDir)) {
    throw new Error(
      `缺少 ${normalizedArch} 架构的后端桌面二进制目录，请先执行 backend build: ${backendSourceDir}`
    );
  }

  cpSync(backendSourceDir, backendTargetDir, { recursive: true });
}

function isDirectExecution() {
  return process.argv[1] && resolve(process.argv[1]) === scriptFile;
}

if (isDirectExecution()) {
  stageResources(parseArchFlag(process.argv, process.arch));
}
