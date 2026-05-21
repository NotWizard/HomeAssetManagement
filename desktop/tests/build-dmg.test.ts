import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAppleScriptForDmgWindow,
  resolveAppPath,
  resolveStagingLayout,
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
