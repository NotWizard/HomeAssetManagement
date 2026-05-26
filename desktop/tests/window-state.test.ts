import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  getWindowStatePath,
  isBoundsVisibleOnDisplays,
  loadWindowBounds,
  saveWindowBounds,
  type DisplayWorkArea,
} from '../src/window-state.ts';

function withTempDir(callback: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'window-state-test-'));
  try {
    callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('getWindowStatePath 把状态文件放在 userData 目录下', () => {
  const path = getWindowStatePath('/tmp/userdata');
  assert.equal(path, '/tmp/userdata/window-state.json');
});

test('loadWindowBounds 在文件缺失时返回 null', () => {
  withTempDir((dir) => {
    const bounds = loadWindowBounds(join(dir, 'missing.json'));
    assert.equal(bounds, null);
  });
});

test('loadWindowBounds 在内容非合法 JSON 时返回 null', () => {
  withTempDir((dir) => {
    const file = join(dir, 'window-state.json');
    writeFileSync(file, 'not json {');
    const bounds = loadWindowBounds(file);
    assert.equal(bounds, null);
  });
});

test('loadWindowBounds 在字段缺失或非数字时返回 null', () => {
  withTempDir((dir) => {
    const file = join(dir, 'window-state.json');
    writeFileSync(file, JSON.stringify({ x: 0, y: 0, width: '100', height: 100 }));
    const bounds = loadWindowBounds(file);
    assert.equal(bounds, null);
  });
});

test('loadWindowBounds 在宽高为 0 或负数时返回 null', () => {
  withTempDir((dir) => {
    const file = join(dir, 'window-state.json');
    writeFileSync(file, JSON.stringify({ x: 100, y: 100, width: 0, height: 720 }));
    assert.equal(loadWindowBounds(file), null);
  });
});

test('loadWindowBounds 在合法内容时返回 bounds', () => {
  withTempDir((dir) => {
    const file = join(dir, 'window-state.json');
    writeFileSync(
      file,
      JSON.stringify({ x: 120, y: 80, width: 1440, height: 900 })
    );
    const bounds = loadWindowBounds(file);
    assert.deepEqual(bounds, { x: 120, y: 80, width: 1440, height: 900 });
  });
});

test('saveWindowBounds 创建父目录并写入合法 JSON', () => {
  withTempDir((dir) => {
    const file = join(dir, 'nested', 'window-state.json');
    saveWindowBounds(file, { x: 10, y: 20, width: 300, height: 400 });
    const reloaded = loadWindowBounds(file);
    assert.deepEqual(reloaded, { x: 10, y: 20, width: 300, height: 400 });
  });
});

test('isBoundsVisibleOnDisplays 在窗口完全覆盖在 display 内时返回 true', () => {
  const displays: DisplayWorkArea[] = [{ x: 0, y: 0, width: 1920, height: 1080 }];
  const bounds = { x: 100, y: 100, width: 1440, height: 900 };
  assert.equal(isBoundsVisibleOnDisplays(bounds, displays), true);
});

test('isBoundsVisibleOnDisplays 在窗口部分超出 display 但有足够可见区域时返回 true', () => {
  const displays: DisplayWorkArea[] = [{ x: 0, y: 0, width: 1920, height: 1080 }];
  // 窗口右下角部分溢出，但仍有 1320x880 的可见区域
  const bounds = { x: 600, y: 200, width: 1440, height: 900 };
  assert.equal(isBoundsVisibleOnDisplays(bounds, displays), true);
});

test('isBoundsVisibleOnDisplays 在窗口完全落在所有 display 之外时返回 false', () => {
  const displays: DisplayWorkArea[] = [{ x: 0, y: 0, width: 1920, height: 1080 }];
  // 模拟外接屏拔掉：窗口落在原副屏坐标，与主屏无交集
  const bounds = { x: 3000, y: 500, width: 1440, height: 900 };
  assert.equal(isBoundsVisibleOnDisplays(bounds, displays), false);
});

test('isBoundsVisibleOnDisplays 在窗口与任一 display 有足够重叠时返回 true', () => {
  const displays: DisplayWorkArea[] = [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 0, width: 2560, height: 1440 },
  ];
  // 窗口在副屏内
  const bounds = { x: 2200, y: 200, width: 1600, height: 1000 };
  assert.equal(isBoundsVisibleOnDisplays(bounds, displays), true);
});

test('isBoundsVisibleOnDisplays 在窗口可见区域不足 100x100 时返回 false', () => {
  const displays: DisplayWorkArea[] = [{ x: 0, y: 0, width: 1920, height: 1080 }];
  // 只有右下 50x50 像素与 display 有交集，不足 100x100 的最低可见面积
  const bounds = { x: 1870, y: 1030, width: 1440, height: 900 };
  assert.equal(isBoundsVisibleOnDisplays(bounds, displays), false);
});
