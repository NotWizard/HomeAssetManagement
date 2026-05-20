import type { ApiResponse } from '../types';
import {
  getApiBaseUrl,
  getDesktopBridge,
  type DesktopFormDataEntry,
} from '../config/runtime';
import {
  ApiError,
  fetchWithTimeout,
  safeParseJson,
  type RequestExtras,
} from './apiTransport';

export { ApiError, ApiTimeoutError, fetchWithTimeout, safeParseJson } from './apiTransport';
export type { RequestExtras } from './apiTransport';

function normalizeResponse<T>(payload: unknown, status = 200): T {
  if (typeof payload !== 'object' || payload === null) {
    throw new ApiError('响应格式不合法', status);
  }
  const envelope = payload as Partial<ApiResponse<T>>;
  if (typeof envelope.code !== 'number') {
    throw new ApiError('响应缺少业务状态码', status);
  }
  if (envelope.code !== 0) {
    throw new ApiError(envelope.message || 'Request failed', status, envelope.code);
  }
  return envelope.data as T;
}

async function requestDesktopJson<T>(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: string
): Promise<T> {
  const desktopBridge = getDesktopBridge();
  if (!desktopBridge?.isDesktop) {
    throw new Error('当前不是桌面运行时');
  }

  let payload: unknown;
  if (method === 'GET') {
    payload = await desktopBridge.api.json.get(url);
  } else if (method === 'POST') {
    payload = await desktopBridge.api.json.post(url, body ?? '{}');
  } else if (method === 'PUT') {
    payload = await desktopBridge.api.json.put(url, body ?? '{}');
  } else {
    payload = await desktopBridge.api.json.delete(url);
  }

  return normalizeResponse<T>(payload);
}

async function request<T>(
  url: string,
  options?: RequestInit & RequestExtras
): Promise<T> {
  const desktopBridge = getDesktopBridge();
  if (desktopBridge?.isDesktop) {
    const method = (options?.method?.toUpperCase() ?? 'GET') as
      | 'GET'
      | 'POST'
      | 'PUT'
      | 'DELETE';
    return requestDesktopJson<T>(
      url,
      method,
      typeof options?.body === 'string' ? options.body : undefined
    );
  }

  const { timeoutMs, signal, ...fetchInit } = options ?? {};
  const response = await fetchWithTimeout(
    `${getApiBaseUrl()}${url}`,
    {
      ...fetchInit,
      headers: {
        'Content-Type': 'application/json',
        ...(fetchInit?.headers ?? {}),
      },
    },
    { timeoutMs, signal }
  );

  const json = await safeParseJson(response);
  if (!response.ok) {
    const envelope = (json ?? {}) as Partial<ApiResponse<T>>;
    throw new ApiError(
      envelope.message || `HTTP ${response.status}`,
      response.status,
      envelope.code
    );
  }
  return normalizeResponse<T>(json, response.status);
}

export async function getJSON<T>(
  url: string,
  extras?: RequestExtras
): Promise<T> {
  return request<T>(url, { method: 'GET', ...extras });
}

export async function postJSON<T>(
  url: string,
  body: unknown,
  extras?: RequestExtras
): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    body: JSON.stringify(body),
    ...extras,
  });
}

export async function putJSON<T>(
  url: string,
  body: unknown,
  extras?: RequestExtras
): Promise<T> {
  return request<T>(url, {
    method: 'PUT',
    body: JSON.stringify(body),
    ...extras,
  });
}

export async function deleteJSON<T>(
  url: string,
  extras?: RequestExtras
): Promise<T> {
  return request<T>(url, { method: 'DELETE', ...extras });
}

export async function postForm<T>(
  url: string,
  formData: FormData,
  extras?: RequestExtras
): Promise<T> {
  const desktopBridge = getDesktopBridge();
  if (desktopBridge?.isDesktop) {
    return normalizeResponse<T>(
      await desktopBridge.api.form.post(url, serializeFormData(formData))
    );
  }

  const response = await fetchWithTimeout(
    `${getApiBaseUrl()}${url}`,
    {
      method: 'POST',
      body: formData,
    },
    { timeoutMs: extras?.timeoutMs, signal: extras?.signal }
  );

  const json = await safeParseJson(response);
  if (!response.ok) {
    const envelope = (json ?? {}) as Partial<ApiResponse<T>>;
    throw new ApiError(
      envelope.message || `HTTP ${response.status}`,
      response.status,
      envelope.code
    );
  }
  return normalizeResponse<T>(json, response.status);
}

function serializeFormData(formData: FormData): DesktopFormDataEntry[] {
  const entries: DesktopFormDataEntry[] = [];
  for (const [key, value] of formData.entries()) {
    entries.push([key, value]);
  }
  return entries;
}
