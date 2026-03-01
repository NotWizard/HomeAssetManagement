import { getJSON, postForm } from './apiClient';

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
