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
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        background: dmgBackgroundPath,
        contents: (options) => [
          { x: 188, y: 272, type: 'file', path: options.appPath },
          { x: 470, y: 272, type: 'link', path: '/Applications' },
        ],
        format: 'ULFO',
        icon: iconPath,
        iconSize: 128,
        overwrite: true,
        title: '家庭资产负债表',
        additionalDMGOptions: {
          window: {
            size: {
              width: 658,
              height: 498,
            },
          },
        },
      },
    },
  ],
};

export default config;
