import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ForgeConfig } from '@electron-forge/shared-types';

const configDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const desktopAssetsDir = resolve(configDir, 'assets');
const frontendDistDir = resolve(configDir, '.stage/frontend-dist');
const backendBundleDir = resolve(configDir, '.stage/backend');
const iconPath = resolve(desktopAssetsDir, 'icon.icns');
const dmgBackgroundPath = resolve(desktopAssetsDir, 'dmg-background.png');

const extraResource = [frontendDistDir, backendBundleDir].filter((resourcePath) =>
  existsSync(resourcePath)
);

// dmg 视觉配置：保留为单一真理源，由 desktop/scripts/build-dmg.mjs 在 forge make 之后用 hdiutil
// 自制 dmg 时读取。原本走 @electron-forge/maker-dmg → electron-installer-dmg → appdmg
// 那条链路依赖原生 macos-alias，在较新 Node（v22+ / v26）上会因 nan/V8 ABI 失配而无法编译。
export type DesktopDmgVisualConfig = {
  background: string;
  icon: string;
  iconSize: number;
  title: string;
  windowSize: { width: number; height: number };
  contents: { app: { x: number; y: number }; applications: { x: number; y: number } };
  format: 'ULFO' | 'UDZO';
};

export const dmgVisualConfig: DesktopDmgVisualConfig = {
  background: dmgBackgroundPath,
  icon: iconPath,
  iconSize: 128,
  title: '家庭资产负债表',
  windowSize: { width: 658, height: 498 },
  contents: {
    app: { x: 188, y: 272 },
    applications: { x: 470, y: 272 },
  },
  format: 'ULFO',
};

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: 'com.householdbalancesheet.desktop',
    appCategoryType: 'public.app-category.finance',
    asar: true,
    extraResource,
    icon: iconPath,
    name: 'HouseholdBalanceSheet',
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {},
    },
  ],
};

export default config;
