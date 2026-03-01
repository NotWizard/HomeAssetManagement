import { Button, Card, Form, Input, InputNumber, Space, Typography, message } from 'antd';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchSettings, updateSettings } from '../services/settings';
import type { Settings } from '../types';

export function SettingsPage() {
  const [form] = Form.useForm<Settings>();
  const [messageApi, contextHolder] = message.useMessage();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });

  useEffect(() => {
    if (settingsQuery.data) {
      form.setFieldsValue(settingsQuery.data);
    }
  }, [settingsQuery.data, form]);

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: async () => {
      messageApi.success('设置已保存');
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['rebalance'] });
    },
    onError: (error) => messageApi.error(String(error)),
  });

  const onSubmit = async () => {
    const values = await form.validateFields();
    mutation.mutate(values);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}
      <Typography.Title level={3} style={{ margin: 0 }}>设置</Typography.Title>
      <Card>
        <Form form={form} layout="vertical">
          <Form.Item label="基准币" name="base_currency" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="时区" name="timezone" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="再平衡阈值(%)" name="rebalance_threshold_pct" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} max={99.99} step={0.1} />
          </Form.Item>
          <Form.Item label="汇率提供方" name="fx_provider" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Button type="primary" loading={mutation.isPending} onClick={onSubmit}>保存设置</Button>
        </Form>
      </Card>
    </Space>
  );
}
