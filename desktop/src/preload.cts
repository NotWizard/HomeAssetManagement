// 这份 preload 在 Electron sandbox 上下文里运行（webPreferences.sandbox=true），
// sandbox runtime 的 require() 不允许加载任意相对路径的源文件——只能 require 'electron'
// 与本文件自身闭包里定义的内容。因此把原本独立在 preload-bridge.ts 的运行时实现
// 直接内联到这里，避免 sandbox 抛 "module not found: ./preload-bridge.js" 让 __HBS_DESKTOP__
// 永远 expose 不出去。preload-bridge.ts 仍以 ESM 形式保留，纯粹给 desktop tests
// 通过 type-stripping 单独 import；两边语义一致由 preload-bridge.test.ts 守门。

import { contextBridge, ipcRenderer } from 'electron';

const API_BASE_ARG_PREFIX = '--hbs-api-base-url=';
const API_TOKEN_HEADER = 'X-HBS-Token';
const RUNTIME_TOKEN_CHANNEL = 'hbs:get-runtime-token';
const RETRY_BOOTSTRAP_CHANNEL = 'hbs:retry-bootstrap';
const OPEN_LOGS_DIR_CHANNEL = 'hbs:open-logs-dir';
const UPDATE_STATE_CHANNEL = 'hbs:update:changed';
const UPDATE_GET_STATE_CHANNEL = 'hbs:update:get-state';
const UPDATE_CHECK_CHANNEL = 'hbs:update:check';
const UPDATE_DOWNLOAD_CHANNEL = 'hbs:update:download';
const UPDATE_INSTALL_CHANNEL = 'hbs:update:install';

type FormEntryValue = string | Blob;
type FormEntries = Array<[string, FormEntryValue]>;
type UpdateListener = (state: unknown) => void;

function resolveApiBaseUrl(argv: string[]): string | undefined {
  const argument = argv.find((value) => value.startsWith(API_BASE_ARG_PREFIX));
  return argument?.slice(API_BASE_ARG_PREFIX.length);
}

function mergeAuthHeaders(
  headers: Record<string, string> | undefined,
  apiToken: string | undefined
): Record<string, string> | undefined {
  if (!apiToken) {
    return headers;
  }
  return { ...(headers ?? {}), [API_TOKEN_HEADER]: apiToken };
}

function resolveApiUrl(path: string, apiBaseUrl?: string): string {
  if (!apiBaseUrl) {
    throw new Error('未检测到桌面运行时 API 基地址');
  }

  if (path.startsWith('/')) {
    return `${apiBaseUrl}${path}`;
  }

  return `${apiBaseUrl}/${path}`;
}

function toFormData(entries: FormEntries): FormData {
  const formData = new FormData();
  for (const [key, value] of entries) {
    formData.append(key, value);
  }
  return formData;
}

function serializeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    result[key.toLowerCase()] = value;
  }
  return result;
}

async function requestJson(
  apiBaseUrl: string | undefined,
  getApiToken: () => Promise<string | undefined>,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: string
): Promise<unknown> {
  const baseHeaders =
    method === 'POST' || method === 'PUT'
      ? { 'Content-Type': 'application/json' }
      : undefined;
  const headers = mergeAuthHeaders(baseHeaders, await getApiToken());
  const response = await fetch(resolveApiUrl(path, apiBaseUrl), {
    method,
    headers,
    body,
  });
  return response.json();
}

async function requestBinary(
  apiBaseUrl: string | undefined,
  getApiToken: () => Promise<string | undefined>,
  path: string,
  method: 'GET' | 'POST' = 'GET'
) {
  const headers = mergeAuthHeaders(undefined, await getApiToken());
  const response = await fetch(resolveApiUrl(path, apiBaseUrl), {
    method,
    headers,
  });
  return {
    ok: response.ok,
    status: response.status,
    headers: serializeHeaders(response.headers),
    body: await response.arrayBuffer(),
  };
}

const apiBaseUrl = resolveApiBaseUrl(process.argv);

// 通过 IPC 拉 token 是异步过程；首次访问时触发并缓存 promise，后续调用复用同一结果，
// 避免每次 fetch 都打一次 IPC。IPC 失败或返回非字符串/空串时视作未注入 token。
let tokenPromise: Promise<string | undefined> | undefined;
const getApiToken = (): Promise<string | undefined> => {
  if (!tokenPromise) {
    tokenPromise = Promise.resolve()
      .then(() => ipcRenderer.invoke(RUNTIME_TOKEN_CHANNEL))
      .then((value) =>
        typeof value === 'string' && value.length > 0 ? value : undefined
      )
      .catch(() => undefined);
  }
  return tokenPromise;
};

contextBridge.exposeInMainWorld('__HBS_DESKTOP__', {
  isDesktop: true,
  api: {
    json: {
      get: (path: string) =>
        requestJson(apiBaseUrl, getApiToken, path, 'GET'),
      post: (path: string, body: string) =>
        requestJson(apiBaseUrl, getApiToken, path, 'POST', body),
      put: (path: string, body: string) =>
        requestJson(apiBaseUrl, getApiToken, path, 'PUT', body),
      delete: (path: string) =>
        requestJson(apiBaseUrl, getApiToken, path, 'DELETE'),
    },
    binary: {
      get: (path: string) =>
        requestBinary(apiBaseUrl, getApiToken, path, 'GET'),
      post: (path: string) =>
        requestBinary(apiBaseUrl, getApiToken, path, 'POST'),
    },
    form: {
      post: async (path: string, entries: FormEntries) => {
        const response = await fetch(resolveApiUrl(path, apiBaseUrl), {
          method: 'POST',
          headers: mergeAuthHeaders(undefined, await getApiToken()),
          body: toFormData(entries),
        });
        return response.json();
      },
    },
  },
  bootstrap: {
    retry: () => ipcRenderer.invoke(RETRY_BOOTSTRAP_CHANNEL),
    openLogsDir: () => ipcRenderer.invoke(OPEN_LOGS_DIR_CHANNEL),
  },
  updates: {
    getState: () => ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL),
    checkForUpdates: () => ipcRenderer.invoke(UPDATE_CHECK_CHANNEL),
    downloadUpdate: () => ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL),
    installUpdate: () => ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL),
    onUpdateStateChanged: (listener: UpdateListener) => {
      const wrapped = (_event: unknown, payload: unknown) => {
        listener(payload);
      };
      ipcRenderer.on(UPDATE_STATE_CHANNEL, wrapped);
      return () => {
        ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, wrapped);
      };
    },
  },
});
