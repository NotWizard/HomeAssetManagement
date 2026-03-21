import assert from 'node:assert/strict';
import test from 'node:test';

test('发布工具会归一化桌面目标架构', async () => {
  const releaseUtils = await import('../scripts/release-utils.mjs');

  assert.equal(releaseUtils.normalizeDesktopArch('arm64'), 'arm64');
  assert.equal(releaseUtils.normalizeDesktopArch('x86_64'), 'x64');
  assert.equal(releaseUtils.normalizeDesktopArch('amd64'), 'x64');
});

test('构建 x64 sidecar 时会优先选择专用 Python 解释器', async () => {
  const releaseUtils = await import('../scripts/release-utils.mjs');

  const python = releaseUtils.resolvePythonForArch({
    env: {},
    existsSync: (value: string) => value === '/repo/.venv-x64/bin/python',
    fallbackCandidates: [],
    projectRoot: '/repo',
    targetArch: 'x64',
  });

  assert.equal(python, '/repo/.venv-x64/bin/python');
});

test('构建非宿主架构但缺少专用 Python 时会给出清晰错误', async () => {
  const releaseUtils = await import('../scripts/release-utils.mjs');

  assert.throws(
    () =>
      releaseUtils.resolvePythonForArch({
        env: {},
        existsSync: () => false,
        fallbackCandidates: [],
        projectRoot: '/repo',
        targetArch: 'x64',
      }),
    /HBS_DESKTOP_PYTHON_X64|\.venv-x64/
  );
});

test('macOS 下会按目标架构显式选择 Python slice', async () => {
  const buildBackendScript = await import('../scripts/build-backend.mjs');

  const launchSpec = buildBackendScript.buildPythonLaunchSpec('/repo/.venv-x64/bin/python', 'x64');

  assert.equal(launchSpec.command, 'arch');
  assert.equal(launchSpec.args[0], '-x86_64');
  assert.equal(launchSpec.args[1], '/repo/.venv-x64/bin/python');
});
