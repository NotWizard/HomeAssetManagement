import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildAppleScriptForDmgWindow,
  copyAppToStaging,
  resolveAppPath,
  resolveStagingLayout,
  validateMacAppBundleForDistribution,
} from '../scripts/build-dmg.mjs';

test('resolveAppPath 会指向 forge zip maker 产出的 .app 目录', () => {
  const appPath = resolveAppPath({
    makeRoot: '/tmp/desktop/out/make',
    productName: 'HouseholdBalanceSheet',
    arch: 'arm64',
  });
  assert.equal(
    appPath,
    '/tmp/desktop/out/HouseholdBalanceSheet-darwin-arm64/HouseholdBalanceSheet.app'
  );
});

test('resolveStagingLayout 会把空格转为下划线避免 hdiutil 误判路径', () => {
  const layout = resolveStagingLayout({
    tempRoot: '/tmp/x',
    volumeName: '家庭 资产 / 负债',
  });
  assert.equal(layout.tempRoot, '/tmp/x');
  assert.equal(layout.stagingDir, '/tmp/x/staging');
  assert.equal(layout.rwImage, '/tmp/x/家庭_资产___负债.rw.dmg');
});

test('buildAppleScriptForDmgWindow 在有背景图时会 set background picture', () => {
  const script = buildAppleScriptForDmgWindow({
    volumeName: '家庭资产负债表',
    dmgConfig: {
      iconSize: 128,
      windowSize: { width: 658, height: 498 },
      contents: { app: { x: 188, y: 272 }, applications: { x: 470, y: 272 } },
    },
    hasBackground: true,
  });
  assert.match(script, /tell disk "家庭资产负债表"/);
  assert.match(script, /icon size of vopt to 128/);
  assert.match(script, /set background picture of vopt/);
  assert.match(script, /position of item "HouseholdBalanceSheet.app".*\{188, 272\}/);
  assert.match(script, /position of item "Applications".*\{470, 272\}/);
  assert.match(script, /\{200, 120, 858, 618\}/);
});

test('buildAppleScriptForDmgWindow 在无背景图时跳过背景设置', () => {
  const script = buildAppleScriptForDmgWindow({
    volumeName: '家庭资产负债表',
    dmgConfig: {
      iconSize: 96,
      windowSize: { width: 600, height: 400 },
      contents: { app: { x: 100, y: 100 }, applications: { x: 400, y: 100 } },
    },
    hasBackground: false,
  });
  assert.doesNotMatch(script, /set background picture of vopt/);
  assert.match(script, /-- no background image, skip/);
});

test('copyAppToStaging 复制 Electron framework 时保留相对 symlink', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'hbs-build-dmg-test-'));
  try {
    const appPath = join(tempRoot, 'HouseholdBalanceSheet.app');
    const stagingDir = join(tempRoot, 'staging');
    const frameworkDir = join(
      appPath,
      'Contents',
      'Frameworks',
      'Electron Framework.framework'
    );
    const versionDir = join(frameworkDir, 'Versions', 'A');

    mkdirSync(versionDir, { recursive: true });
    mkdirSync(stagingDir);
    writeFileSync(join(versionDir, 'Electron Framework'), 'fake binary');
    symlinkSync('Versions/A/Electron Framework', join(frameworkDir, 'Electron Framework'));

    copyAppToStaging(appPath, stagingDir);

    const copiedSymlink = readlinkSync(
      join(
        stagingDir,
        'HouseholdBalanceSheet.app',
        'Contents',
        'Frameworks',
        'Electron Framework.framework',
        'Electron Framework'
      )
    );
    assert.equal(copiedSymlink, 'Versions/A/Electron Framework');
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
});

test('validateMacAppBundleForDistribution 拒绝缺失 Electron Framework 的 .app', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'hbs-build-dmg-test-'));
  try {
    const appPath = join(tempRoot, 'HouseholdBalanceSheet.app');
    mkdirSync(
      join(appPath, 'Contents', 'Frameworks', 'Electron Framework.framework'),
      { recursive: true }
    );

    assert.throws(
      () => validateMacAppBundleForDistribution(appPath),
      /Electron Framework 缺失/
    );
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
});

test('validateMacAppBundleForDistribution 拒绝 framework 中的绝对 symlink', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'hbs-build-dmg-test-'));
  try {
    const appPath = join(tempRoot, 'HouseholdBalanceSheet.app');
    const frameworkDir = join(
      appPath,
      'Contents',
      'Frameworks',
      'Electron Framework.framework'
    );
    const versionDir = join(frameworkDir, 'Versions', 'A');

    mkdirSync(versionDir, { recursive: true });
    writeFileSync(join(versionDir, 'Electron Framework'), 'fake binary');
    symlinkSync(
      join(versionDir, 'Electron Framework'),
      join(frameworkDir, 'Electron Framework')
    );

    assert.throws(
      () => validateMacAppBundleForDistribution(appPath),
      /绝对 symlink/
    );
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
});
