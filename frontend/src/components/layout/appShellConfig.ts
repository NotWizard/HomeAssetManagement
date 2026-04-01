export type AppNavItem = {
  key: string;
  label: string;
  path: string;
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  { key: 'overview', label: '总览', path: '/' },
  { key: 'analytics', label: '分析看板', path: '/analytics' },
  { key: 'entry', label: '资产负债录入', path: '/entry' },
  { key: 'members', label: '成员管理', path: '/members' },
  { key: 'import', label: 'CSV导入', path: '/import' },
  { key: 'settings', label: '设置', path: '/settings' },
];

export const APP_SHELL_UPDATE_SECTION_CLASS =
  'mt-auto border-t border-slate-200/70 p-3';
