import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('发布脚本会展开 all 为双架构列表', async () => {
  const releaseUtils = await import('../scripts/release-utils.mjs');

  assert.deepEqual(releaseUtils.resolveReleaseArchitectures('all'), ['arm64', 'x64']);
  assert.deepEqual(releaseUtils.resolveReleaseArchitectures('arm64'), ['arm64']);
});

test('发布脚本会生成稳定的制品文件名', async () => {
  const releaseUtils = await import('../scripts/release-utils.mjs');

  assert.equal(
    releaseUtils.buildReleaseArtifactName({
      arch: 'x64',
      extension: 'dmg',
      version: '0.1.0',
    }),
    'HouseholdBalanceSheet-0.1.0-macos-x64.dmg'
  );
});

test('发布脚本会识别 Forge 生成的 dmg 与 zip 路径', async () => {
  const releaseScript = await import('../scripts/make-macos-release.mjs');

  assert.equal(
    releaseScript.isMatchingArtifactPath(
      '/tmp/out/make/HouseholdBalanceSheet-0.1.0-arm64.dmg',
      'arm64'
    ),
    true
  );
  assert.equal(
    releaseScript.isMatchingArtifactPath(
      '/tmp/out/make/zip/darwin/arm64/HouseholdBalanceSheet-darwin-arm64-0.1.0.zip',
      'arm64'
    ),
    true
  );
});

test('macOS release 安全配置缺失时会阻止发布，避免上传 Gatekeeper 会判坏的包', async () => {
  const signing = await import('../scripts/macos-release-security.mjs');

  assert.throws(
    () =>
      signing.resolveMacReleaseSecurityConfig({
        env: {},
        requireSigning: true,
      }),
    /缺少 macOS 发布签名配置/
  );
});

test('macOS release 安全配置会从环境变量解析签名与公证凭据', async () => {
  const signing = await import('../scripts/macos-release-security.mjs');

  const config = signing.resolveMacReleaseSecurityConfig({
    env: {
      HBS_MACOS_CODESIGN_IDENTITY: 'Developer ID Application: Example Inc (TEAM123456)',
      HBS_MACOS_NOTARY_KEYCHAIN_PROFILE: 'hbs-notary',
      HBS_MACOS_NOTARY_KEYCHAIN: '/tmp/notary.keychain-db',
    },
    requireSigning: true,
  });

  assert.deepEqual(config, {
    enabled: true,
    mode: 'developer-id',
    identity: 'Developer ID Application: Example Inc (TEAM123456)',
    keychain: undefined,
    notarize: {
      keychainProfile: 'hbs-notary',
      keychain: '/tmp/notary.keychain-db',
    },
  });
});

test('unsigned release 模式会启用 ad-hoc 签名并跳过公证要求', async () => {
  const signing = await import('../scripts/macos-release-security.mjs');

  const config = signing.resolveMacReleaseSecurityConfig({
    env: {
      CI: 'true',
      HBS_MACOS_RELEASE_MODE: 'unsigned',
    },
  });

  assert.deepEqual(config, {
    enabled: true,
    mode: 'unsigned',
    identity: '-',
    notarize: null,
  });
});

