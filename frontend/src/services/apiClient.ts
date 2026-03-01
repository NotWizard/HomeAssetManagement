import type { ApiResponse } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000/api/v1';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
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
  const response = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    body: formData,
  });
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || json.code !== 0) {
    throw new Error(json.message || 'Request failed');
  }
  return json.data;
}
