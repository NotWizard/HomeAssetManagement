import { Download, RefreshCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  getDesktopBridge,
  isDesktopRuntime,
  type HbsDesktopUpdateState,
} from '../../config/runtime';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';

function normalizeUpdateState(payload: unknown): HbsDesktopUpdateState | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const rawState = payload as Partial<HbsDesktopUpdateState> & {
    downloadedBytes?: number | null;
    totalBytes?: number | null;
    error?: string | null;
  };
  const state = rawState as Partial<HbsDesktopUpdateState>;
  if (typeof state.status !== 'string') {
    return null;
  }

  const fallbackProgress =
    typeof rawState.downloadedBytes === 'number' &&
    typeof rawState.totalBytes === 'number' &&
    rawState.totalBytes > 0
      ? Math.max(
          0,
          Math.min(100, Math.round((rawState.downloadedBytes / rawState.totalBytes) * 100))
        )
      : null;

  return {
    ...state,
    progress: state.progress ?? fallbackProgress,
    errorMessage: state.errorMessage ?? rawState.error ?? null,
  } as HbsDesktopUpdateState;
}

function formatProgress(progress?: number | null): string {
  if (typeof progress !== 'number' || Number.isNaN(progress)) {
    return '下载中...';
  }
  const bounded = Math.min(100, Math.max(0, Math.round(progress)));
  return `下载中 ${bounded}%`;
}

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

    const unsubscribe = desktopBridge.updates.onStateChanged((state) => {
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
  const shouldShowButton =
    status === 'available' ||
    status === 'downloading' ||
    status === 'downloaded' ||
    status === 'error';

  if (!shouldShowButton) {
    return null;
  }

  const buttonLabel =
    status === 'available'
      ? '有可用更新'
      : status === 'downloading'
        ? formatProgress(updateState?.progress)
        : status === 'downloaded'
          ? '立即安装更新'
          : '更新失败，重试';

  const confirmDownload = async () => {
    setActionPending(true);
    try {
      await desktopBridge.updates.download();
      setDownloadDialogOpen(false);
    } finally {
      setActionPending(false);
    }
  };

  const confirmInstall = async () => {
    setActionPending(true);
    try {
      await desktopBridge.updates.install();
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
        disabled={status === 'downloading' || actionPending}
        onClick={() => {
          if (status === 'available') {
            setDownloadDialogOpen(true);
            return;
          }
          if (status === 'downloaded') {
            setInstallDialogOpen(true);
            return;
          }
          if (status === 'error') {
            void desktopBridge.updates.check();
          }
        }}
      >
        {status === 'downloading' ? (
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
