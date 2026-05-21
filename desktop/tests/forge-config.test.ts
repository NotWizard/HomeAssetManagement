import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

test('Forge 配置只挂载 zip maker，dmg 由 hdiutil 自制', async () => {
  const forgeModule = await import('../forge.config.ts');
  const config = forgeModule.default;

  assert.ok(config.packagerConfig?.icon);
  assert.equal(typeof config.packagerConfig?.icon, 'string');
  assert.ok(existsSync(String(config.packagerConfig?.icon)));

  const makers = (config.makers ?? []) as Array<{ name?: string; platforms?: string[] }>;
  const zipMaker = makers.find((maker) => maker.name === '@electron-forge/maker-zip');
  assert.ok(zipMaker, '应保留 maker-zip 用于产 .app + zip');
  assert.equal(zipMaker?.platforms?.includes('darwin'), true);

  const dmgMaker = makers.find((maker) => maker.name === '@electron-forge/maker-dmg');
  assert.equal(
    dmgMaker,
    undefined,
    'maker-dmg 已下线，dmg 改由 desktop/scripts/build-dmg.mjs 用 hdiutil 自制'
  );
});

test('Forge 配置导出 dmgVisualConfig 作为 dmg 视觉真理源', async () => {
  const forgeModule = await import('../forge.config.ts');
  const visualConfig = forgeModule.dmgVisualConfig;

  assert.ok(visualConfig, 'forge.config.ts 应导出 dmgVisualConfig');
  assert.equal(typeof visualConfig.background, 'string');
  assert.ok(existsSync(visualConfig.background));
  assert.equal(typeof visualConfig.icon, 'string');
  assert.ok(existsSync(visualConfig.icon));
  assert.equal(typeof visualConfig.title, 'string');
  assert.equal(visualConfig.title.length > 0, true);
  assert.equal(typeof visualConfig.iconSize, 'number');
  assert.equal(visualConfig.iconSize > 0, true);
  assert.equal(typeof visualConfig.windowSize?.width, 'number');
  assert.equal(typeof visualConfig.windowSize?.height, 'number');
  assert.equal(typeof visualConfig.contents?.app?.x, 'number');
  assert.equal(typeof visualConfig.contents?.applications?.x, 'number');
  assert.match(visualConfig.format, /^(ULFO|UDZO)$/);
});

test('桌面 package.json 会暴露双架构 DMG 发布脚本', async () => {
  const pkg = (await import('../package.json', { with: { type: 'json' } })).default;

  assert.equal(typeof pkg.scripts['make:dmg'], 'string');
  assert.equal(typeof pkg.scripts['make:dmg:arm64'], 'string');
  assert.equal(typeof pkg.scripts['make:dmg:x64'], 'string');
});

test('桌面 package.json 不再依赖 @electron-forge/maker-dmg', async () => {
  const pkg = (await import('../package.json', { with: { type: 'json' } })).default;

  assert.equal(
    pkg.devDependencies['@electron-forge/maker-dmg'],
    undefined,
    'maker-dmg 已下线，避免随 Node 版本升级被原生 macos-alias 编译卡死'
  );
  assert.equal(typeof pkg.devDependencies['@electron-forge/maker-zip'], 'string');
});
