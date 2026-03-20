import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const FRONTEND_ROOT = process.cwd();

function readFrontendFile(relativePath: string): string {
  return readFileSync(resolve(FRONTEND_ROOT, relativePath), 'utf8');
}

function findTypeBlock(source: string, typeName: string): string {
  const match = source.match(
    new RegExp(`export type ${typeName} = \\{([\\s\\S]*?)\\};`, 'm')
  );
  assert.ok(match, `未找到类型定义: ${typeName}`);
  return match[1] ?? '';
}

function findUseMutationBlock(source: string, constName: string): string {
  const match = source.match(
    new RegExp(
      `const ${constName} = useMutation\\(\\{([\\s\\S]*?)\\}\\);`,
      'm'
    )
  );
  assert.ok(match, `未找到 useMutation 定义: ${constName}`);
  return match[1] ?? '';
}

test('设置更新 payload 不再包含 timezone 字段', () => {
  const typesSource = readFrontendFile('src/types/index.ts');
  const block = findTypeBlock(typesSource, 'SettingsUpdatePayload');

  assert.match(block, /base_currency:/);
  assert.match(block, /rebalance_threshold_pct:/);
  assert.doesNotMatch(block, /timezone:/);
});

test('设置页应展示后端真实 timezone，并避免提交 timezone', () => {
  const source = readFrontendFile('src/pages/SettingsPage.tsx');

  assert.match(source, /settingsQuery\.data\?\.timezone/);
  assert.doesNotMatch(source, /mutation\.mutate\([\s\S]*timezone:/);
});

test('录入页单条 create\/update\/delete mutation 需要处理 onError', () => {
  const source = readFrontendFile('src/pages/EntryPage.tsx');

  const createBlock = findUseMutationBlock(source, 'createHoldingMutation');
  const updateBlock = findUseMutationBlock(source, 'updateHoldingMutation');
  const deleteBlock = findUseMutationBlock(source, 'deleteHoldingMutation');

  assert.match(createBlock, /onError:/);
  assert.match(updateBlock, /onError:/);
  assert.match(deleteBlock, /onError:/);
});

test('总览页与分析页需要对 query error 做明确展示', () => {
  const overviewSource = readFrontendFile('src/pages/OverviewPage.tsx');
  const analyticsSource = readFrontendFile('src/pages/AnalyticsPage.tsx');

  assert.match(overviewSource, /isError/);
  assert.match(analyticsSource, /isError/);
});

test('分析页时间区间筛选需要作用于桑基图与再平衡请求', () => {
  const analyticsSource = readFrontendFile('src/pages/AnalyticsPage.tsx');

  assert.match(analyticsSource, /queryKey:\s*\[\s*'sankey',\s*analyticsDateRange\.startDate,\s*analyticsDateRange\.endDate\s*\]/);
  assert.match(analyticsSource, /queryKey:\s*\[\s*'rebalance',\s*analyticsDateRange\.startDate,\s*analyticsDateRange\.endDate\s*\]/);
});

test('导入页提交按钮必须依赖预检结果，并提供错误明细下载入口', () => {
  const importSource = readFrontendFile('src/pages/ImportPage.tsx');
  const importsService = readFrontendFile('src/services/imports.ts');

  assert.match(importSource, /disabled=\{\s*!file\s*\|\|\s*!preview\s*\|\|/);
  assert.match(importSource, /downloadImportErrors/);
  assert.match(importsService, /downloadImportErrors/);
  assert.match(importsService, /\/imports\/\$\{importId\}\/errors/);
});

test('折算金额展示应按真实基准币，而不是默认 CNY', () => {
  const overviewSource = readFrontendFile('src/pages/OverviewPage.tsx');

  assert.match(overviewSource, /const baseCurrency = settingsQuery\.data\?\.base_currency/);
  assert.match(overviewSource, /formatCurrency\(latest\.netAsset,\s*baseCurrency/);
  assert.match(overviewSource, /formatCurrency\(latest\.totalAsset,\s*baseCurrency/);
  assert.match(overviewSource, /formatCurrency\(latest\.totalLiability,\s*baseCurrency/);
});
