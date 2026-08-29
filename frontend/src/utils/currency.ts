/**
 * 币种展示名 / 搜索别名的单一来源。
 *
 * 原先分析页、币种总览、录入页、设置页各自维护一份（标签风格还不一致），
 * 加币种要改四处。统一到这里：展示名一律 `CNY（人民币）` 风格。
 */

export const COMMON_CURRENCIES: readonly string[] = [
  'CNY',
  'USD',
  'EUR',
  'HKD',
  'JPY',
  'GBP',
  'AUD',
  'CAD',
  'CHF',
  'SGD',
];

export const CURRENCY_LABELS: Record<string, string> = {
  CNY: 'CNY（人民币）',
  USD: 'USD（美元）',
  EUR: 'EUR（欧元）',
  HKD: 'HKD（港币）',
  JPY: 'JPY（日元）',
  GBP: 'GBP（英镑）',
  AUD: 'AUD（澳元）',
  CAD: 'CAD（加拿大元）',
  CHF: 'CHF（瑞士法郎）',
  SGD: 'SGD（新加坡元）',
};

/** 录入页币种选择器的搜索别名（中文名 + 英文关键词）。 */
export const CURRENCY_SEARCH_TEXT: Record<string, string> = {
  CNY: '人民币 china chinese yuan renminbi',
  USD: '美元 us dollar america',
  EUR: '欧元 euro',
  HKD: '港币 hong kong dollar',
  JPY: '日元 yen japan',
  GBP: '英镑 pound uk',
  AUD: '澳元 australia dollar',
  CAD: '加拿大元 canada dollar',
  CHF: '瑞士法郎 swiss franc',
  SGD: '新加坡元 singapore dollar',
};

export function formatCurrencyLabel(currency: string): string {
  return CURRENCY_LABELS[currency] ?? `${currency}（当前币种）`;
}
