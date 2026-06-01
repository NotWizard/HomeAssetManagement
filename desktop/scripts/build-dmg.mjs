import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildReleaseArtifactName,
  normalizeDesktopArch,
  parseArchFlag,
  resolveReleasePaths,
} from './release-utils.mjs';

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const desktopRoot = resolve(scriptDir, '..');

// dmg 自制器：用 macOS 自带 hdiutil + AppleScript 把 forge package 产出的 .app 打成
// 带 Applications 软链与（可选）背景图的 dmg。理由：原本走 @electron-forge/maker-dmg
// 链路依赖 appdmg → macos-alias 这条原生编译，在较新 Node 上会失败；hdiutil/osascript
// 是系统组件不会随 Node 版本损坏。

export function resolveAppPath({ makeRoot, productName, arch }) {
  // electron-forge 的 zip maker 会同时生成 .app 目录 (out/<ProductName>-darwin-<arch>/<ProductName>.app)
  // 与 zip 文件，我们直接复用 .app 目录。
  return resolve(makeRoot, '..', `${productName}-darwin-${arch}`, `${productName}.app`);
}

export function resolveStagingLayout({ tempRoot, volumeName }) {
  // 卷名作为 mount point 名字，全部规范化为 ASCII 安全的目录名以避免 hdiutil 误判。
  const safeName = volumeName.replace(/[\s/]/g, '_');
  return {
    tempRoot,
    stagingDir: join(tempRoot, 'staging'),
    rwImage: join(tempRoot, `${safeName}.rw.dmg`),
  };
}

function runHdiutil(args, { input, env } = {}) {
  const result = spawnSync('hdiutil', args, {
    encoding: 'utf8',
    env: env ?? process.env,
    input,
    stdio: input ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? '';
    throw new Error(`hdiutil ${args[0]} 失败 (exit=${result.status}): ${stderr}`);
  }

  return result.stdout ?? '';
}

function runOsascript(script) {
  const result = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? '';
    // 不阻塞主流程：osascript 调整窗口外观失败时仅警告。CI / 无 GUI 环境就走最小 dmg。
    process.stderr.write(`⚠️  osascript 调整 dmg 外观失败，已跳过：${stderr}\n`);
    return false;
  }

  return true;
}

function detachIfMounted(mountPoint) {
  if (!mountPoint || !existsSync(mountPoint)) {
    return;
  }
  spawnSync('hdiutil', ['detach', mountPoint, '-force'], { stdio: 'ignore' });
}

export function buildAppleScriptForDmgWindow({ volumeName, dmgConfig, hasBackground }) {
  const { iconSize, windowSize, contents } = dmgConfig;
  const backgroundClause = hasBackground
    ? `set background picture of vopt to file ".background:background.png"`
    : '-- no background image, skip';
  // 单引号外面是 Bash heredoc 常见格式；这里直接拼成 osascript 字符串。注意路径
  // 出现的 ":" 是 HFS 风格分隔。
  return [
    `tell application "Finder"`,
    `  tell disk "${volumeName}"`,
    `    open`,
    `    set current view of container window to icon view`,
    `    set toolbar visible of container window to false`,
    `    set statusbar visible of container window to false`,
    `    set the bounds of container window to {200, 120, ${200 + windowSize.width}, ${120 + windowSize.height}}`,
    `    set vopt to the icon view options of container window`,
    `    set arrangement of vopt to not arranged`,
    `    set icon size of vopt to ${iconSize}`,
    `    ${backgroundClause}`,
    `    set position of item "HouseholdBalanceSheet.app" of container window to {${contents.app.x}, ${contents.app.y}}`,
    `    set position of item "Applications" of container window to {${contents.applications.x}, ${contents.applications.y}}`,
    `    update without registering applications`,
    `    delay 1`,
    `    close`,
    `  end tell`,
    `end tell`,
  ].join('\n');
}

export function copyAppToStaging(appPath, stagingDir) {
  if (!existsSync(appPath) || !statSync(appPath).isDirectory()) {
    throw new Error(`找不到 .app 目录：${appPath}`);
  }
  const stagedAppPath = join(stagingDir, basename(appPath));
  cpSync(appPath, stagedAppPath, {
    recursive: true,
    // macOS framework bundle 依赖相对 symlink，例如：
    // Electron Framework -> Versions/A/Electron Framework。Node 默认 cpSync
    // 会把它解析成构建机绝对路径，导致 DMG 安装后启动时 dyld 报 "Library missing"。
    verbatimSymlinks: true,
  });
  return stagedAppPath;
}

function findAbsoluteSymlinks(rootDir) {
  if (!existsSync(rootDir)) {
    return [];
  }

  return readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(rootDir, entry.name);
    const stat = lstatSync(fullPath);

    if (stat.isSymbolicLink()) {
      const target = readlinkSync(fullPath);
      return isAbsolute(target) ? [{ path: fullPath, target }] : [];
    }

    if (stat.isDirectory()) {
      return findAbsoluteSymlinks(fullPath);
    }

    return [];
  });
}

