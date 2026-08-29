import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  didLatestUpdateCheckFail,
  getDesktopUpdateSettingsButtonLabel,
  getDesktopUpdateButtonLabel,
  isDesktopUpdateBusy,
  normalizeUpdateState,
  resolveDesktopUpdateClickAction,
  resolveDesktopUpdateSettingsAction,
  shouldReuseRecentUpdateCheck,
  shouldShowDesktopUpdateEntry,
} from '../src/components/layout/desktopUpdateNoticeState.ts';

test('桌面更新状态会补齐下载进度与错误字段回退', () => {
  const state = normalizeUpdateState({
    status: 'downloading',
    downloadedBytes: 25,
    totalBytes: 100,
    error: 'network failed',
  });

  assert.deepEqual(state, {
    status: 'downloading',
    downloadedBytes: 25,
    totalBytes: 100,
    error: 'network failed',
    progress: 25,
    errorMessage: 'network failed',
  });
});

test('桌面更新入口只在用户需要操作的状态下展示，并给出正确文案', () => {
  // idle / checking 是后台过渡态，不打扰用户
  assert.equal(shouldShowDesktopUpdateEntry('idle'), false);
  assert.equal(shouldShowDesktopUpdateEntry('checking'), false);
  // available / downloading 由"后台静默下载"接管，UI 不出现入口
  assert.equal(shouldShowDesktopUpdateEntry('available'), false);
  assert.equal(shouldShowDesktopUpdateEntry('downloading'), false);
  // 下载完成后才在左下角出现可点击入口
  assert.equal(shouldShowDesktopUpdateEntry('downloaded'), true);
  assert.equal(shouldShowDesktopUpdateEntry('preparing'), true);
  assert.equal(shouldShowDesktopUpdateEntry('installing'), true);
  assert.equal(shouldShowDesktopUpdateEntry('error'), true);

  assert.equal(
    getDesktopUpdateButtonLabel({ status: 'downloaded', progress: 100 }),
    '立即安装更新'
  );
  assert.equal(
    getDesktopUpdateButtonLabel({ status: 'preparing', progress: null }),
    '准备安装中'
  );
  assert.equal(
    getDesktopUpdateButtonLabel({ status: 'installing', progress: null }),
    '安装进行中'
  );
  assert.equal(
    getDesktopUpdateButtonLabel({ status: 'error', progress: null }),
    '更新失败，重试'
  );
});

test('桌面更新入口的错误文案会按 errorKind 细分', () => {
  // 兜底：无 errorKind 时显示通用"更新失败，重试"
  assert.equal(
    getDesktopUpdateButtonLabel({ status: 'error', progress: null }),
    '更新失败，重试'
  );
  assert.equal(
    getDesktopUpdateButtonLabel({
      status: 'error',
      progress: null,
      errorKind: 'download',
    }),
    '下载失败，重试'
  );
  assert.equal(
    getDesktopUpdateButtonLabel({
      status: 'error',
      progress: null,
      errorKind: 'validation',
    }),
    '更新包校验失败，重试'
  );
  assert.equal(
    getDesktopUpdateButtonLabel({
      status: 'error',
      progress: null,
      errorKind: 'install',
    }),
    '安装失败，重试'
  );
  // 防御性分支：按当前设计网络错误不会进入 error status，但保留兜底文案
  // 兼容升级过程中残留的旧 state.json
  assert.equal(
    getDesktopUpdateButtonLabel({
      status: 'error',
      progress: null,
      errorKind: 'network',
    }),
    '检查更新暂时不可用'
  );
});

