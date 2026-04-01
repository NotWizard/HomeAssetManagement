import assert from 'node:assert/strict';
import test from 'node:test';

import type { CurrencySummary } from '../src/services/analytics.ts';

const currencySummaries: CurrencySummary[] = [
  {
    currency: 'USD',
    total_asset: 1200,
    total_liability: 100,
    net_asset: 1100,
    total_asset_base: 8600,
    total_liability_base: 700,
    net_asset_base: 7900,
    asset_count: 2,
    liability_count: 1,
  },
  {
    currency: 'EUR',
    total_asset: 800,
    total_liability: 0,
    net_asset: 800,
    total_asset_base: 6200,
    total_liability_base: 0,
    net_asset_base: 6200,
    asset_count: 1,
    liability_count: 0,
  },
];

test('resolveAnalyticsDateRange 会在未初始化时回退到后端 date bounds', async () => {
  const { resolveAnalyticsDateRange } = await import('../src/components/analytics/analyticsPageState.ts');

  assert.deepEqual(
    resolveAnalyticsDateRange({
      storedRange: { startDate: '', endDate: '' },
      initialized: false,
      bounds: { start_date: '2025-01-01', end_date: '2025-03-31' },
    }),
    { startDate: '2025-01-01', endDate: '2025-03-31' }
  );

  assert.deepEqual(
    resolveAnalyticsDateRange({
      storedRange: { startDate: '2025-02-01', endDate: '2025-02-28' },
      initialized: true,
      bounds: { start_date: '2025-01-01', end_date: '2025-03-31' },
    }),
    { startDate: '2025-02-01', endDate: '2025-02-28' }
  );
});

test('applyStartDateChange 会在开始日期晚于结束日期时同步收口 endDate', async () => {
  const { applyStartDateChange } = await import('../src/components/analytics/analyticsPageState.ts');

  assert.deepEqual(
    applyStartDateChange(
      { startDate: '2025-01-01', endDate: '2025-02-01' },
      '2025-03-01'
    ),
    { startDate: '2025-03-01', endDate: '2025-03-01' }
  );

  assert.deepEqual(
    applyStartDateChange(
      { startDate: '2025-01-01', endDate: '2025-02-01' },
      ''
    ),
    { startDate: '2025-01-01', endDate: '2025-02-01' }
  );
});

test('applyEndDateChange 会在结束日期早于开始日期时同步收口 startDate', async () => {
  const { applyEndDateChange } = await import('../src/components/analytics/analyticsPageState.ts');

  assert.deepEqual(
    applyEndDateChange(
      { startDate: '2025-03-01', endDate: '2025-03-31' },
      '2025-02-15'
    ),
    { startDate: '2025-02-15', endDate: '2025-02-15' }
  );

  assert.deepEqual(
    applyEndDateChange(
      { startDate: '2025-03-01', endDate: '2025-03-31' },
      ''
    ),
    { startDate: '2025-03-01', endDate: '2025-03-31' }
  );
});

test('resolveNextSelectedCurrency 会在币种视图下保持合法选择，否则回退到首个币种', async () => {
  const { resolveNextSelectedCurrency } = await import('../src/components/analytics/analyticsPageState.ts');

  assert.equal(
    resolveNextSelectedCurrency({
      analyticsView: 'currency',
      currencySummaries,
      selectedCurrency: 'EUR',
    }),
    'EUR'
  );

  assert.equal(
    resolveNextSelectedCurrency({
      analyticsView: 'currency',
      currencySummaries,
      selectedCurrency: '',
    }),
    'USD'
  );

  assert.equal(
    resolveNextSelectedCurrency({
      analyticsView: 'currency',
      currencySummaries: [],
      selectedCurrency: 'USD',
    }),
    ''
  );

  assert.equal(
    resolveNextSelectedCurrency({
      analyticsView: 'overview',
      currencySummaries,
      selectedCurrency: 'USD',
    }),
    'USD'
  );
});
