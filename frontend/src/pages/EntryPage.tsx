import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createMember, fetchMembers } from '../services/members';
import { createHolding, deleteHolding, fetchHoldings, updateHolding, type HoldingPayload } from '../services/holdings';
import { fetchCategories } from '../services/categories';
import type { CategoryNode, Holding } from '../types';

type PathOption = {
  key: string;
  label: string;
  l1Id: number;
  l2Id: number;
  l3Id: number;
};

function buildPathOptions(tree: CategoryNode[]): PathOption[] {
  const result: PathOption[] = [];
  for (const l1 of tree) {
    for (const l2 of l1.children ?? []) {
      for (const l3 of l2.children ?? []) {
        result.push({
          key: `${l1.id}|${l2.id}|${l3.id}`,
          label: `${l1.name} / ${l2.name} / ${l3.name}`,
          l1Id: l1.id,
          l2Id: l2.id,
          l3Id: l3.id,
        });
      }
    }
  }
  return result;
}

export function EntryPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [newMemberName, setNewMemberName] = useState('');
  const [form] = Form.useForm();

  const queryClient = useQueryClient();

  const membersQuery = useQuery({ queryKey: ['members'], queryFn: fetchMembers });
  const holdingsQuery = useQuery({ queryKey: ['holdings'], queryFn: fetchHoldings });
  const assetCategoryQuery = useQuery({ queryKey: ['categories', 'asset'], queryFn: () => fetchCategories('asset') });
  const liabilityCategoryQuery = useQuery({ queryKey: ['categories', 'liability'], queryFn: () => fetchCategories('liability') });

  const createMutation = useMutation({
    mutationFn: createHolding,
    onSuccess: async () => {
      messageApi.success('创建成功');
      setOpen(false);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ['holdings'] });
      await queryClient.invalidateQueries({ queryKey: ['trend'] });
    },
    onError: (error) => messageApi.error(String(error)),
  });

  const createMemberMutation = useMutation({
    mutationFn: createMember,
    onSuccess: async () => {
      messageApi.success('成员创建成功');
      setNewMemberName('');
      await queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (error) => messageApi.error(String(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: HoldingPayload }) => updateHolding(id, payload),
    onSuccess: async () => {
      messageApi.success('更新成功');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ['holdings'] });
      await queryClient.invalidateQueries({ queryKey: ['trend'] });
    },
    onError: (error) => messageApi.error(String(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteHolding,
    onSuccess: async () => {
      messageApi.success('删除成功');
      await queryClient.invalidateQueries({ queryKey: ['holdings'] });
      await queryClient.invalidateQueries({ queryKey: ['trend'] });
    },
    onError: (error) => messageApi.error(String(error)),
  });

  const memberNameMap = useMemo(() => {
    const map = new Map<number, string>();
    (membersQuery.data ?? []).forEach((m) => map.set(m.id, m.name));
    return map;
  }, [membersQuery.data]);

  const allPathOptions = useMemo(() => {
    return {
      asset: buildPathOptions(assetCategoryQuery.data ?? []),
      liability: buildPathOptions(liabilityCategoryQuery.data ?? []),
    };
  }, [assetCategoryQuery.data, liabilityCategoryQuery.data]);

  const onSubmit = async () => {
    const values = await form.validateFields();
    const selectedKey = values.path as string;
    const options = values.type === 'asset' ? allPathOptions.asset : allPathOptions.liability;
    const selectedPath = options.find((p) => p.key === selectedKey);
    if (!selectedPath) {
      messageApi.error('请选择有效分类路径');
      return;
    }

    const payload: HoldingPayload = {
      member_id: values.member_id,
      type: values.type,
      name: values.name,
      category_l1_id: selectedPath.l1Id,
      category_l2_id: selectedPath.l2Id,
      category_l3_id: selectedPath.l3Id,
      currency: values.currency,
      amount_original: String(values.amount_original),
      target_ratio: values.type === 'asset' ? String(values.target_ratio ?? '') : null,
    };

    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}
      <Typography.Title level={3} style={{ margin: 0 }}>资产负债录入</Typography.Title>
      <Button
        type="primary"
        onClick={() => {
          setEditing(null);
          form.resetFields();
          form.setFieldValue('type', 'asset');
          setOpen(true);
        }}
      >
        新增条目
      </Button>
      <Space>
        <Input
          placeholder="新增成员名称"
          value={newMemberName}
          onChange={(event) => setNewMemberName(event.target.value)}
          style={{ width: 220 }}
        />
        <Button
          onClick={() => {
            const value = newMemberName.trim();
            if (!value) {
              messageApi.warning('请输入成员名称');
              return;
            }
            createMemberMutation.mutate(value);
          }}
          loading={createMemberMutation.isPending}
        >
          添加成员
        </Button>
      </Space>

      <Table
        rowKey="id"
        loading={holdingsQuery.isLoading}
        dataSource={holdingsQuery.data ?? []}
        columns={[
          { title: '名称', dataIndex: 'name' },
          {
            title: '类型',
            dataIndex: 'type',
            render: (value: string) => <Tag color={value === 'asset' ? 'blue' : 'orange'}>{value}</Tag>,
          },
          {
            title: '成员',
            dataIndex: 'member_id',
            render: (id: number) => memberNameMap.get(id) ?? id,
          },
          { title: '币种', dataIndex: 'currency' },
          { title: '原币金额', dataIndex: 'amount_original' },
          { title: '折算金额', dataIndex: 'amount_base' },
          { title: '目标占比(%)', dataIndex: 'target_ratio' },
          {
            title: '操作',
            render: (_, row) => (
              <Space>
                <Button
                  size="small"
                  onClick={() => {
                    setEditing(row);
                    const options = row.type === 'asset' ? allPathOptions.asset : allPathOptions.liability;
                    const path = options.find((p) => p.l3Id === row.category_l3_id) ?? null;
                    form.setFieldsValue({
                      member_id: row.member_id,
                      type: row.type,
                      name: row.name,
                      currency: row.currency,
                      amount_original: row.amount_original,
                      target_ratio: row.target_ratio,
                      path: path?.key,
                    });
                    setOpen(true);
                  }}
                >
                  编辑
                </Button>
                <Popconfirm title="确认删除？" onConfirm={() => deleteMutation.mutate(row.id)}>
                  <Button size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑条目' : '新增条目'}
        open={open}
        onOk={onSubmit}
        onCancel={() => setOpen(false)}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical" initialValues={{ type: 'asset', currency: 'CNY' }}>
          <Form.Item label="成员" name="member_id" rules={[{ required: true }]}>
            <Select options={(membersQuery.data ?? []).map((m) => ({ label: m.name, value: m.id }))} />
          </Form.Item>
          <Form.Item label="类型" name="type" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '资产', value: 'asset' },
                { label: '负债', value: 'liability' },
              ]}
              onChange={() => form.setFieldValue('path', undefined)}
            />
          </Form.Item>
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => {
              const type = form.getFieldValue('type') as 'asset' | 'liability';
              const options = (type === 'asset' ? allPathOptions.asset : allPathOptions.liability).map((p) => ({
                label: p.label,
                value: p.key,
              }));
              return (
                <Form.Item label="分类路径" name="path" rules={[{ required: true }]}>
                  <Select options={options} />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item label="币种" name="currency" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="金额" name="amount_original" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.000001} />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => form.getFieldValue('type') === 'asset' ? (
              <Form.Item label="期望占比(%)" name="target_ratio" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} max={100} />
              </Form.Item>
            ) : null}
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
