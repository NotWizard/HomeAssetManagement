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

test('打包资源缺失时 fail fast，forge start（dev）模式降级为过滤', async () => {
  const { resolveExtraResources } = await import('../forge.config.ts');

  // 全部存在：两个都返回
  const all = resolveExtraResources({ existsSyncImpl: () => true });
  assert.equal(all.length, 2);

  // package/make 场景（非 start）：缺失即抛错，不再静默产出残包
  assert.throws(
    () => resolveExtraResources({ existsSyncImpl: () => false, isForgeStart: false }),
    /缺少打包资源目录/
  );

  // dev start 场景：过滤缺失项而不是抛错
  const filtered = resolveExtraResources({
    existsSyncImpl: () => false,
    isForgeStart: true,
  });
  assert.deepEqual(filtered, []);
});
