import { Download, RefreshCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  getDesktopBridge,
  isDesktopRuntime,
} from '../../config/runtime';
import {
  getDesktopUpdateButtonLabel,
  isDesktopUpdateBusy,
  normalizeUpdateState,
  resolveDesktopUpdateClickAction,
  shouldShowDesktopUpdateEntry,
} from './desktopUpdateNoticeState';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import type { HbsDesktopUpdateState } from '../../config/runtime';

export function DesktopUpdateNotice() {
  const [updateState, setUpdateState] = useState<HbsDesktopUpdateState | null>(
    null
  );
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const latestStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isDesktopRuntime()) {
      return;
    }

    const desktopBridge = getDesktopBridge();
    if (!desktopBridge) {
      return;
    }

    let disposed = false;

    void desktopBridge.updates.getState().then((state) => {
      if (!disposed) {
        setUpdateState(normalizeUpdateState(state));
      }
    });

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

  useEffect(() => {
    const status = updateState?.status ?? null;
    if (latestStatusRef.current !== 'downloaded' && status === 'downloaded') {
      setInstallDialogOpen(true);
    }
    latestStatusRef.current = status;
  }, [updateState?.status]);

  if (!isDesktopRuntime()) {
    return null;
  }

  const desktopBridge = getDesktopBridge();
  if (!desktopBridge) {
    return null;
  }

  const status = updateState?.status ?? 'idle';
  const shouldShowButton = shouldShowDesktopUpdateEntry(status);

  if (!shouldShowButton) {
    return null;
  }

  const buttonLabel = getDesktopUpdateButtonLabel(updateState);

  const confirmDownload = async () => {
    setActionPending(true);
    try {
      await desktopBridge.updates.downloadUpdate();
      setDownloadDialogOpen(false);
    } finally {
      setActionPending(false);
    }
  };

  const confirmInstall = async () => {
    setActionPending(true);
    try {
      await desktopBridge.updates.installUpdate();
      setInstallDialogOpen(false);
    } finally {
      setActionPending(false);
    }
  };

  return (
    <>
      <Button
        variant={status === 'error' ? 'outline' : 'secondary'}
        className="w-full justify-start gap-2"
        disabled={
          isDesktopUpdateBusy(status) || actionPending
        }
        onClick={() => {
          const action = resolveDesktopUpdateClickAction(updateState);
          if (action === 'open-download-dialog') {
            setDownloadDialogOpen(true);
            return;
          }
          if (action === 'open-install-dialog') {
            setInstallDialogOpen(true);
            return;
          }
          if (action === 'check-for-updates') {
            void desktopBridge.updates.checkForUpdates();
          }
        }}
      >
        {isDesktopUpdateBusy(status) ? (
          <RefreshCcw className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span>{buttonLabel}</span>
      </Button>

      <Dialog
        open={downloadDialogOpen}
        onClose={() => setDownloadDialogOpen(false)}
        title="发现新版本"
        description={`检测到新版本 ${updateState?.latestVersion ?? ''}，是否现在下载？`}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setDownloadDialogOpen(false)}
              disabled={actionPending}
            >
              暂不下载
            </Button>
            <Button onClick={confirmDownload} disabled={actionPending}>
              开始下载
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          下载完成后会提示你安装新版本。
        </p>
      </Dialog>

      <Dialog
        open={installDialogOpen}
        onClose={() => setInstallDialogOpen(false)}
        title="更新已下载"
        description="新版本已准备就绪，是否现在安装？"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setInstallDialogOpen(false)}
              disabled={actionPending}
            >
              稍后安装
            </Button>
            <Button onClick={confirmInstall} disabled={actionPending}>
              立即安装
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          如果你暂时不安装，后续仍可通过左下角更新入口再次发起安装。
        </p>
      </Dialog>
    </>
  );
}