test('桌面更新入口会根据状态推导点击动作与忙碌态', () => {
  // available / downloading 不显示入口、不应该被点击；返回 'none' 防御性兜底
  assert.equal(
    resolveDesktopUpdateClickAction({
      status: 'available',
      downloadedFilePath: null,
    }),
    'none'
  );
  assert.equal(
    resolveDesktopUpdateClickAction({
      status: 'downloading',
      downloadedFilePath: null,
    }),
    'none'
  );
  assert.equal(
    resolveDesktopUpdateClickAction({
      status: 'downloaded',
      downloadedFilePath: '/tmp/hbs-update.zip',
    }),
    'open-install-dialog'
  );
  assert.equal(
    resolveDesktopUpdateClickAction({
      status: 'error',
      downloadedFilePath: '/tmp/hbs-update.zip',
    }),
    'open-install-dialog'
  );
  assert.equal(
    resolveDesktopUpdateClickAction({
      status: 'error',
      downloadedFilePath: null,
    }),
    'check-for-updates'
  );
  assert.equal(
    resolveDesktopUpdateClickAction({
      status: 'installing',
      downloadedFilePath: '/tmp/hbs-update.zip',
    }),
    'none'
  );

  assert.equal(isDesktopUpdateBusy('downloading'), true);
  assert.equal(isDesktopUpdateBusy('preparing'), true);
  assert.equal(isDesktopUpdateBusy('installing'), true);
  assert.equal(isDesktopUpdateBusy('downloaded'), false);
});

test('设置页更新卡片会按状态推导分步操作与按钮文案', () => {
  assert.equal(
    resolveDesktopUpdateSettingsAction({ status: 'idle' }),
    'check-for-updates'
  );
  assert.equal(
    resolveDesktopUpdateSettingsAction({ status: 'available' }),
    'download-update'
  );
  assert.equal(
    resolveDesktopUpdateSettingsAction({ status: 'downloaded' }),
    'open-install-dialog'
  );
  assert.equal(
    resolveDesktopUpdateSettingsAction({ status: 'downloading' }),
    'none'
  );

  assert.equal(
    getDesktopUpdateSettingsButtonLabel({ status: 'idle' }),
    '检查更新'
  );
  assert.equal(
    getDesktopUpdateSettingsButtonLabel({ status: 'checking' }),
    '检查中'
  );
  assert.equal(
    getDesktopUpdateSettingsButtonLabel({ status: 'available' }),
    '下载更新'
  );
  assert.equal(
    getDesktopUpdateSettingsButtonLabel({
      status: 'downloading',
      progress: 68,
    }),
    '下载中 68%'
  );
  assert.equal(
    getDesktopUpdateSettingsButtonLabel({ status: 'downloaded' }),
    '安装并重启'
  );
});

test('更新重试动作会区分下载、校验与安装错误', () => {
  assert.equal(
    resolveDesktopUpdateClickAction({
      status: 'error',
      errorKind: 'download',
      downloadedFilePath: '/tmp/incomplete.zip',
    }),
    'download-update'
  );
  assert.equal(
    resolveDesktopUpdateClickAction({
      status: 'error',
      errorKind: 'validation',
      downloadedFilePath: '/tmp/invalid.zip',
    }),
    'check-for-updates'
  );
  assert.equal(
    resolveDesktopUpdateClickAction({
      status: 'error',
      errorKind: 'install',
      downloadedFilePath: '/tmp/verified.zip',
    }),
    'open-install-dialog'
  );
});

test('手动检查会在 60 秒内复用结果并识别本次网络失败', () => {
  const now = 1_700_000_000_000;

  assert.equal(
    shouldReuseRecentUpdateCheck({ lastCheckedAt: now - 30_000 }, now),
    true
  );
  assert.equal(
    shouldReuseRecentUpdateCheck({ lastCheckedAt: now - 60_000 }, now),
    false
  );
  assert.equal(
    didLatestUpdateCheckFail({
      lastCheckedAt: now,
      lastNetworkErrorAt: now,
      lastSuccessfulCheckAt: now - 1,
    }),
    true
  );
  assert.equal(
    didLatestUpdateCheckFail({
      lastCheckedAt: now,
      lastNetworkErrorAt: now - 1,
      lastSuccessfulCheckAt: now,
    }),
    false
  );
});

test('左下角更新入口的安装确认有 catch 兜底，不产生 unhandled rejection', () => {
  // 组件无法 node --test 渲染，用源码级断言锁定（与设置页卡片的 catch 语义对齐）
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/layout/DesktopUpdateNotice.tsx'),
    'utf8'
  );
  const confirmBlock = source.match(/const confirmInstall = async[\s\S]*?\n  \};/);
  assert.ok(confirmBlock, '应找到 confirmInstall');
  assert.match(confirmBlock[0], /catch/);
  assert.match(confirmBlock[0], /setInstallError/);
});
