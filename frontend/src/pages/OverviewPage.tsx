import { Card, Col, Row, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { fetchTrend } from '../services/analytics';
import { TrendChart } from '../components/charts/TrendChart';

export function OverviewPage() {
  const { data: trend } = useQuery({ queryKey: ['trend', 30], queryFn: () => fetchTrend(30) });

  const latestIdx = trend && trend.net_asset.length > 0 ? trend.net_asset.length - 1 : -1;
  const totalAsset = latestIdx >= 0 ? trend!.total_asset[latestIdx] : 0;
  const totalLiability = latestIdx >= 0 ? trend!.total_liability[latestIdx] : 0;
  const netAsset = latestIdx >= 0 ? trend!.net_asset[latestIdx] : 0;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>总览</Typography.Title>
      <Row gutter={16}>
        <Col span={8}><Card title="总资产">{totalAsset.toLocaleString()}</Card></Col>
        <Col span={8}><Card title="总负债">{totalLiability.toLocaleString()}</Card></Col>
        <Col span={8}><Card title="净资产">{netAsset.toLocaleString()}</Card></Col>
      </Row>
      <Card title="资产趋势（近 30 条）">
        <TrendChart
          dates={trend?.dates ?? []}
          totalAsset={trend?.total_asset ?? []}
          totalLiability={trend?.total_liability ?? []}
          netAsset={trend?.net_asset ?? []}
        />
      </Card>
    </Space>
  );
}
