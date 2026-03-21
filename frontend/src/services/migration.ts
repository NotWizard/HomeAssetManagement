import type { ApiResponse, MigrationImportResult } from '../types';
import {
  getApiBaseUrl,
  getDesktopBridge,
  type HbsDesktopBinaryResponse,
} from '../config/runtime';
import { postForm } from './apiClient';

function resolveFilename(response: Response) {
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? `ham-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
}

function resolveFilenameFromHeaders(
  headers: Record<string, string>,
  fallback: string
) {
  const disposition = headers['content-disposition'] ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? fallback;
}

async function parseApiError(response: Response) {
  try {
    const payload = (await response.json()) as Partial<ApiResponse<unknown>>;
    return payload.message || '请求失败';
  } catch {
    return '请求失败';
  }
}

async function parseBinaryError(
  response: HbsDesktopBinaryResponse
): Promise<string> {
  try {
    const text = new TextDecoder().decode(response.body);
    const payload = JSON.parse(text) as Partial<ApiResponse<unknown>>;
    return payload.message || '请求失败';
  } catch {
    return '请求失败';
  }
}

function triggerDownload(
  body: BlobPart,
  filename: string,
  mimeType: string
) {
  const blob = new Blob([body], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export async function exportMigrationPackage() {
  const desktopBridge = getDesktopBridge();
  if (desktopBridge?.isDesktop) {
    const response = await desktopBridge.requestBinary('/migration/export', {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(await parseBinaryError(response));
    }

    const filename = resolveFilenameFromHeaders(
      response.headers,
      `ham-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
    );
    triggerDownload(
      response.body,
      filename,
      response.headers['content-type'] ?? 'application/zip'
    );
    return filename;
  }

  const response = await fetch(`${getApiBaseUrl()}/migration/export`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const filename = resolveFilename(response);
  const blob = await response.blob();
  triggerDownload(blob, filename, blob.type || 'application/zip');

  return filename;
}

export async function importMigrationPackage(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return postForm<MigrationImportResult>('/migration/import', formData);
}
