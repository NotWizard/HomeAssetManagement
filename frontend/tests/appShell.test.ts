import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

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
  const mainSource = readFrontendFile('src/main.tsx');

  assert.match(mainSource, /HashRouter/);
  assert.match(mainSource, /BrowserRouter/);
  assert.match(mainSource, /v7_startTransition:\s*true/);
  assert.match(mainSource, /v7_relativeSplatPath:\s*true/);
});

test('侧边栏导航顺序符合当前产品要求，并移除本地模式无登录提示', () => {
  const shellSource = readFrontendFile('src/components/layout/AppShell.tsx');
  const labels = Array.from(shellSource.matchAll(/label:\s*'([^']+)'/g)).map((match) => match[1]);

  assert.deepEqual(labels, ['总览', '分析看板', '资产负债录入', '成员管理', 'CSV导入', '设置']);
  assert.doesNotMatch(shellSource, /本地模式\s*\/\s*无登录/);
});
