import type { ApiResponse } from '../types';
import {
  getApiBaseUrl,
  getDesktopBridge,
  type DesktopFormDataEntry,
} from '../config/runtime';

function normalizeResponse<T>(payload: unknown): T {
  const json = payload as ApiResponse<T>;
  if (json.code !== 0) {
    throw new Error(json.message || 'Request failed');
  }

  return json.data;
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

async function request<T>(url: string, options?: RequestInit): Promise<T> {
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

  const response = await fetch(`${getApiBaseUrl()}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok) {
    throw new Error(json.message || 'Request failed');
  }
  return normalizeResponse<T>(json);
}

export async function getJSON<T>(url: string): Promise<T> {
  return request<T>(url, { method: 'GET' });
}

export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, { method: 'POST', body: JSON.stringify(body) });
}

export async function putJSON<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, { method: 'PUT', body: JSON.stringify(body) });
}

export async function deleteJSON<T>(url: string): Promise<T> {
  return request<T>(url, { method: 'DELETE' });
}

export async function postForm<T>(url: string, formData: FormData): Promise<T> {
  const desktopBridge = getDesktopBridge();
  if (desktopBridge?.isDesktop) {
    return normalizeResponse<T>(
      await desktopBridge.api.form.post(url, serializeFormData(formData))
    );
  }

  const response = await fetch(`${getApiBaseUrl()}${url}`, {
    method: 'POST',
    body: formData,
  });
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok) {
    throw new Error(json.message || 'Request failed');
  }
  return normalizeResponse<T>(json);
}

function serializeFormData(formData: FormData): DesktopFormDataEntry[] {
  const entries: DesktopFormDataEntry[] = [];
  for (const [key, value] of formData.entries()) {
    entries.push([key, value]);
  }
  return entries;
}