export function validateMacAppBundleForDistribution(appPath) {
  const frameworksDir = join(appPath, 'Contents', 'Frameworks');
  const electronFrameworkBinary = join(
    frameworksDir,
    'Electron Framework.framework',
    'Electron Framework'
  );

  if (!existsSync(electronFrameworkBinary)) {
    throw new Error(
      `Electron Framework 缺失，安装后会在启动时被 dyld 拒绝: ${electronFrameworkBinary}`
    );
  }

  const absoluteSymlinks = findAbsoluteSymlinks(frameworksDir);
  if (absoluteSymlinks.length > 0) {
    const details = absoluteSymlinks
      .map((link) => `${link.path} -> ${link.target}`)
      .join('\n');
    throw new Error(
      `macOS framework bundle 内存在指向构建机的绝对 symlink，安装后会失效:\n${details}`
    );
  }
}

function ensureApplicationsSymlink(stagingDir) {
  symlinkSync('/Applications', join(stagingDir, 'Applications'));
}

function ensureBackgroundImage(stagingDir, backgroundPath) {
  if (!backgroundPath || !existsSync(backgroundPath)) {
    return false;
  }
  const backgroundDir = join(stagingDir, '.background');
  mkdirSync(backgroundDir, { recursive: true });
  cpSync(backgroundPath, join(backgroundDir, 'background.png'));
  return true;
}

function createReadWriteImage({ stagingDir, volumeName, rwImage }) {
  runHdiutil([
    'create',
    '-volname',
    volumeName,
    '-srcfolder',
    stagingDir,
    '-fs',
    'HFS+',
    '-format',
    'UDRW',
    '-ov',
    rwImage,
  ]);
}

function attachImage(rwImage) {
  const stdout = runHdiutil(['attach', '-readwrite', '-noverify', '-noautoopen', rwImage]);
  // 解析最后一列的 mount point。例如：
  //   /dev/disk5      Apple_HFS    /Volumes/家庭资产负债表
  const mountLine = stdout
    .split('\n')
    .reverse()
    .find((line) => line.includes('/Volumes/'));
  if (!mountLine) {
    throw new Error(`hdiutil attach 输出未包含 /Volumes/ 挂载点：\n${stdout}`);
  }
  const matchedIndex = mountLine.indexOf('/Volumes/');
  return mountLine.slice(matchedIndex).trim();
}

function detachImage(mountPoint) {
  detachIfMounted(mountPoint);
}

function convertToCompressed({ rwImage, format, output }) {
  rmSync(output, { force: true });
  runHdiutil(['convert', rwImage, '-format', format, '-o', output]);
}

export function buildDmgArtifact({
  appPath,
  arch,
  version,
  releaseDir,
  dmgConfig,
  productName = 'HouseholdBalanceSheet',
}) {
  if (process.platform !== 'darwin') {
    throw new Error('build-dmg 仅在 macOS 上有意义');
  }

  const tempRoot = mkdtempSync(join(tmpdir(), 'hbs-build-dmg-'));
  const layout = resolveStagingLayout({ tempRoot, volumeName: dmgConfig.title });
  let mountPoint = null;

  try {
    mkdirSync(layout.stagingDir, { recursive: true });

    validateMacAppBundleForDistribution(appPath);
    const stagedAppPath = copyAppToStaging(appPath, layout.stagingDir);
    validateMacAppBundleForDistribution(stagedAppPath);
    ensureApplicationsSymlink(layout.stagingDir);
    const hasBackground = ensureBackgroundImage(layout.stagingDir, dmgConfig.background);

    createReadWriteImage({
      stagingDir: layout.stagingDir,
      volumeName: dmgConfig.title,
      rwImage: layout.rwImage,
    });

    mountPoint = attachImage(layout.rwImage);

    const script = buildAppleScriptForDmgWindow({
      volumeName: dmgConfig.title,
      dmgConfig,
      hasBackground,
    });
    runOsascript(script);

    detachImage(mountPoint);
    mountPoint = null;

    mkdirSync(releaseDir, { recursive: true });
    const finalDmg = resolve(
      releaseDir,
      buildReleaseArtifactName({ arch, extension: 'dmg', productName, version })
    );
    convertToCompressed({
      rwImage: layout.rwImage,
      format: dmgConfig.format,
      output: finalDmg,
    });

    return finalDmg;
  } finally {
    detachIfMounted(mountPoint);
    rmSync(tempRoot, { force: true, recursive: true });
  }
}

async function loadDmgConfig() {
  const forgeModule = await import('../forge.config.ts');
  if (!forgeModule.dmgVisualConfig) {
    throw new Error('forge.config.ts 未导出 dmgVisualConfig');
  }
  return forgeModule.dmgVisualConfig;
}

async function readPackageVersion() {
  const pkg = (await import('../package.json', { with: { type: 'json' } })).default;
  return pkg.version;
}

export async function runBuildDmgCli({ arch, productName = 'HouseholdBalanceSheet' } = {}) {
  const normalizedArch = normalizeDesktopArch(arch);
  const dmgConfig = await loadDmgConfig();
  const version = await readPackageVersion();
  const { makeRoot, releaseRoot } = resolveReleasePaths(desktopRoot);
  const appPath = resolveAppPath({ makeRoot, productName, arch: normalizedArch });
  const finalDmg = buildDmgArtifact({
    appPath,
    arch: normalizedArch,
    version,
    releaseDir: releaseRoot,
    dmgConfig,
    productName,
  });
  process.stdout.write(`✅ dmg 已生成：${finalDmg}\n`);
  return finalDmg;
}

function isDirectExecution() {
  return process.argv[1] && resolve(process.argv[1]) === scriptFile;
}

if (isDirectExecution()) {
  runBuildDmgCli({ arch: parseArchFlag(process.argv, process.arch) }).catch((error) => {
    process.stderr.write(`❌ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
