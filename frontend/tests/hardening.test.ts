import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

test('设置页在 settings 请求失败时应保留最近一次成功数据，并在缺少服务端值时回退本机时区', () => {
  const source = readFrontendFile('src/pages/SettingsPage.tsx');

  assert.match(source, /settingsQuery\.isError/);
  assert.match(source, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone\s*\|\|\s*'UTC'/);
  assert.match(source, /本机默认，未从服务端读取到/);
  assert.match(source, /当前展示最近一次成功结果/);
  assert.match(source, /if\s*\(\s*!settingsQuery\.data\s*\)/);
  assert.match(source, /disabled=\{mutation\.isPending \|\| settingsQuery\.isLoading \|\| !settingsQuery\.data\}/);
  assert.doesNotMatch(source, /if\s*\(\s*settingsQuery\.isError\s*\|\|\s*!settingsQuery\.data\s*\)/);
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

test('总览页关键 query 应只在无缓存数据时降级为错误态', () => {
  const source = readFrontendFile('src/pages/OverviewPage.tsx');

  assert.match(source, /trendQuery\.isError\s*&&\s*!trendQuery\.data/);
  assert.match(source, /holdingsQuery\.isError\s*&&\s*!holdingsQuery\.data/);
  assert.match(source, /settingsQuery\.isError\s*&&\s*!settingsQuery\.data/);
  assert.match(source, /rebalanceQuery\.isError\s*&&\s*!rebalanceQuery\.data/);
  assert.match(source, /最近一次成功结果/);
  assert.doesNotMatch(source, /const criticalQueriesFailed = trendQuery\.isError \|\| holdingsQuery\.isError \|\| settingsQuery\.isError/);
});

test('成员页请求失败时应保留旧列表，仅在无数据时显示替代错误行', () => {
  const source = readFrontendFile('src/pages/MembersPage.tsx');

  assert.match(source, /membersQuery\.isError/);
  assert.match(source, /成员加载失败/);
  assert.match(source, /membersQuery\.isError\s*&&\s*!membersQuery\.data/);
  assert.match(source, /当前展示最近一次成功结果/);
  assert.match(source, /!membersQuery\.isError\s*&&\s*\(membersQuery\.data \?\? \[\]\)\.length === 0/);
});

test('分析页时间区间筛选需要作用于桑基图与再平衡请求', () => {
  const analyticsSource = readFrontendFile('src/pages/AnalyticsPage.tsx');

  assert.match(analyticsSource, /queryKey:\s*queryKeys\.sankey\.range\(analyticsDateRange\)/);
  assert.match(analyticsSource, /queryKey:\s*queryKeys\.rebalance\.range\(analyticsDateRange\)/);
});

test('分析页应从后端读取时间边界，并将默认时间初始化为全部时间', () => {
  const analyticsPageSource = readFrontendFile('src/pages/AnalyticsPage.tsx');
  const analyticsServiceSource = readFrontendFile('src/services/analytics.ts');
  const uiStoreSource = readFrontendFile('src/store/uiStore.ts');

  assert.match(analyticsServiceSource, /export type AnalyticsDateBounds = \{/);
  assert.match(analyticsServiceSource, /fetchAnalyticsDateBounds/);
  assert.match(analyticsServiceSource, /\/analytics\/date-bounds/);

  assert.match(analyticsPageSource, /queryKey:\s*queryKeys\.analyticsDateBounds\.all\(\)/);
  assert.match(analyticsPageSource, /fetchAnalyticsDateBounds/);
  assert.match(analyticsPageSource, /analyticsDateRangeInitialized/);
  assert.match(analyticsPageSource, /analyticsDateBoundsQuery\.data\?\.start_date/);
  assert.match(analyticsPageSource, /analyticsDateBoundsQuery\.data\?\.end_date/);

  assert.match(uiStoreSource, /analyticsDateRangeInitialized:\s*boolean/);
  assert.match(uiStoreSource, /startDate:\s*''/);
  assert.match(uiStoreSource, /endDate:\s*''/);
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
