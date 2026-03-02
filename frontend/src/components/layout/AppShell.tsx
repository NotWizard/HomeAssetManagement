import { Bell, ChartSpline, Database, Home, Import, Menu, Settings2, WalletCards } from 'lucide-react';
import { ReactNode, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '../ui/button';
import { cn } from '../../lib/cn';

type NavItem = {
  key: string;
  label: string;
  icon: ReactNode;
  path: string;
};

const navItems: NavItem[] = [
  { key: 'overview', label: '总览', icon: <Home className="h-4 w-4" />, path: '/' },
  { key: 'entry', label: '资产负债录入', icon: <Database className="h-4 w-4" />, path: '/entry' },
  { key: 'import', label: 'CSV 导入', icon: <Import className="h-4 w-4" />, path: '/import' },
  { key: 'analytics', label: '分析看板', icon: <ChartSpline className="h-4 w-4" />, path: '/analytics' },
  { key: 'settings', label: '设置', icon: <Settings2 className="h-4 w-4" />, path: '/settings' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const current = useMemo(() => {
    const found = navItems.find((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
    return found?.key ?? 'overview';
  }, [location.pathname]);

  const navBody = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <WalletCards className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">Home Assets</p>
          <p className="text-xs text-muted-foreground">Finova Style</p>
        </div>
      </div>
      <nav className="space-y-1 p-3">
        {navItems.map((item) => {
          const active = current === item.key;
          return (
            <button
              key={item.key}
              className={cn(
                'flex h-10 w-full items-center gap-2 rounded-lg px-3 text-sm transition-colors',
                active ? 'bg-primary text-primary-foreground shadow-soft' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
              onClick={() => {
                navigate(item.path);
                setMobileOpen(false);
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto p-3 text-xs text-muted-foreground">本地模式 / 无登录</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(80rem_35rem_at_10%_-10%,rgba(108,99,255,0.11),transparent),radial-gradient(70rem_30rem_at_90%_-30%,rgba(64,177,255,0.11),transparent)]">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-64 border-r bg-card/80 backdrop-blur md:block">{navBody}</aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} aria-label="关闭菜单" />
            <aside className="absolute inset-y-0 left-0 w-72 border-r bg-card">{navBody}</aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b bg-card/75 backdrop-blur">
            <div className="flex h-16 items-center justify-between px-4 md:px-6">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
                  <Menu className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-base font-semibold">家庭资产管理系统</h1>
                  <p className="text-xs text-muted-foreground">现代金融专业视图</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-muted-foreground">
                <Button variant="ghost" size="icon">
                  <Bell className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
