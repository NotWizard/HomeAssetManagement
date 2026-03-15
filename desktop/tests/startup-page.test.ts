import assert from 'node:assert/strict';
import test from 'node:test';

test('启动页会渲染品牌化的等待界面和分步提示', async () => {
  const startupPageModule = await import('../src/startup-page.ts');

  const html = startupPageModule.createLoadingPage();

  assert.match(html, /Home Asset Management/);
  assert.match(html, /正在连接本地服务/);
  assert.match(html, /载入资产数据/);
  assert.match(html, /准备桌面工作台/);
  assert.match(html, /linear-gradient/);
  assert.match(html, /<svg/);
});

test('错误页会提示先重试，再在必要时查看系统设置', async () => {
  const startupPageModule = await import('../src/startup-page.ts');

  const html = startupPageModule.createErrorPage('后端健康检查超时');

  assert.match(html, /应用启动失败/);
  assert.match(html, /后端健康检查超时/);
  assert.match(html, /请先退出应用后重新打开/);
  assert.match(html, /系统设置/);
});
