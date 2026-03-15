import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const desktopRoot = resolve(scriptDir, '..');
const stageRoot = resolve(desktopRoot, '.stage');
const frontendSourceDir = resolve(desktopRoot, '../frontend/dist');
const frontendTargetDir = resolve(stageRoot, 'frontend-dist');
const backendSourceDir = resolve(desktopRoot, '../backend/dist-desktop');
const backendTargetDir = resolve(stageRoot, 'backend');

rmSync(stageRoot, { force: true, recursive: true });
mkdirSync(stageRoot, { recursive: true });

if (!existsSync(frontendSourceDir)) {
  throw new Error(`缺少前端构建产物，请先执行 frontend build: ${frontendSourceDir}`);
}

cpSync(frontendSourceDir, frontendTargetDir, { recursive: true });

if (!existsSync(backendSourceDir)) {
  throw new Error(`缺少后端桌面二进制目录，请先执行 backend build: ${backendSourceDir}`);
}

cpSync(backendSourceDir, backendTargetDir, { recursive: true });
