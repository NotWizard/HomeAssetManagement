import { useEffect, useState } from 'react';

import {
  getDesktopBridge,
  isDesktopRuntime,
  type HbsDesktopUpdateState,
} from '../../config/runtime';
import { normalizeUpdateState } from './desktopUpdateNoticeState';

export function useDesktopUpdateState() {
  const [updateState, setUpdateState] =
    useState<HbsDesktopUpdateState | null>(null);

  useEffect(() => {
    if (!isDesktopRuntime()) {
      return;
    }

    const desktopBridge = getDesktopBridge();
    if (!desktopBridge) {
      return;
    }

    let disposed = false;

    void desktopBridge.updates
      .getState()
      .then((state) => {
        if (!disposed) {
          setUpdateState(normalizeUpdateState(state));
        }
      })
      .catch(() => undefined);

    const unsubscribe = desktopBridge.updates.onUpdateStateChanged((state) => {
      if (!disposed) {
        setUpdateState(normalizeUpdateState(state));
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  return updateState;
}
