import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMMON_CURRENCIES,
  CURRENCY_LABELS,
  CURRENCY_SEARCH_TEXT,
  formatCurrencyLabel,
} from '../src/utils/currency.ts';

test('常用币种清单一处维护，每个币种都有展示名与搜索别名', () => {
  assert.ok(COMMON_CURRENCIES.length >= 10);
  for (const currency of COMMON_CURRENCIES) {
    assert.ok(CURRENCY_LABELS[currency], `${currency} 缺展示名`);
    assert.ok(CURRENCY_SEARCH_TEXT[currency], `${currency} 缺搜索别名`);
    assert.match(CURRENCY_LABELS[currency], new RegExp(`^${currency}（`));
  }
});

test('formatCurrencyLabel 未知币种回退为“当前币种”标记', () => {
  assert.equal(formatCurrencyLabel('CNY'), 'CNY（人民币）');
  assert.equal(formatCurrencyLabel('BTC'), 'BTC（当前币种）');
});
