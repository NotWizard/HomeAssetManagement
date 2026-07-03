import {
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCcw,
} from 'lucide-react';
import { useState } from 'react';

import {
  getDesktopBridge,
  isDesktopRuntime,
  type HbsDesktopUpdateState,
} from '../../config/runtime';
import {
  didLatestUpdateCheckFail,
  getDesktopUpdateSettingsButtonLabel,
  normalizeUpdateState,
  resolveDesktopUpdateSettingsAction,
  shouldReuseRecentUpdateCheck,
} from '../layout/desktopUpdateNoticeState';
import { useDesktopUpdateState } from '../layout/useDesktopUpdateState';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Dialog } from '../ui/dialog';

function formatVersion(version?: string | null): string {
  return version ? `v${version.replace(/^v/, '')}` : '未知';
}

function formatDateTime(timestamp?: number | null): string | null {
  if (typeof timestamp !== 'number') {
    return null;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatPublishedDate(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getStatusCopy(state: HbsDesktopUpdateState | null) {
  const status = state?.status ?? 'idle';
  const targetVersion = formatVersion(state?.latestVersion);

  if (!state) {
    return {
      title: '正在读取更新状态…',
      description: '请稍候。',
    };
  }
  if (status === 'checking') {
    return {
      title: '正在检查更新…',
      description: '正在连接更新服务。',
    };
  }
  if (status === 'available') {
    return {
      title: `发现新版本 ${targetVersion}`,
      description: `当前版本 ${formatVersion(state.currentVersion)}`,
    };
  }
  if (status === 'downloading') {
    return {
      title: `正在下载 ${targetVersion}`,
      description: '下载完成并通过安全校验后即可安装。',
    };
  }
  if (status === 'downloaded') {
    return {
      title: `${targetVersion} 已准备好`,
      description: '安装时应用将关闭并自动重新打开。',
    };
  }
  if (status === 'preparing') {
    return {
      title: '正在准备安装…',
      description: '正在解压并校验更新包。',
    };
  }
  if (status === 'installing') {
    return {
      title: '正在安装更新…',
      description: '应用即将关闭并重新打开。',
    };
  }
  if (status === 'error') {
    return {
      title: '更新操作未完成',
      description: state.errorMessage ?? '请重试。',
    };
  }
  if (
    typeof state.lastSuccessfulCheckAt === 'number' &&
    state.lastKnownLatestVersion === null
  ) {
    return {
      title: `当前已是最新版 ${formatVersion(state.currentVersion)}`,
      description: '没有发现新的正式版本。',
    };
  }
  return {
    title: '随时检查软件更新',
    description: `当前版本 ${formatVersion(state.currentVersion)}`,
  };
}

export function DesktopUpdateSettingsCard() {
  const updateState = useDesktopUpdateState();
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  if (!isDesktopRuntime()) {
    return null;
  }

  const desktopBridge = getDesktopBridge();
  if (!desktopBridge) {
    return null;
  }

  const status = updateState?.status ?? 'idle';
  const action = resolveDesktopUpdateSettingsAction(updateState);
  const copy = getStatusCopy(updateState);
  const lastCheckedText = formatDateTime(updateState?.lastCheckedAt);
  const publishedDate = formatPublishedDate(updateState?.publishedAt);
  const progress =
    typeof updateState?.progress === 'number'
      ? Math.max(0, Math.min(100, Math.round(updateState.progress)))
      : null;

  const runCheck = async () => {
    setActionPending(true);
    setManualError(null);
    try {
      const shouldReuse =
        status === 'idle' &&
        shouldReuseRecentUpdateCheck(updateState, Date.now());
      const nextState = shouldReuse
        ? updateState
        : normalizeUpdateState(
            await desktopBridge.updates.checkForUpdates()
          );
      if (didLatestUpdateCheckFail(nextState)) {
        setManualError('暂时无法检查更新，请检查网络连接后重试。');
      }
    } catch {
      setManualError('暂时无法检查更新，请检查网络连接后重试。');
    } finally {
      setActionPending(false);
    }
  };

  const runDownload = async () => {
    setActionPending(true);
    setManualError(null);
    try {
      await desktopBridge.updates.downloadUpdate();
    } catch {
      setManualError('下载更新失败，请重试。');
    } finally {
      setActionPending(false);
    }
  };

  const confirmInstall = async () => {
    setActionPending(true);
    setManualError(null);
    try {
      await desktopBridge.updates.installUpdate();
      setInstallDialogOpen(false);
    } catch {
      setManualError('安装更新失败，请重试。');
    } finally {
      setActionPending(false);
    }
  };

  const handlePrimaryAction = () => {
    if (action === 'check-for-updates') {
      void runCheck();
      return;
    }
    if (action === 'download-update') {
      void runDownload();
      return;
    }
    if (action === 'open-install-dialog') {
      setInstallDialogOpen(true);
    }
  };

  const busy =
    actionPending ||
    ['checking', 'downloading', 'preparing', 'installing'].includes(status);

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">软件更新</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                {status === 'idle' &&
                typeof updateState?.lastSuccessfulCheckAt === 'number' &&
                updateState.lastKnownLatestVersion === null ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : null}
                <p className="font-medium">{copy.title}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {copy.description}
              </p>
              {lastCheckedText ? (
                <p className="text-xs text-muted-foreground">
                  最近检查：{lastCheckedText}
                </p>
              ) : null}
            </div>

            <Button
              className="shrink-0"
              variant={status === 'idle' ? 'secondary' : 'default'}
              disabled={!updateState || action === 'none' || busy}
              onClick={handlePrimaryAction}
            >
              {busy ? (
                <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
              ) : status === 'available' ? (
                <Download className="mr-2 h-4 w-4" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              {getDesktopUpdateSettingsButtonLabel(updateState)}
            </Button>
          </div>

          {status === 'available' ? (
            <div className="rounded-xl border bg-slate-50/70 p-4">
              <p className="text-sm font-medium">
                {updateState?.releaseTitle ??
                  `${formatVersion(updateState?.latestVersion)} 更新`}
              </p>
              {publishedDate ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  发布于 {publishedDate}
                </p>
              ) : null}
              {updateState?.releaseUrl ? (
                <a
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  href={updateState.releaseUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看官方发布说明
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          ) : null}

          {status === 'downloading' ? (
            <div className="space-y-2">
              <div
                className="h-2 overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-label="更新下载进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress ?? undefined}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${progress ?? 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {progress === null ? '正在下载…' : `已完成 ${progress}%`}
              </p>
            </div>
          ) : null}

          {manualError ? (
            <p className="text-sm text-rose-600">{manualError}</p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={installDialogOpen}
        onClose={() => setInstallDialogOpen(false)}
        title="确认升级到新版本"
        description={
          updateState?.latestVersion
            ? `新版本 ${formatVersion(updateState.latestVersion)} 已下载完成，是否立即升级？`
            : '新版本已下载完成，是否立即升级？'
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
