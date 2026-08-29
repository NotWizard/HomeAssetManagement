import { useEffect, useState } from 'react';

import {
  getDesktopBridge,
  isDesktopRuntime,
  type HbsDesktopUpdateState,
} from '../../config/runtime';
import { normalizeUpdateState } from './desktopUpdateNoticeState';

// 共享单例订阅：DesktopUpdateNotice（常驻 AppShell）与 DesktopUpdateSettingsCard
// 都会调用本 hook；原先每个调用方各自挂一份 IPC 监听 + 各发一次 getState，
// 改为模块级单订阅 + 多播，IPC 监听只有一份。
type UpdateStateListener = (state: HbsDesktopUpdateState | null) => void;

let currentState: HbsDesktopUpdateState | null = null;
let bridgeSubscribed = false;
const listeners = new Set<UpdateStateListener>();

function broadcast(state: HbsDesktopUpdateState | null): void {
  currentState = state;
  for (const listener of listeners) {
    listener(state);
  }
}

function ensureBridgeSubscription(): void {
  if (bridgeSubscribed || !isDesktopRuntime()) {
    return;
  }
  const desktopBridge = getDesktopBridge();
  if (!desktopBridge) {
    return;
  }
  bridgeSubscribed = true;

  void desktopBridge.updates
    .getState()
    .then((state) => {
      broadcast(normalizeUpdateState(state));
    })
    .catch(() => undefined);

  desktopBridge.updates.onUpdateStateChanged((state) => {
    broadcast(normalizeUpdateState(state));
  });
}

export function useDesktopUpdateState() {
  const [updateState, setUpdateState] =
    useState<HbsDesktopUpdateState | null>(currentState);

  useEffect(() => {
    if (!isDesktopRuntime() || !getDesktopBridge()) {
      return;
    }

    ensureBridgeSubscription();
    // 挂载晚于首次状态到达的场景：立即同步一次当前值
    setUpdateState(currentState);

    const listener: UpdateStateListener = (state) => {
      setUpdateState(state);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return updateState;
}
