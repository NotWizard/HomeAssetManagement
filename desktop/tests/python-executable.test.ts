import assert from 'node:assert/strict';
import test from 'node:test';

test('开发态 Python 解释器回退会按 venv -> python3 -> python 顺序选择', async () => {
  const module = await import('../src/python-executable.ts');

  const picked = module.resolvePythonExecutable({
    projectRoot: '/repo/HomeAssetManagement',
    platform: 'darwin',
    existsSync(path: string) {
      // Pretend venv does not exist.
      return path.includes('.venv') ? false : false;
    },
    isCommandAvailable(command: string) {
      return command === 'python';
    },
  });

  assert.equal(picked, 'python');
});

