import { ChartSpline, Database, Home, Import, Menu, Settings2, UsersRound, WalletCards } from 'lucide-react';
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
  { key: 'analytics', label: '分析看板', icon: <ChartSpline className="h-4 w-4" />, path: '/analytics' },
  { key: 'entry', label: '资产负债录入', icon: <Database className="h-4 w-4" />, path: '/entry' },
  { key: 'members', label: '成员管理', icon: <UsersRound className="h-4 w-4" />, path: '/members' },
  { key: 'import', label: 'CSV导入', icon: <Import className="h-4 w-4" />, path: '/import' },
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
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200/70 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <WalletCards className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-wide">家庭资产负债表</p>
        </div>
      </div>
      <nav className="space-y-1.5 p-3">
        {navItems.map((item) => {
          const active = current === item.key;
          return (
            <button
              key={item.key}
              className={cn(
                'flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm transition-all',
                active
                  ? 'bg-gradient-to-r from-primary to-cyan-500 text-primary-foreground shadow-soft'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
    </div>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(95rem_48rem_at_4%_-8%,rgba(99,102,241,0.13),transparent),radial-gradient(72rem_36rem_at_95%_-28%,rgba(34,211,238,0.12),transparent)]">
      <div className="flex min-h-screen w-full">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-slate-200/70 bg-white/85 backdrop-blur-xl md:block">
          {navBody}
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} aria-label="关闭菜单" />
            <aside className="absolute inset-y-0 left-0 w-72 border-r bg-card">{navBody}</aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-background/85 backdrop-blur">
            <div className="flex h-14 items-center px-4 md:px-6">
              <Button variant="ghost" size="icon" className="mr-auto md:hidden" onClick={() => setMobileOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
