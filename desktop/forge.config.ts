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

const requiredResources = [frontendDistDir, backendBundleDir];

/**
 * 打包资源 fail fast：原先 missing 时静默 filter 跳过，会产出缺前端/后端的残包。
 * 注意不能在模块顶层抛——make-macos-release.mjs 在 stage 之前就会 import 本文件
 * （拿 dmgVisualConfig）；electron-forge start（dev）也不需要 stage 资源。
 * 因此改为 getter 惰性求值：只有 forge package/make 读取 extraResource 时才校验。
 */
export function resolveExtraResources(options?: {
  existsSyncImpl?: (path: string) => boolean;
  isForgeStart?: boolean;
}): string[] {
  const exists = options?.existsSyncImpl ?? existsSync;
  const isForgeStart = options?.isForgeStart ?? process.argv.includes('start');
  const missing = requiredResources.filter((resourcePath) => !exists(resourcePath));
  if (missing.length === 0) {
    return [...requiredResources];
  }
  if (isForgeStart) {
    return requiredResources.filter((resourcePath) => exists(resourcePath));
  }
  throw new Error(
    `缺少打包资源目录：${missing.join(', ')}。请先运行 npm run stage:resources（make/package 脚本会自动处理）。`
  );
}

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
    // 惰性 getter：forge 在 package/make 时才读取 extraResource，此时 stage 已完成；
    // 缺资源直接抛错中断打包，而不是静默产出残包。
    get extraResource(): string[] {
      return resolveExtraResources();
    },
    icon: iconPath,
    name: 'HouseholdBalanceSheet',
    // 默认 packager 会把 Electron Framework 内全部 ~55 个 .lproj 一并带出来
    // (fr/de/es/ru/ja/ko/…)，而 UI 只面向 zh-CN/en 用户。限定 electronLanguages
    // 可让 packager 在 stage 阶段把多余 .lproj 删掉，DMG -8 ~ -12 MB。
    electronLanguages: ['zh_CN', 'en'],
    // prune 默认即 true，显式声明避免后续若被改成 false 时无声裹入 devDependencies。
    prune: true,
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
