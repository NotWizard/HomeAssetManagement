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

test('桌面更新入口只在需要用户感知的状态下展示，并给出正确文案', () => {
  assert.equal(shouldShowDesktopUpdateEntry('idle'), false);
  assert.equal(shouldShowDesktopUpdateEntry('checking'), false);
  assert.equal(shouldShowDesktopUpdateEntry('available'), true);
  assert.equal(shouldShowDesktopUpdateEntry('installing'), true);

  assert.equal(
    getDesktopUpdateButtonLabel({ status: 'available', progress: null }),
    '有可用更新'
  );
  assert.equal(
    getDesktopUpdateButtonLabel({ status: 'downloading', progress: 51.2 }),
    '下载中 51%'
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
  assert.equal(
    resolveDesktopUpdateClickAction({
      status: 'available',
      downloadedFilePath: null,
    }),
    'open-download-dialog'
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
