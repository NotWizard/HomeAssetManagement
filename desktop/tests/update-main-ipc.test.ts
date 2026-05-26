import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = resolve(TEST_DIR, '..');

function readDesktopFile(relativePath: string): string {
  return readFileSync(resolve(DESKTOP_ROOT, relativePath), 'utf8');
}

test('主进程会暴露更新查询与下载安装 IPC', () => {
  const source = readDesktopFile('src/main.ts');

  assert.match(source, /UPDATE_IPC_CHANNELS\.getState/);
  assert.match(source, /UPDATE_IPC_CHANNELS\.check/);
  assert.match(source, /UPDATE_IPC_CHANNELS\.download/);
  assert.match(source, /UPDATE_IPC_CHANNELS\.install/);
});

test('主进程就绪后会启动更新轮询并在退出时停止', () => {
  const source = readDesktopFile('src/main.ts');

  assert.match(source, /updateController\.start\(\)/);
  assert.match(source, /updateController\.stop\(\)/);
});

test('主进程在 macOS 上注册 powerMonitor resume 监听以重启不健康的 sidecar', () => {
  const source = readDesktopFile('src/main.ts');

  // 只在 darwin 启用（其他平台 sleep/resume 语义差太多，本任务范围只覆盖 macOS）
  assert.match(source, /process\.platform !== ['"]darwin['"]/);
  // 必须订阅 powerMonitor 'resume' 事件
  assert.match(source, /powerMonitor\.on\(\s*['"]resume['"]/);
  // resume 后要做的事：probeBackendHealth → 失败则 stopAndResetPort + bootstrap
  assert.match(source, /probeBackendHealth/);
  assert.match(source, /backendController\.stopAndResetPort\(\)/);
  // 节流：避免短时间多次唤醒触发多次重启
  assert.match(source, /SLEEP_WAKE_RESTART_THROTTLE_MS/);
});
