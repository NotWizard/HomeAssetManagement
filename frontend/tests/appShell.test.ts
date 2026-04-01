import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  ROUTER_FUTURE_FLAGS,
  resolveRouterKind,
} from '../src/app/routerConfig.ts';
import {
  APP_NAV_ITEMS,
  APP_SHELL_UPDATE_SECTION_CLASS,
} from '../src/components/layout/appShellConfig.ts';

const FRONTEND_ROOT = process.cwd();

function readFrontendFile(relativePath: string): string {
  return readFileSync(resolve(FRONTEND_ROOT, relativePath), 'utf8');
}

test('应用壳会声明 favicon 资源，避免开发环境持续请求 404 图标', () => {
  const html = readFrontendFile('index.html');

  assert.match(html, /<link[^>]+rel="icon"[^>]+href="\/favicon\.svg"/);
  assert.equal(existsSync(resolve(FRONTEND_ROOT, 'public/favicon.svg')), true);
});

test('桌面模式与 Web 模式会分别选择 HashRouter 和 BrowserRouter，并显式开启 v7 future flags', () => {
  assert.equal(resolveRouterKind(true), 'hash');
  assert.equal(resolveRouterKind(false), 'browser');
  assert.deepEqual(ROUTER_FUTURE_FLAGS, {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  });
});

test('侧边栏导航顺序符合当前产品要求，并移除本地模式无登录提示', () => {
  assert.deepEqual(
    APP_NAV_ITEMS.map((item) => item.label),
    ['总览', '分析看板', '资产负债录入', '成员管理', 'CSV导入', '设置']
  );
});

test('桌面模式下侧边栏左下角会展示更新入口组件', () => {
  assert.equal(APP_SHELL_UPDATE_SECTION_CLASS.includes('mt-auto'), true);
});
