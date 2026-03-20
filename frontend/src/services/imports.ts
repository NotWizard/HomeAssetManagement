import { getJSON, postForm } from './apiClient';
import { getApiBaseUrl } from '../config/runtime';

export type ImportPreview = {
  total_rows: number;
  inserted_rows: number;
  updated_rows: number;
  failed_rows: number;
  rows: Array<{ row: number; action: string; error: string | null }>;
};

export type ImportCommitResult = {
  import_id: number;
  total_rows: number;
  updated_rows: number;
  inserted_rows: number;
  failed_rows: number;
  error_report_path: string | null;
};

export type ImportLog = {
  id: number;
  file_name: string;
  total_rows: number;
  updated_rows: number;
  inserted_rows: number;
  failed_rows: number;
  error_report_path: string | null;
  created_at: string;
};

export function previewImport(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return postForm<ImportPreview>('/imports/preview', formData);
}

export function commitImport(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return postForm<ImportCommitResult>('/imports/commit', formData);
}

export function fetchImportLogs() {
  return getJSON<ImportLog[]>('/imports/logs');
}

function resolveFilename(response: Response, fallback: string) {
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? fallback;
}

async function parseDownloadError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string; detail?: string };
    return payload.message || payload.detail || '下载失败';
  } catch {
    return '下载失败';
  }
}

export async function downloadImportErrors(importId: number) {
  const response = await fetch(`${getApiBaseUrl()}/imports/${importId}/errors`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(await parseDownloadError(response));
  }

  const blob = await response.blob();
  const filename = resolveFilename(response, `import-errors-${importId}.csv`);

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
