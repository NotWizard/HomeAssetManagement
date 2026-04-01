import type {
  AnalyticsDateBounds,
  AnalyticsDateRange,
  CurrencySummary,
} from '../../services/analytics';

type AnalyticsViewLike = 'overview' | 'risk' | 'currency';

export function resolveAnalyticsDateRange(options: {
  storedRange: AnalyticsDateRange;
  initialized: boolean;
  bounds?: AnalyticsDateBounds;
}): AnalyticsDateRange {
  const { storedRange, initialized, bounds } = options;
  if (initialized || !bounds) {
    return storedRange;
  }

  return {
    startDate: bounds.start_date ?? '',
    endDate: bounds.end_date ?? '',
  };
}

export function isAnalyticsDateRangeReady(
  range: AnalyticsDateRange
): boolean {
  return Boolean(range.startDate && range.endDate);
}

export function applyStartDateChange(
  currentRange: AnalyticsDateRange,
  startDate: string
): AnalyticsDateRange {
  if (!startDate) {
    return currentRange;
  }

  return {
    startDate,
    endDate:
      !currentRange.endDate || startDate > currentRange.endDate
        ? startDate
        : currentRange.endDate,
  };
}

export function applyEndDateChange(
  currentRange: AnalyticsDateRange,
  endDate: string
): AnalyticsDateRange {
  if (!endDate) {
    return currentRange;
  }

  return {
    startDate:
      !currentRange.startDate || endDate < currentRange.startDate
        ? endDate
        : currentRange.startDate,
    endDate,
  };
}

export function resolveNextSelectedCurrency(options: {
  analyticsView: AnalyticsViewLike;
  currencySummaries: CurrencySummary[];
  selectedCurrency: string;
}): string {
  const { analyticsView, currencySummaries, selectedCurrency } = options;
  if (analyticsView !== 'currency') {
    return selectedCurrency;
  }
  if (currencySummaries.length === 0) {
    return '';
  }
  if (
    selectedCurrency &&
    currencySummaries.some((item) => item.currency === selectedCurrency)
  ) {
    return selectedCurrency;
  }

  return currencySummaries[0].currency;
}
