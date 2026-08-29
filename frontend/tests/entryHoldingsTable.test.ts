import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('GroupBlock 的 onToggle 是稳定引用，不再每次 render 新建闭包击穿 memo', () => {
  // 组件渲染行为无法在 node --test 直接断言，用源码级断言锁定（同 desktopBridge 测试模式）
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/entry/EntryHoldingsTable.tsx'),
    'utf8'
  );

  // toggleGroup 必须是 useCallback 包裹的稳定引用
  assert.match(source, /const toggleGroup = useCallback\(/);
  // 传给 memo 子组件的是稳定引用本身，memberId 由子组件内部回传
  assert.match(source, /onToggle=\{toggleGroup\}/);
  assert.doesNotMatch(source, /onToggle=\{\(\) => toggleGroup/);
  assert.match(source, /onClick=\{\(\) => onToggle\(summary\.memberId\)\}/);
});
