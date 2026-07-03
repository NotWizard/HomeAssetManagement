import { Download, RefreshCcw } from 'lucide-react';
import { useState } from 'react';

import {
  getDesktopBridge,
  isDesktopRuntime,
} from '../../config/runtime';
import {
  getDesktopUpdateButtonLabel,
  isDesktopUpdateBusy,
  resolveDesktopUpdateClickAction,
  shouldShowDesktopUpdateEntry,
} from './desktopUpdateNoticeState';
import { useDesktopUpdateState } from './useDesktopUpdateState';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';

export function DesktopUpdateNotice() {
  const updateState = useDesktopUpdateState();
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);

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
  const targetVersion = updateState?.latestVersion ?? '';

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
          if (action === 'open-install-dialog') {
            setInstallDialogOpen(true);
            return;
          }
          if (action === 'check-for-updates') {
            void desktopBridge.updates.checkForUpdates();
            return;
          }
          if (action === 'download-update') {
            void desktopBridge.updates.downloadUpdate();
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
        open={installDialogOpen}
        onClose={() => setInstallDialogOpen(false)}
        title="确认升级到新版本"
        description={
          targetVersion
            ? `新版本 v${targetVersion} 已在后台下载完成，是否立即升级？`
            : '新版本已在后台下载完成，是否立即升级？'
        }
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setInstallDialogOpen(false)}
              disabled={actionPending}
            >
              稍后再说
            </Button>
            <Button onClick={confirmInstall} disabled={actionPending}>
              立即升级并重启
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          升级会立即关闭当前应用并自动重新打开新版本。本地数据与登录状态会保留，无需重新授权或重新输入。
        </p>
      </Dialog>
    </>
  );
}
