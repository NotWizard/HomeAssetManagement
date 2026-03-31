export const API_BASE_ARG_PREFIX = '--hbs-api-base-url=';
export const RETRY_BOOTSTRAP_CHANNEL = 'hbs:retry-bootstrap';
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
  subscribeToUpdateState: (listener: UpdateListener) => (() => void);
};

export function resolveApiBaseUrl(argv: string[]): string | undefined {
  const argument = argv.find((value) => value.startsWith(API_BASE_ARG_PREFIX));
  return argument?.slice(API_BASE_ARG_PREFIX.length);
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

export async function requestBinary(
  fetchImpl: typeof fetch,
  apiBaseUrl: string | undefined,
  path: string,
  init?: JsonRequestInit
): Promise<BinaryResponse> {
  const response = await fetchImpl(resolveApiUrl(path, apiBaseUrl), {
    method: init?.method ?? 'GET',
    headers: init?.headers,
    body: init?.body,
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

  return {
    isDesktop: true,
    api: {
      requestJson: async (path: string, init?: JsonRequestInit) => {
        const response = await deps.fetchImpl(resolveApiUrl(path, apiBaseUrl), {
          method: init?.method ?? 'GET',
          headers: init?.headers,
          body: init?.body,
        });

        return response.json();
      },
      requestBinary: (path: string, init?: JsonRequestInit) =>
        requestBinary(deps.fetchImpl, apiBaseUrl, path, init),
      postForm: async (path: string, entries: FormEntries) => {
        const response = await deps.fetchImpl(resolveApiUrl(path, apiBaseUrl), {
          method: 'POST',
          body: toFormData(entries),
        });

        return response.json();
      },
    },
    bootstrap: {
      retry: () => deps.invokeIpc(RETRY_BOOTSTRAP_CHANNEL),
    },
    updates: {
      getState: () => deps.invokeIpc(UPDATE_GET_STATE_CHANNEL),
      check: () => deps.invokeIpc(UPDATE_CHECK_CHANNEL),
      download: () => deps.invokeIpc(UPDATE_DOWNLOAD_CHANNEL),
      install: () => deps.invokeIpc(UPDATE_INSTALL_CHANNEL),
      onStateChanged: (listener: UpdateListener) => deps.subscribeToUpdateState(listener),
    },
  };
}
