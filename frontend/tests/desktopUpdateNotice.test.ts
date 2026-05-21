import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDesktopUpdateButtonLabel,
  isDesktopUpdateBusy,
  normalizeUpdateState,
  resolveDesktopUpdateClickAction,
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
