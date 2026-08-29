import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isExternalHttpUrl,
  isInternalNavigationUrl,
} from '../src/navigation-guard.ts';

test('导航白名单精确到当前后端端口，不再放行任意本地端口', () => {
  // 当前后端端口同源：放行
  assert.equal(isInternalNavigationUrl('http://127.0.0.1:48210/', 48210), true);
  assert.equal(isInternalNavigationUrl('http://localhost:48210/index.html', 48210), true);
  // 其他本地端口：拒绝（preload 桥带 token，任意端口放行等于把 API 交给恶意本地服务）
  assert.equal(isInternalNavigationUrl('http://127.0.0.1:9999/evil', 48210), false);
  assert.equal(isInternalNavigationUrl('http://localhost:1/', 48210), false);
  // 端口未知（后端未就绪）时 http 一律拒绝
  assert.equal(isInternalNavigationUrl('http://127.0.0.1:48210/', null), false);
  // file:// 静态资源始终放行
  assert.equal(isInternalNavigationUrl('file:///app/dist/index.html', null), true);
  // 外网与非法 URL：拒绝
  assert.equal(isInternalNavigationUrl('https://example.com', 48210), false);
  assert.equal(isInternalNavigationUrl('not-a-url', 48210), false);
});

test('外链判定只认 http/https', () => {
  assert.equal(isExternalHttpUrl('https://example.com'), true);
  assert.equal(isExternalHttpUrl('http://127.0.0.1:9999'), true);
  assert.equal(isExternalHttpUrl('file:///etc/passwd'), false);
  assert.equal(isExternalHttpUrl('javascript:alert(1)'), false);
  assert.equal(isExternalHttpUrl('not-a-url'), false);
});
