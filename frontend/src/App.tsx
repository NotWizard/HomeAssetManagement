import { BarChartOutlined, DatabaseOutlined, HomeOutlined, ImportOutlined, SettingOutlined } from '@ant-design/icons';
import { Layout, Menu, theme } from 'antd';
import { useMemo } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { AnalyticsPage } from './pages/AnalyticsPage';
import { EntryPage } from './pages/EntryPage';
import { ImportPage } from './pages/ImportPage';
import { OverviewPage } from './pages/OverviewPage';
import { SettingsPage } from './pages/SettingsPage';

const { Header, Sider, Content } = Layout;

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  const selectedKeys = useMemo(() => {
    if (location.pathname.startsWith('/entry')) return ['entry'];
    if (location.pathname.startsWith('/import')) return ['import'];
    if (location.pathname.startsWith('/analytics')) return ['analytics'];
    if (location.pathname.startsWith('/settings')) return ['settings'];
    return ['overview'];
  }, [location.pathname]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={230} theme="light" style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
          家庭资产管理
        </div>
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          onClick={(item) => navigate(item.key === 'overview' ? '/' : `/${item.key}`)}
          items={[
            { key: 'overview', icon: <HomeOutlined />, label: '总览' },
            { key: 'entry', icon: <DatabaseOutlined />, label: '资产负债录入' },
            { key: 'import', icon: <ImportOutlined />, label: 'CSV 导入' },
            { key: 'analytics', icon: <BarChartOutlined />, label: '分析看板' },
            { key: 'settings', icon: <SettingOutlined />, label: '设置' },
          ]}
        />
      </Sider>

      <Layout>
        <Header style={{ background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}` }} />
        <Content style={{ margin: 16 }}>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/entry" element={<EntryPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
