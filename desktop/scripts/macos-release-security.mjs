import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import process from 'node:process';

import { buildReleaseArtifactName, normalizeDesktopArch } from './release-utils.mjs';

const PRODUCT_NAME = 'HouseholdBalanceSheet';
const RELEASE_MODES = new Set(['developer-id', 'unsigned']);

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== '')
  );
}

function readEnvValue(env, name) {
  const value = env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function resolveNotarizeConfig(env) {
  const keychainProfile = readEnvValue(env, 'HBS_MACOS_NOTARY_KEYCHAIN_PROFILE');
  if (keychainProfile) {
    return compactObject({
      keychainProfile,
      keychain: readEnvValue(env, 'HBS_MACOS_NOTARY_KEYCHAIN'),
    });
  }

  const appleApiKey = readEnvValue(env, 'HBS_MACOS_NOTARY_API_KEY');
  const appleApiKeyId = readEnvValue(env, 'HBS_MACOS_NOTARY_API_KEY_ID');
  const appleApiIssuer = readEnvValue(env, 'HBS_MACOS_NOTARY_API_ISSUER');
  if (appleApiKey || appleApiKeyId || appleApiIssuer) {
    if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
      throw new Error(
        'macOS 公证 API Key 配置不完整：需要同时设置 HBS_MACOS_NOTARY_API_KEY、HBS_MACOS_NOTARY_API_KEY_ID、HBS_MACOS_NOTARY_API_ISSUER。'
      );
    }
    return { appleApiKey, appleApiKeyId, appleApiIssuer };
  }

  const appleId = readEnvValue(env, 'HBS_MACOS_NOTARY_APPLE_ID');
  const appleIdPassword = readEnvValue(env, 'HBS_MACOS_NOTARY_APPLE_ID_PASSWORD');
  const teamId = readEnvValue(env, 'HBS_MACOS_NOTARY_TEAM_ID');
  if (appleId || appleIdPassword || teamId) {
    if (!appleId || !appleIdPassword || !teamId) {
      throw new Error(
        'macOS 公证 Apple ID 配置不完整：需要同时设置 HBS_MACOS_NOTARY_APPLE_ID、HBS_MACOS_NOTARY_APPLE_ID_PASSWORD、HBS_MACOS_NOTARY_TEAM_ID。'
      );
    }
    return { appleId, appleIdPassword, teamId };
  }

  return null;
}

export function resolveMacReleaseSecurityConfig({
  env = process.env,
  requireSigning = env.CI === 'true' || env.HBS_MACOS_REQUIRE_SIGNING === 'true',
} = {}) {
  const releaseMode = readEnvValue(env, 'HBS_MACOS_RELEASE_MODE') ?? 'developer-id';
  if (!RELEASE_MODES.has(releaseMode)) {
    throw new Error(
      `macOS 发布模式不合法：${releaseMode}。请使用 developer-id 或 unsigned。`
    );
  }

  if (releaseMode === 'unsigned') {
    return {
      enabled: true,
      mode: 'unsigned',
      identity: '-',
      notarize: null,
    };
  }

  const identity = readEnvValue(env, 'HBS_MACOS_CODESIGN_IDENTITY');
  const notarize = resolveNotarizeConfig(env);

  if (!identity || !notarize) {
    if (requireSigning) {
      throw new Error(
        [
          '缺少 macOS 发布签名配置，已阻止发布会被 Gatekeeper 判坏的安装包。',
          '需要 HBS_MACOS_CODESIGN_IDENTITY，以及一组公证凭据：',
          'HBS_MACOS_NOTARY_KEYCHAIN_PROFILE（可选 HBS_MACOS_NOTARY_KEYCHAIN），',
          '或 HBS_MACOS_NOTARY_API_KEY + HBS_MACOS_NOTARY_API_KEY_ID + HBS_MACOS_NOTARY_API_ISSUER，',
          '或 HBS_MACOS_NOTARY_APPLE_ID + HBS_MACOS_NOTARY_APPLE_ID_PASSWORD + HBS_MACOS_NOTARY_TEAM_ID。',
        ].join('\n')
      );
    }

    return {
      enabled: false,
      reason: 'missing-signing-or-notarization-config',
    };
  }

  return {
    enabled: true,
    mode: 'developer-id',
    identity,
    keychain: readEnvValue(env, 'HBS_MACOS_CODESIGN_KEYCHAIN'),
    notarize,
  };
}

export async function signAndNotarizeApp({
  appPath,
  securityConfig,
  osxSignModule,
  notarizeModule,
} = {}) {
  if (!securityConfig?.enabled) {
    return false;
  }

  if (!existsSync(appPath) || !statSync(appPath).isDirectory()) {
    throw new Error(`找不到待签名的 .app 目录：${appPath}`);
  }

  const osxSign = osxSignModule ?? (await import('@electron/osx-sign'));
  const notarizeApi = notarizeModule ?? (await import('@electron/notarize'));
  const signApp = osxSign.signAsync ?? osxSign.signApp;
  if (typeof signApp !== 'function') {
    throw new Error('@electron/osx-sign 未暴露 signAsync/signApp');
  }

  await signApp({
    app: appPath,
    identity: securityConfig.identity,
    keychain: securityConfig.keychain,
    platform: 'darwin',
    hardenedRuntime: securityConfig.mode !== 'unsigned',
    strictVerify: true,
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
  });

  if (securityConfig.mode === 'unsigned') {
    return true;
  }

  if (typeof notarizeApi.notarize !== 'function') {
    throw new Error('@electron/notarize 未暴露 notarize');
  }

  await notarizeApi.notarize({
    tool: 'notarytool',
    appPath,
    ...securityConfig.notarize,
  });

  return true;
}

function runSpawnCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 失败 (exit=${result.status ?? 'unknown'})`);
  }
}

export function verifySignedApp({
  appPath,
  securityConfig,
  runCommand = runSpawnCommand,
} = {}) {
  if (!existsSync(appPath) || !statSync(appPath).isDirectory()) {
    throw new Error(`找不到待校验的 .app 目录：${appPath}`);
  }

  runCommand('codesign', ['--verify', '--deep', '--strict', '--verbose=4', appPath], dirname(appPath));
  if (securityConfig?.mode === 'unsigned') {
    return;
  }
  runCommand('spctl', ['-a', '-vvv', '-t', 'exec', appPath], dirname(appPath));
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function buildSignedZipArtifact({
  appPath,
  arch,
  version,
  releaseDir,
  productName = PRODUCT_NAME,
  runCommand = runSpawnCommand,
} = {}) {
  const normalizedArch = normalizeDesktopArch(arch);
  if (!existsSync(appPath) || !statSync(appPath).isDirectory()) {
    throw new Error(`找不到待压缩的 .app 目录：${appPath}`);
  }

  mkdirSync(releaseDir, { recursive: true });
  const zipPath = resolve(
    releaseDir,
    buildReleaseArtifactName({
      arch: normalizedArch,
      extension: 'zip',
      productName,
      version,
    })
  );

  runCommand('ditto', ['-c', '-k', '--keepParent', appPath, zipPath], dirname(appPath));

  const sha256 = sha256File(zipPath);
  writeFileSync(`${zipPath}.sha256`, `${sha256}  ${basename(zipPath)}\n`, 'utf8');

  return {
    zipPath,
    sha256,
  };
}
