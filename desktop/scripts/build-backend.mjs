import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const desktopRoot = resolve(scriptDir, '..');
const projectRoot = resolve(desktopRoot, '..');
const buildScriptPath = resolve(projectRoot, 'backend/build_desktop.py');

const candidateExecutables = process.platform === 'win32'
  ? [
      resolve(projectRoot, '.venv/Scripts/python.exe'),
      'python',
      'python3',
    ]
  : [
      resolve(projectRoot, '.venv/bin/python'),
      'python3',
      'python',
    ];

const pythonExecutable = candidateExecutables.find((value) =>
  value.includes('/') ? existsSync(value) : true
);

if (!pythonExecutable) {
  throw new Error('未找到可用的 Python 解释器，无法构建桌面后端。');
}

const result = spawnSync(pythonExecutable, [buildScriptPath], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
