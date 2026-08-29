import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { escapeHtml } from '../src/utils/escapeHtml.ts';

test('escapeHtml 转义全部 HTML 特殊字符', () => {
  assert.equal(
    escapeHtml(`<img src=x onerror=alert(1)> & "quoted" 'single'`),
    '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot; &#39;single&#39;'
  );
  assert.equal(escapeHtml('普通文本'), '普通文本');
  assert.equal(escapeHtml(''), '');
});

test('所有向 tooltip 拼用户可控字符串的图表源码都经过 escapeHtml', () => {
  // chartOptions.ts 有运行时相对导入，node --test 无法直接 import；
  // 用源码级断言锁定转义调用点（与 release-workflow / hardening 测试同模式）。
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/charts/chartOptions.ts'),
    'utf8'
  );

  // 相关性矩阵：资产名
  assert.match(source, /escapeHtml\(data\.assets\[y\]\)/);
  assert.match(source, /escapeHtml\(data\.assets\[x\]\)/);
  // 币种敞口：axisValue（用户录入的币种代码）
  assert.match(source, /escapeHtml\(`\$\{params\[0\]\.axisValue\}`\)/);
  // 币种构成：params.name
  assert.match(source, /escapeHtml\(params\.name\)/);
  // 波动率：轴标签
  assert.match(source, /escapeHtml\(head\.axisValueLabel \?\? head\.name \?\? ''\)/);
  // 桑基图：节点显示名 / 成员名 / 分类路径 / 未命名兜底
  assert.match(source, /escapeHtml\(getDisplayName\(sourceNode\)\)/);
  assert.match(source, /escapeHtml\(getDisplayName\(targetNode\)\)/);
  assert.match(source, /escapeHtml\(getDisplayName\(node\)\)/);
  assert.match(source, /escapeHtml\(node\.member_name\)/);
  assert.match(source, /escapeHtml\(node\.category_path\)/);
  assert.match(source, /escapeHtml\(params\.name \?\? '未命名节点'\)/);
});
