import {
  ChartSpline,
  Database,
  Home,
  Import,
  Menu,
  Settings2,
  UsersRound,
} from 'lucide-react';
import { ReactNode, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '../ui/button';
import { cn } from '../../lib/cn';
import { DesktopUpdateNotice } from './DesktopUpdateNotice';
import {
  APP_NAV_ITEMS,
  APP_SHELL_UPDATE_SECTION_CLASS,
} from './appShellConfig';

type NavItem = typeof APP_NAV_ITEMS[number] & {
  icon: ReactNode;
  group: 'main' | 'system';
};

const navItems: NavItem[] = APP_NAV_ITEMS.map((item) => {
  const icon =
    item.key === 'overview' ? (
      <Home className="h-4 w-4" />
    ) : item.key === 'analytics' ? (
      <ChartSpline className="h-4 w-4" />
    ) : item.key === 'entry' ? (
      <Database className="h-4 w-4" />
    ) : item.key === 'members' ? (
      <UsersRound className="h-4 w-4" />
    ) : item.key === 'import' ? (
      <Import className="h-4 w-4" />
    ) : (
      <Settings2 className="h-4 w-4" />
    );
  return {
    ...item,
    icon,
    group: item.key === 'settings' ? 'system' : 'main',
  };
});

const mainNav = navItems.filter((item) => item.group === 'main');
const systemNav = navItems.filter((item) => item.group === 'system');

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const current = useMemo(() => {
    const found = navItems.find(
      (item) =>
        location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
    );
    return found?.key ?? 'overview';
  }, [location.pathname]);

  const currentLabel = useMemo(
    () => navItems.find((item) => item.key === current)?.label ?? '总览',
    [current]
  );

  const renderNavGroup = (label: string, items: NavItem[]) => (
    <div className="space-y-1">
      <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
        {label}
      </div>
      {items.map((item) => {
        const active = current === item.key;
        return (
          <button
            key={item.key}
            onClick={() => {
              navigate(item.path);
              setMobileOpen(false);
            }}
            className={cn(
              'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-[background-color,color,box-shadow] duration-150',
              active
                ? 'nav-pill-active font-semibold'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
                active
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'bg-secondary text-muted-foreground group-hover:bg-surface-strong group-hover:text-foreground'
              )}
            >
              {item.icon}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  const navBody = (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Logo 区 */}
      <div className="flex h-16 items-center gap-3 px-5">
        <svg
          className="h-9 w-9 drop-shadow-sm"
          viewBox="0 0 64 64"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="家庭资产负债表"
        >
          <rect x="2" y="2" width="60" height="60" rx="14" fill="#FFFFFF" stroke="#0E1E3F" strokeOpacity="0.12" strokeWidth="1" />
          <g transform="translate(32 32)">
            <g transform="translate(4 -12) rotate(45)"><rect x="-10.5" y="-5" width="21" height="10" rx="5" fill="#2490F3" /></g>
            <g transform="translate(-4 12) rotate(45)"><rect x="-10.5" y="-5" width="21" height="10" rx="5" fill="#2490F3" /></g>
            <g transform="translate(-12 -4) rotate(-45)"><rect x="-10.5" y="-5" width="21" height="10" rx="5" fill="#0E1E3F" /></g>
            <g transform="translate(12 4) rotate(-45)"><rect x="-10.5" y="-5" width="21" height="10" rx="5" fill="#0E1E3F" /></g>
          </g>
        </svg>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">家庭资产负债表</p>
          <p className="text-[11px] text-muted-foreground">Household&nbsp;Balance&nbsp;Sheet</p>
        </div>
      </div>

      {/* 主导航 */}
      <nav className="space-y-6 px-3 pb-4">
        {renderNavGroup('主导航', mainNav)}
        {renderNavGroup('系统', systemNav)}
      </nav>

      {/* 桌面更新区，浮在底部 */}
      <div className={APP_SHELL_UPDATE_SECTION_CLASS}>
        <DesktopUpdateNotice />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen w-full">
        {/* 桌面侧边栏 */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border/60 bg-card md:block">
          {navBody}
        </aside>

        {/* 移动端侧边栏抽屉 */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              aria-label="关闭菜单"
            />
            <aside className="absolute inset-y-0 left-0 w-64 border-r border-border/60 bg-card animate-slide-down">
              {navBody}
            </aside>
          </div>
        ) : null}

        {/* 主内容区 */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 移动端顶部条：仅汉堡菜单 + 当前页名；桌面端隐藏，由各页面自身 PageHeader 承担标题 */}
          <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md md:hidden">
            <div className="flex h-14 items-center gap-3 px-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(true)}
                aria-label="打开菜单"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="text-sm font-semibold">{currentLabel}</div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
            <div className="mx-auto w-full max-w-[1500px] animate-fade-in">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