test('发布 ZIP 会从签名后的 app 重新生成并写出 sha256 校验文件', async () => {
  const signing = await import('../scripts/macos-release-security.mjs');
  const tempRoot = mkdtempSync(join(tmpdir(), 'hbs-release-zip-test-'));

  try {
    const appPath = join(tempRoot, 'HouseholdBalanceSheet.app');
    const contentsPath = join(appPath, 'Contents');
    const releaseRoot = join(tempRoot, 'release');
    mkdirSync(contentsPath, { recursive: true });
    writeFileSync(join(contentsPath, 'Info.plist'), 'signed app marker');

    const commandCalls = [];
    const result = signing.buildSignedZipArtifact({
      appPath,
      arch: 'arm64',
      version: '0.3.1',
      releaseDir: releaseRoot,
      runCommand: (command, args, cwd) => {
        commandCalls.push({ command, args, cwd });
        writeFileSync(args.at(-1), 'zip-bytes');
      },
    });

    assert.equal(
      result.zipPath,
      join(releaseRoot, 'HouseholdBalanceSheet-0.3.1-macos-arm64.zip')
    );
    assert.equal(
      readFileSync(`${result.zipPath}.sha256`, 'utf8'),
      `${result.sha256}  HouseholdBalanceSheet-0.3.1-macos-arm64.zip\n`
    );
    assert.equal(commandCalls.length, 1);
    assert.deepEqual(commandCalls[0]?.args, [
      '-c',
      '-k',
      '--keepParent',
      appPath,
      result.zipPath,
    ]);
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
});

test('签名流程会把 Developer ID identity 与公证凭据传给 Electron 工具链', async () => {
  const signing = await import('../scripts/macos-release-security.mjs');
  const tempRoot = mkdtempSync(join(tmpdir(), 'hbs-release-sign-test-'));

  try {
    const appPath = join(tempRoot, 'HouseholdBalanceSheet.app');
    mkdirSync(join(appPath, 'Contents'), { recursive: true });
    const signCalls = [];
    const notarizeCalls = [];

    const result = await signing.signAndNotarizeApp({
      appPath,
      securityConfig: {
        enabled: true,
        identity: 'Developer ID Application: Example Inc (TEAM123456)',
        keychain: '/tmp/login.keychain-db',
        notarize: {
          keychainProfile: 'hbs-notary',
          keychain: '/tmp/notary.keychain-db',
        },
      },
      osxSignModule: {
        signAsync: async (options) => {
          signCalls.push(options);
        },
      },
      notarizeModule: {
        notarize: async (options) => {
          notarizeCalls.push(options);
        },
      },
    });

    assert.equal(result, true);
    assert.deepEqual(signCalls, [
      {
        app: appPath,
        identity: 'Developer ID Application: Example Inc (TEAM123456)',
        keychain: '/tmp/login.keychain-db',
        platform: 'darwin',
        hardenedRuntime: true,
        strictVerify: true,
        preAutoEntitlements: false,
        preEmbedProvisioningProfile: false,
      },
    ]);
    assert.deepEqual(notarizeCalls, [
      {
        tool: 'notarytool',
        appPath,
        keychainProfile: 'hbs-notary',
        keychain: '/tmp/notary.keychain-db',
      },
    ]);
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
});

test('unsigned 签名流程跳过 osx-sign，直接走系统 codesign ad-hoc', async () => {
  const signing = await import('../scripts/macos-release-security.mjs');
  const tempRoot = mkdtempSync(join(tmpdir(), 'hbs-release-adhoc-sign-test-'));

  try {
    const appPath = join(tempRoot, 'HouseholdBalanceSheet.app');
    mkdirSync(join(appPath, 'Contents'), { recursive: true });
    const signCalls = [];
    const notarizeCalls = [];
    const commandCalls = [];

    const result = await signing.signAndNotarizeApp({
      appPath,
      securityConfig: {
        enabled: true,
        mode: 'unsigned',
        identity: '-',
        notarize: null,
      },
      osxSignModule: {
        signAsync: async (options) => {
          signCalls.push(options);
        },
      },
      notarizeModule: {
        notarize: async (options) => {
          notarizeCalls.push(options);
        },
      },
      runCommand: (command, args, cwd) => {
        commandCalls.push({ command, args, cwd });
      },
    });

    assert.equal(result, true);
    assert.deepEqual(signCalls, []);
    assert.deepEqual(notarizeCalls, []);
    assert.deepEqual(commandCalls, [
      {
        command: 'codesign',
        args: ['--force', '--deep', '--sign', '-', appPath],
        cwd: tempRoot,
      },
    ]);
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
});

test('签名验收会同时跑 codesign 与 spctl', async () => {
  const signing = await import('../scripts/macos-release-security.mjs');
  const tempRoot = mkdtempSync(join(tmpdir(), 'hbs-release-verify-test-'));

  try {
    const appPath = join(tempRoot, 'HouseholdBalanceSheet.app');
    mkdirSync(join(appPath, 'Contents'), { recursive: true });
    const calls = [];

    signing.verifySignedApp({
      appPath,
      runCommand: (command, args, cwd) => {
        calls.push({ command, args, cwd });
      },
    });

    assert.deepEqual(calls, [
      {
        command: 'codesign',
        args: ['--verify', '--deep', '--strict', '--verbose=4', appPath],
        cwd: tempRoot,
      },
      {
        command: 'spctl',
        args: ['-a', '-vvv', '-t', 'exec', appPath],
        cwd: tempRoot,
      },
    ]);
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
});

test('unsigned 签名验收只跑 codesign，避免把未公证包误判为构建失败', async () => {
  const signing = await import('../scripts/macos-release-security.mjs');
  const tempRoot = mkdtempSync(join(tmpdir(), 'hbs-release-adhoc-verify-test-'));

  try {
    const appPath = join(tempRoot, 'HouseholdBalanceSheet.app');
    mkdirSync(join(appPath, 'Contents'), { recursive: true });
    const calls = [];

    signing.verifySignedApp({
      appPath,
      securityConfig: {
        enabled: true,
        mode: 'unsigned',
      },
      runCommand: (command, args, cwd) => {
        calls.push({ command, args, cwd });
      },
    });

    assert.deepEqual(calls, [
      {
        command: 'codesign',
        args: ['--verify', '--verbose=4', appPath],
        cwd: tempRoot,
      },
    ]);
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
});

test('主发布流程在启用安全配置时会签名、公证、验签并重打 zip', async () => {
  const releaseScript = await import('../scripts/make-macos-release.mjs');
  const tempRoot = mkdtempSync(join(tmpdir(), 'hbs-release-main-test-'));

  try {
    const callLog = [];
    const fakeAppPath = join(tempRoot, 'HouseholdBalanceSheet.app');
    mkdirSync(join(fakeAppPath, 'Contents'), { recursive: true });

    await releaseScript.makeMacOSRelease('arm64', {
      buildDmgArtifact: ({ appPath }) => {
        callLog.push(['dmg', appPath]);
      },
      buildSignedZipArtifact: ({ appPath }) => {
        callLog.push(['zip', appPath]);
      },
      loadDmgVisualConfig: async () => ({ title: 'HouseholdBalanceSheet' }),
      resolveAppPath: () => fakeAppPath,
      resolveSecurityConfig: () => ({
        enabled: true,
        identity: 'Developer ID Application: Example Inc (TEAM123456)',
        keychain: '/tmp/login.keychain-db',
        notarize: {
          keychainProfile: 'hbs-notary',
          keychain: '/tmp/notary.keychain-db',
        },
      }),
      runCommand: (command, args, cwd) => {
        if (command === 'npm' || command === 'node') {
          return;
        }
        callLog.push([command, args[0], cwd]);
      },
      signAndNotarizeApp: ({ appPath }) => {
        callLog.push(['sign', appPath]);
      },
      verifySignedApp: ({ appPath }) => {
        callLog.push(['verify', appPath]);
      },
    });

    assert.deepEqual(callLog, [
      ['sign', fakeAppPath],
      ['verify', fakeAppPath],
      ['dmg', fakeAppPath],
      ['zip', fakeAppPath],
    ]);
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
});
