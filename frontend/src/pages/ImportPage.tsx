import { Alert, Button, Card, Space, Table, Typography, Upload, message } from 'antd';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { commitImport, fetchImportLogs, previewImport, type ImportPreview } from '../services/imports';

export function ImportPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const queryClient = useQueryClient();
  const logsQuery = useQuery({ queryKey: ['import-logs'], queryFn: fetchImportLogs });

  const previewMutation = useMutation({
    mutationFn: (target: File) => previewImport(target),
    onSuccess: (data) => {
      setPreview(data);
      messageApi.success('预检完成');
    },
    onError: (error) => messageApi.error(String(error)),
  });

  const commitMutation = useMutation({
    mutationFn: (target: File) => commitImport(target),
    onSuccess: async () => {
      messageApi.success('导入完成');
      await queryClient.invalidateQueries({ queryKey: ['import-logs'] });
      await queryClient.invalidateQueries({ queryKey: ['holdings'] });
      await queryClient.invalidateQueries({ queryKey: ['trend'] });
    },
    onError: (error) => messageApi.error(String(error)),
  });

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}
      <Typography.Title level={3} style={{ margin: 0 }}>CSV 导入</Typography.Title>

      <Card title="上传与预检">
        <Space direction="vertical">
          <Upload
            beforeUpload={(target) => {
              setFile(target);
              return false;
            }}
            maxCount={1}
          >
            <Button>选择 CSV 文件</Button>
          </Upload>

          <Space>
            <Button type="primary" disabled={!file} loading={previewMutation.isPending} onClick={() => file && previewMutation.mutate(file)}>
              预检
            </Button>
            <Button disabled={!file} loading={commitMutation.isPending} onClick={() => file && commitMutation.mutate(file)}>
              提交导入
            </Button>
          </Space>
        </Space>
      </Card>

      {preview && (
        <Card title="预检结果">
          <Alert
            type={preview.failed_rows > 0 ? 'warning' : 'success'}
            message={`总行数: ${preview.total_rows}，新增: ${preview.inserted_rows}，更新: ${preview.updated_rows}，失败: ${preview.failed_rows}`}
          />
          <Table
            style={{ marginTop: 12 }}
            size="small"
            rowKey={(row) => `${row.row}-${row.action}`}
            dataSource={preview.rows}
            columns={[
              { title: '行号', dataIndex: 'row' },
              { title: '动作', dataIndex: 'action' },
              { title: '错误', dataIndex: 'error' },
            ]}
            pagination={false}
          />
        </Card>
      )}

      <Card title="导入日志">
        <Table
          rowKey="id"
          loading={logsQuery.isLoading}
          dataSource={logsQuery.data ?? []}
          columns={[
            { title: '时间', dataIndex: 'created_at' },
            { title: '文件名', dataIndex: 'file_name' },
            { title: '总行', dataIndex: 'total_rows' },
            { title: '新增', dataIndex: 'inserted_rows' },
            { title: '更新', dataIndex: 'updated_rows' },
            { title: '失败', dataIndex: 'failed_rows' },
          ]}
        />
      </Card>
    </Space>
  );
}
