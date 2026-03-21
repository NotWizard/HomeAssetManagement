import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

test('Forge 配置会接入图标与 DMG 安装背景', async () => {
  const forgeModule = await import('../forge.config.ts');
  const config = forgeModule.default;
  const dmgMaker = config.makers?.find((maker) => maker.name === '@electron-forge/maker-dmg');

  assert.ok(config.packagerConfig?.icon);
  assert.equal(typeof config.packagerConfig?.icon, 'string');
  assert.ok(existsSync(String(config.packagerConfig?.icon)));
  assert.ok(dmgMaker);
  assert.equal(dmgMaker?.platforms?.includes('darwin'), true);
  assert.equal(typeof dmgMaker?.config?.background, 'string');
  assert.ok(existsSync(String(dmgMaker?.config?.background)));
});

test('桌面 package.json 会暴露双架构 DMG 发布脚本', async () => {
  const pkg = (await import('../package.json', { with: { type: 'json' } })).default;

  assert.equal(typeof pkg.scripts['make:dmg'], 'string');
  assert.equal(typeof pkg.scripts['make:dmg:arm64'], 'string');
  assert.equal(typeof pkg.scripts['make:dmg:x64'], 'string');
});
