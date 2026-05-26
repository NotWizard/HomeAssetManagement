export const API_BASE_ARG_PREFIX = '--hbs-api-base-url=';
export const API_TOKEN_HEADER = 'X-HBS-Token';
export const RUNTIME_TOKEN_CHANNEL = 'hbs:get-runtime-token';
export const RETRY_BOOTSTRAP_CHANNEL = 'hbs:retry-bootstrap';
export const OPEN_LOGS_DIR_CHANNEL = 'hbs:open-logs-dir';
export const UPDATE_STATE_CHANNEL = 'hbs:update:changed';
export const UPDATE_GET_STATE_CHANNEL = 'hbs:update:get-state';
export const UPDATE_CHECK_CHANNEL = 'hbs:update:check';
export const UPDATE_DOWNLOAD_CHANNEL = 'hbs:update:download';
export const UPDATE_INSTALL_CHANNEL = 'hbs:update:install';

export type JsonRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
};

export type BinaryResponse = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  body: ArrayBuffer;
};

export type FormEntryValue = string | Blob;
export type FormEntries = Array<[string, FormEntryValue]>;
export type UpdateListener = (state: unknown) => void;

export type DesktopBridgeDeps = {
  argv: string[];
  fetchImpl: typeof fetch;
  invokeIpc: (channel: string) => Promise<unknown>;
  getRuntimeToken: () => Promise<unknown>;
  subscribeToUpdateState: (listener: UpdateListener) => (() => void);
};

export function resolveApiBaseUrl(argv: string[]): string | undefined {
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

export function resolveApiUrl(path: string, apiBaseUrl?: string): string {
  if (!apiBaseUrl) {
    throw new Error('未检测到桌面运行时 API 基地址');
  }

  if (path.startsWith('/')) {
    return `${apiBaseUrl}${path}`;
  }

  return `${apiBaseUrl}/${path}`;
}

export function toFormData(entries: FormEntries): FormData {
  const formData = new FormData();
  for (const [key, value] of entries) {
    formData.append(key, value);
  }

  return formData;
}

export function serializeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    result[key.toLowerCase()] = value;
  }

  return result;
}

async function requestJson(
  fetchImpl: typeof fetch,
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
  const response = await fetchImpl(resolveApiUrl(path, apiBaseUrl), {
    method,
    headers,
    body,
  });

  return response.json();
}

export async function requestBinary(
  fetchImpl: typeof fetch,
  apiBaseUrl: string | undefined,
  getApiToken: () => Promise<string | undefined>,
  path: string,
  method: 'GET' | 'POST' = 'GET'
): Promise<BinaryResponse> {
  const headers = mergeAuthHeaders(undefined, await getApiToken());
  const response = await fetchImpl(resolveApiUrl(path, apiBaseUrl), {
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

export function createDesktopBridge(deps: DesktopBridgeDeps) {
  const apiBaseUrl = resolveApiBaseUrl(deps.argv);

  // 通过 IPC 拉 token 是异步过程；首次访问时触发并缓存 promise，后续调用复用同一结果，
  // 避免每次 fetch 都打一次 IPC。IPC 失败或返回非字符串/空串时视作未注入 token。
  let tokenPromise: Promise<string | undefined> | undefined;
  const getApiToken = (): Promise<string | undefined> => {
    if (!tokenPromise) {
      tokenPromise = Promise.resolve()
        .then(() => deps.getRuntimeToken())
        .then((value) =>
          typeof value === 'string' && value.length > 0 ? value : undefined
        )
        .catch(() => undefined);
    }
    return tokenPromise;
  };

  return {
    isDesktop: true,
    api: {
      json: {
        get: (path: string) =>
          requestJson(deps.fetchImpl, apiBaseUrl, getApiToken, path, 'GET'),
        post: (path: string, body: string) =>
          requestJson(deps.fetchImpl, apiBaseUrl, getApiToken, path, 'POST', body),
        put: (path: string, body: string) =>
          requestJson(deps.fetchImpl, apiBaseUrl, getApiToken, path, 'PUT', body),
        delete: (path: string) =>
          requestJson(deps.fetchImpl, apiBaseUrl, getApiToken, path, 'DELETE'),
      },
      binary: {
        get: (path: string) =>
          requestBinary(deps.fetchImpl, apiBaseUrl, getApiToken, path, 'GET'),
        post: (path: string) =>
          requestBinary(deps.fetchImpl, apiBaseUrl, getApiToken, path, 'POST'),
      },
      form: {
        post: async (path: string, entries: FormEntries) => {
          const response = await deps.fetchImpl(resolveApiUrl(path, apiBaseUrl), {
            method: 'POST',
            headers: mergeAuthHeaders(undefined, await getApiToken()),
            body: toFormData(entries),
          });

          return response.json();
        },
      },
    },
    bootstrap: {
      retry: () => deps.invokeIpc(RETRY_BOOTSTRAP_CHANNEL),
      openLogsDir: () => deps.invokeIpc(OPEN_LOGS_DIR_CHANNEL),
    },
    updates: {
      getState: () => deps.invokeIpc(UPDATE_GET_STATE_CHANNEL),
      checkForUpdates: () => deps.invokeIpc(UPDATE_CHECK_CHANNEL),
      downloadUpdate: () => deps.invokeIpc(UPDATE_DOWNLOAD_CHANNEL),
      installUpdate: () => deps.invokeIpc(UPDATE_INSTALL_CHANNEL),
      onUpdateStateChanged: (listener: UpdateListener) => deps.subscribeToUpdateState(listener),
    },
  };
}
