import type { ApiResponse, MigrationImportResult } from '../types';
import { getApiBaseUrl } from '../config/runtime';

function resolveFilename(response: Response) {
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? `ham-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
}

async function parseApiError(response: Response) {
  try {
    const payload = (await response.json()) as Partial<ApiResponse<unknown>>;
    return payload.message || '请求失败';
  } catch {
    return '请求失败';
  }
}

export async function exportMigrationPackage() {
  const response = await fetch(`${getApiBaseUrl()}/migration/export`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const filename = resolveFilename(response);
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);

  return filename;
}

export async function importMigrationPackage(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${getApiBaseUrl()}/migration/import`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  try {
    const json = (await response.json()) as ApiResponse<MigrationImportResult>;
    if (json.code !== 0) {
      throw new Error(json.message || '迁移包导入失败');
    }
    return json.data;
  } catch (error) {
    if (error instanceof Error && error.message !== '迁移包导入失败') {
      throw error;
    }
    throw new Error('迁移包导入响应格式不正确');
  }
}
