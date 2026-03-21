export type HbsRuntimeConfig = {
  apiBaseUrl?: string;
};

export type DesktopFormDataEntry = [string, string | File];

export type HbsDesktopBinaryResponse = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  body: ArrayBuffer;
};

export type HbsDesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type HbsDesktopUpdateState = {
  status: HbsDesktopUpdateStatus;
  latestVersion?: string | null;
  currentVersion?: string | null;
  downloadedFilePath?: string | null;
  downloadedAt?: string | null;
  progress?: number | null;
  errorMessage?: string | null;
};

export type HbsDesktopBridge = {
  isDesktop: boolean;
  requestJson: (path: string, init?: RequestInit) => Promise<unknown>;
  requestBinary: (
    path: string,
    init?: RequestInit
  ) => Promise<HbsDesktopBinaryResponse>;
  postForm: (path: string, entries: DesktopFormDataEntry[]) => Promise<unknown>;
  retryBootstrap: () => Promise<unknown>;
  getUpdateState: () => Promise<unknown>;
  checkForUpdates: () => Promise<unknown>;
  downloadUpdate: () => Promise<unknown>;
  installUpdate: () => Promise<unknown>;
  onUpdateStateChanged: (listener: (state: unknown) => void) => (() => void);
};

export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api/v1';

function resolveBrowserOrigin(): string | undefined {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return undefined;
  }

  const { origin, protocol } = window.location;
  if (protocol === 'http:' || protocol === 'https:') {
    return origin;
  }

  return undefined;
}

function readRuntimeConfig(): HbsRuntimeConfig | undefined {
  const runtimeHost = globalThis as typeof globalThis & {
    __HBS_RUNTIME_CONFIG__?: HbsRuntimeConfig;
  };

  return runtimeHost.__HBS_RUNTIME_CONFIG__;
}

function readDesktopBridge(
  host: unknown = globalThis
): HbsDesktopBridge | undefined {
  const runtimeHost = host as {
    __HBS_DESKTOP__?: HbsDesktopBridge;
  };

  return runtimeHost.__HBS_DESKTOP__;
}

export function resolveApiBaseUrl(
  runtimeConfig?: HbsRuntimeConfig,
  viteApiBaseUrl?: string,
  currentOrigin?: string,
  allowCurrentOriginFallback = true
): string {
  return (
    runtimeConfig?.apiBaseUrl ??
    viteApiBaseUrl ??
    (allowCurrentOriginFallback && currentOrigin
      ? `${currentOrigin}/api/v1`
      : DEFAULT_API_BASE_URL)
  );
}

export function getApiBaseUrl(): string {
  const viteEnv = (import.meta as ImportMeta & {
    env?: {
      VITE_API_BASE_URL?: string;
      DEV?: boolean;
    };
  }).env;

  return resolveApiBaseUrl(
    readRuntimeConfig(),
    viteEnv?.VITE_API_BASE_URL,
    resolveBrowserOrigin(),
    viteEnv?.DEV !== true
  );
}

export function getDesktopBridge(
  host: unknown = globalThis
): HbsDesktopBridge | undefined {
  return readDesktopBridge(host);
}

export function isDesktopRuntime(host: unknown = globalThis): boolean {
  return getDesktopBridge(host)?.isDesktop === true;
}
