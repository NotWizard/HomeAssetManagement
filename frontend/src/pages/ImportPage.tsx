import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, UploadCloud } from 'lucide-react';

import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { invalidateHoldingRelatedQueries } from '../services/holdingRelatedQueries';
import { commitImport, fetchImportLogs, previewImport, type ImportPreview } from '../services/imports';

export function ImportPage() {
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const logsQuery = useQuery({ queryKey: ['import-logs'], queryFn: fetchImportLogs });

  const previewMutation = useMutation({
    mutationFn: (target: File) => previewImport(target),
    onSuccess: (data) => {
      setPreview(data);
      setError(null);
    },
    onError: (e) => setError(String(e)),
  });

  const commitMutation = useMutation({
    mutationFn: (target: File) => commitImport(target),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['import-logs'] });
      await invalidateHoldingRelatedQueries(queryClient);
    },
    onError: (e) => setError(String(e)),
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">CSV 导入中心</h2>
        <p className="text-sm text-muted-foreground">上传、预检、提交三步完成资产负债批量同步</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">上传与预检</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border border-dashed bg-secondary/45 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <UploadCloud className="h-4 w-4" />
              选择 CSV 文件（UTF-8 编码）
            </div>
            <Input
              type="file"
              accept=".csv"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                setFile(next);
                setPreview(null);
              }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => file && previewMutation.mutate(file)}
              disabled={!file || previewMutation.isPending}
            >
              <FileUp className="mr-2 h-4 w-4" />
              预检
            </Button>
            <Button onClick={() => file && commitMutation.mutate(file)} disabled={!file || commitMutation.isPending}>
              提交导入
            </Button>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">预检结果</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">总行数 {preview.total_rows}</Badge>
              <Badge variant="success">新增 {preview.inserted_rows}</Badge>
              <Badge variant="default">更新 {preview.updated_rows}</Badge>
              <Badge variant={preview.failed_rows > 0 ? 'danger' : 'success'}>失败 {preview.failed_rows}</Badge>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>行号</TableHead>
                    <TableHead>动作</TableHead>
                    <TableHead>错误</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => (
                    <TableRow key={`${row.row}-${row.action}-${row.error ?? ''}`}>
                      <TableCell>{row.row}</TableCell>
                      <TableCell>{row.action}</TableCell>
                      <TableCell>{row.error ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">导入日志</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>文件名</TableHead>
                  <TableHead>总行</TableHead>
                  <TableHead>新增</TableHead>
                  <TableHead>更新</TableHead>
                  <TableHead>失败</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logsQuery.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{new Date(row.created_at).toLocaleString('zh-CN')}</TableCell>
                    <TableCell>{row.file_name}</TableCell>
                    <TableCell>{row.total_rows}</TableCell>
                    <TableCell>{row.inserted_rows}</TableCell>
                    <TableCell>{row.updated_rows}</TableCell>
                    <TableCell>{row.failed_rows}</TableCell>
                  </TableRow>
                ))}
                {(logsQuery.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      暂无导入记录
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
