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
  | 'preparing'
  | 'installing'
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
  api: {
    json: {
      get: (path: string) => Promise<unknown>;
      post: (path: string, body: string) => Promise<unknown>;
      put: (path: string, body: string) => Promise<unknown>;
      delete: (path: string) => Promise<unknown>;
    };
    binary: {
      get: (path: string) => Promise<HbsDesktopBinaryResponse>;
      post: (path: string) => Promise<HbsDesktopBinaryResponse>;
    };
    form: {
      post: (path: string, entries: DesktopFormDataEntry[]) => Promise<unknown>;
    };
  };
  bootstrap: {
    retry: () => Promise<unknown>;
  };
  updates: {
    getState: () => Promise<unknown>;
    checkForUpdates: () => Promise<unknown>;
    downloadUpdate: () => Promise<unknown>;
    installUpdate: () => Promise<unknown>;
    onUpdateStateChanged: (listener: (state: unknown) => void) => (() => void);
  };
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

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

/** 在断言为 HbsDesktopBridge 之前对关键路径做形状校验，避免 preload 部分实现时
 * 上层调用直接 TypeError；返回 false 时调用方应回退到 web fetch 路径。 */
export function validateDesktopBridgeShape(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const bridge = value as Record<string, unknown>;
  if (bridge.isDesktop !== true) {
    return false;
  }
  const api = bridge.api as Record<string, unknown> | undefined;
  if (!api) return false;
  const json = api.json as Record<string, unknown> | undefined;
  const binary = api.binary as Record<string, unknown> | undefined;
  const form = api.form as Record<string, unknown> | undefined;
  if (
    !json ||
    !isCallable(json.get) ||
    !isCallable(json.post) ||
    !isCallable(json.put) ||
    !isCallable(json.delete)
  ) {
    return false;
  }
  if (!binary || !isCallable(binary.get) || !isCallable(binary.post)) {
    return false;
  }
  if (!form || !isCallable(form.post)) {
    return false;
  }
  return true;
}

function readDesktopBridge(
  host: unknown = globalThis
): HbsDesktopBridge | undefined {
  const runtimeHost = host as {
    __HBS_DESKTOP__?: unknown;
  };
  const candidate = runtimeHost.__HBS_DESKTOP__;
  if (!validateDesktopBridgeShape(candidate)) {
    return undefined;
  }
  return candidate as HbsDesktopBridge;
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
  // 这里只做最轻校验：注入了 __HBS_DESKTOP__.isDesktop===true 即认为是桌面运行时；
  // 实际拿桥执行调用时再走 validateDesktopBridgeShape 严格校验，避免单元测试 mock 必须穷举所有方法。
  const runtimeHost = host as { __HBS_DESKTOP__?: { isDesktop?: unknown } };
  return runtimeHost.__HBS_DESKTOP__?.isDesktop === true;
}
