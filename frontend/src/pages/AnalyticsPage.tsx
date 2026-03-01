import { Card, Col, Row, Select, Space, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';

import { CorrelationHeatmap } from '../components/charts/CorrelationHeatmap';
import { SankeyChart } from '../components/charts/SankeyChart';
import { TrendChart } from '../components/charts/TrendChart';
import { VolatilityChart } from '../components/charts/VolatilityChart';
import { fetchCorrelation, fetchRebalance, fetchSankey, fetchTrend, fetchVolatility } from '../services/analytics';
import { useUIStore } from '../store/uiStore';

export function AnalyticsPage() {
  const window = useUIStore((state) => state.analyticsWindow);
  const setWindow = useUIStore((state) => state.setAnalyticsWindow);

  const trendQuery = useQuery({ queryKey: ['trend', window], queryFn: () => fetchTrend(window) });
  const volatilityQuery = useQuery({ queryKey: ['volatility', window], queryFn: () => fetchVolatility(window) });
  const correlationQuery = useQuery({ queryKey: ['correlation', window], queryFn: () => fetchCorrelation(window) });
  const sankeyQuery = useQuery({ queryKey: ['sankey'], queryFn: fetchSankey });
  const rebalanceQuery = useQuery({ queryKey: ['rebalance'], queryFn: fetchRebalance });

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>分析看板</Typography.Title>
        <Select
          style={{ width: 160 }}
          value={window}
          options={[
            { label: '30 天', value: 30 },
            { label: '90 天', value: 90 },
            { label: '180 天', value: 180 },
            { label: '365 天', value: 365 },
          ]}
          onChange={setWindow}
        />
      </Space>

      <Card title="趋势图">
        <TrendChart
          dates={trendQuery.data?.dates ?? []}
          totalAsset={trendQuery.data?.total_asset ?? []}
          totalLiability={trendQuery.data?.total_liability ?? []}
          netAsset={trendQuery.data?.net_asset ?? []}
        />
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="资产波动率">
            <VolatilityChart data={volatilityQuery.data ?? []} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="再平衡提醒">
            <Table
              size="small"
              pagination={false}
              rowKey="id"
              dataSource={rebalanceQuery.data ?? []}
              columns={[
                { title: '资产', dataIndex: 'name' },
                { title: '目标占比', dataIndex: 'target_ratio', render: (v: number) => `${v.toFixed(2)}%` },
                { title: '当前占比', dataIndex: 'current_ratio', render: (v: number) => `${v.toFixed(2)}%` },
                { title: '偏离', dataIndex: 'deviation', render: (v: number) => `${v.toFixed(2)}%` },
                { title: '状态', dataIndex: 'status' },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card title="相关性矩阵">
        <CorrelationHeatmap data={correlationQuery.data ?? { assets: [], matrix: [] }} />
      </Card>

      <Card title="家庭资产负债桑基图">
        <SankeyChart data={sankeyQuery.data ?? { nodes: [], links: [] }} />
      </Card>
    </Space>
  );
}
