export function formatCurrency(value: number, currency = 'CNY') {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatNumber(value: number, digits = 2) {
  return Number(value || 0).toFixed(digits);
}

export function formatPercent(value: number, digits = 2) {
  return `${formatNumber(value, digits)}%`;
}
