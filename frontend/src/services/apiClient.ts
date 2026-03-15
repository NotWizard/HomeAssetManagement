import type { ApiResponse } from '../types';
import { getApiBaseUrl } from '../config/runtime';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  const json = (await response.json()) as ApiResponse<T>;

  if (!response.ok || json.code !== 0) {
    throw new Error(json.message || 'Request failed');
  }

  return json.data;
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
  const response = await fetch(`${getApiBaseUrl()}${url}`, {
    method: 'POST',
    body: formData,
  });
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || json.code !== 0) {
    throw new Error(json.message || 'Request failed');
  }
  return json.data;
}
