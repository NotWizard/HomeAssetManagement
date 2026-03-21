import { contextBridge, ipcRenderer } from 'electron';

const API_BASE_ARG_PREFIX = '--hbs-api-base-url=';
const RETRY_BOOTSTRAP_CHANNEL = 'hbs:retry-bootstrap';

type JsonRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
};

type BinaryResponse = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  body: ArrayBuffer;
};

type FormEntryValue = string | Blob;
type FormEntries = Array<[string, FormEntryValue]>;

function resolveApiBaseUrl(): string | undefined {
  const argument = process.argv.find((value) => value.startsWith(API_BASE_ARG_PREFIX));
  return argument?.slice(API_BASE_ARG_PREFIX.length);
}

function resolveApiUrl(path: string): string {
  const apiBaseUrl = resolveApiBaseUrl();
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

async function requestBinary(
  path: string,
  init?: JsonRequestInit
): Promise<BinaryResponse> {
  const response = await fetch(resolveApiUrl(path), {
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

contextBridge.exposeInMainWorld('__HBS_DESKTOP__', {
  isDesktop: true,
  requestJson: async (path: string, init?: JsonRequestInit) => {
    const response = await fetch(resolveApiUrl(path), {
      method: init?.method ?? 'GET',
      headers: init?.headers,
      body: init?.body,
    });

    return response.json();
  },
  requestBinary,
  postForm: async (path: string, entries: FormEntries) => {
    const response = await fetch(resolveApiUrl(path), {
      method: 'POST',
      body: toFormData(entries),
    });

    return response.json();
  },
  retryBootstrap: () => ipcRenderer.invoke(RETRY_BOOTSTRAP_CHANNEL),
});
