import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ForgeConfig } from '@electron-forge/shared-types';

const configDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const frontendDistDir = resolve(configDir, '.stage/frontend-dist');
const backendBundleDir = resolve(configDir, '.stage/backend');

const extraResource = [frontendDistDir, backendBundleDir].filter((resourcePath) =>
  existsSync(resourcePath)
);

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: 'com.homeassetmanagement.desktop',
    appCategoryType: 'public.app-category.finance',
    asar: true,
    extraResource,
    name: 'HomeAssetManagement',
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
        overwrite: true,
      },
    },
  ],
};

export default config;
