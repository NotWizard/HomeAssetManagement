import type {
  HbsDesktopUpdateState,
  HbsDesktopUpdateStatus,
} from '../../config/runtime';

export type DesktopUpdateClickAction =
  | 'open-download-dialog'
  | 'open-install-dialog'
  | 'check-for-updates'
  | 'none';

export function normalizeUpdateState(
  payload: unknown
): HbsDesktopUpdateState | null {
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
          Math.min(
            100,
            Math.round((rawState.downloadedBytes / rawState.totalBytes) * 100)
          )
        )
      : null;

  return {
    ...state,
    progress: state.progress ?? fallbackProgress,
    errorMessage: state.errorMessage ?? rawState.error ?? null,
  } as HbsDesktopUpdateState;
}

export function formatUpdateDownloadProgress(progress?: number | null): string {
  if (typeof progress !== 'number' || Number.isNaN(progress)) {
    return '下载中...';
  }
  const bounded = Math.min(100, Math.max(0, Math.round(progress)));
  return `下载中 ${bounded}%`;
}

export function shouldShowDesktopUpdateEntry(
  status: HbsDesktopUpdateStatus
): boolean {
  return (
    status === 'available' ||
    status === 'downloading' ||
    status === 'downloaded' ||
    status === 'preparing' ||
    status === 'installing' ||
    status === 'error'
  );
}

export function isDesktopUpdateBusy(status: HbsDesktopUpdateStatus): boolean {
  return (
    status === 'downloading' ||
    status === 'preparing' ||
    status === 'installing'
  );
}

export function getDesktopUpdateButtonLabel(
  state: Pick<HbsDesktopUpdateState, 'status' | 'progress'> | null | undefined
): string {
  const status = state?.status ?? 'idle';
  if (status === 'available') {
    return '有可用更新';
  }
  if (status === 'downloading') {
    return formatUpdateDownloadProgress(state?.progress);
  }
  if (status === 'downloaded') {
    return '立即安装更新';
  }
  if (status === 'preparing') {
    return '准备安装中';
  }
  if (status === 'installing') {
    return '安装进行中';
  }
  if (status === 'error') {
    return '更新失败，重试';
  }
  return '检查更新';
}

export function resolveDesktopUpdateClickAction(
  state: Pick<HbsDesktopUpdateState, 'status' | 'downloadedFilePath'> | null | undefined
): DesktopUpdateClickAction {
  const status = state?.status ?? 'idle';
  if (status === 'available') {
    return 'open-download-dialog';
  }
  if (status === 'downloaded') {
    return 'open-install-dialog';
  }
  if (status === 'error') {
    return state?.downloadedFilePath
      ? 'open-install-dialog'
      : 'check-for-updates';
  }
  return 'none';
}
