import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('导入提交成功后清空文件与预检状态，防止重复提交同一文件', () => {
  // 页面组件无法在 node --test 渲染，用源码级断言锁定回归（同 desktopBridge 测试模式）
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/ImportPage.tsx'),
    'utf8'
  );

  const commitBlock = source.match(/const commitMutation[\s\S]*?onError/);
  assert.ok(commitBlock, '应找到 commitMutation 定义');
  assert.match(commitBlock[0], /setFile\(null\)/);
  assert.match(commitBlock[0], /setPreview\(null\)/);
  assert.match(commitBlock[0], /fileInputRef\.current\.value = ''/);
});
