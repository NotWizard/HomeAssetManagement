export type PickerField = 'start' | 'end';

export type CalendarDay = {
  value: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isDisabled: boolean;
  isSelected: boolean;
  isToday: boolean;
};

export type PresetOption = {
  id: 'last3Months' | 'last6Months' | 'last1Year';
  label: string;
  startDate: string;
  endDate: string;
};

export function parseDateValue(value: string): Date | null {
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!year || !month || !day) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function isSameDay(left: Date | null, right: Date | null): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftCalendarMonths(date: Date, offset: number): Date {
  const shiftedMonth = new Date(date.getFullYear(), date.getMonth() + offset, 1);
  const monthLastDay = new Date(
    shiftedMonth.getFullYear(),
    shiftedMonth.getMonth() + 1,
    0
  ).getDate();

  return new Date(
    shiftedMonth.getFullYear(),
    shiftedMonth.getMonth(),
    Math.min(date.getDate(), monthLastDay)
  );
}

function clampDateValue(value: string, minDate?: string, maxDate?: string): string {
  if (minDate && value < minDate) {
    return minDate;
  }
  if (maxDate && value > maxDate) {
    return maxDate;
  }
  return value;
}

export function buildRangeSummary(
  startDate: string,
  endDate: string,
  minDate: string,
  maxDate: string
): string {
  const start = parseDateValue(startDate);
  const end = parseDateValue(endDate);
  if (!start || !end) {
    return '暂未设置';
  }

  if (startDate === minDate && endDate === maxDate) {
    return '全部时间';
  }

  const dayCount = Math.max(
    1,
    Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
  );
  if (dayCount === 1) {
    return '单日视图';
  }

  return `已选 ${dayCount} 天`;
}

export function buildPresetOptions(
  minDate: string,
  maxDate: string
): PresetOption[] {
  const end = parseDateValue(maxDate);
  if (!minDate || !maxDate || !end) {
    return [];
  }

  return [
    {
      id: 'last3Months',
      label: '近3个月',
      startDate: clampDateValue(
        formatDateInputValue(shiftCalendarMonths(end, -3)),
        minDate,
        maxDate
      ),
      endDate: maxDate,
    },
    {
      id: 'last6Months',
      label: '近6个月',
      startDate: clampDateValue(
        formatDateInputValue(shiftCalendarMonths(end, -6)),
        minDate,
        maxDate
      ),
      endDate: maxDate,
    },
    {
      id: 'last1Year',
      label: '近1年',
      startDate: clampDateValue(
        formatDateInputValue(shiftCalendarMonths(end, -12)),
        minDate,
        maxDate
      ),
      endDate: maxDate,
    },
  ];
}

export function buildCalendarDays(
  visibleMonth: Date,
  value: string,
  min?: string,
  max?: string
): CalendarDay[] {
  const minDate = parseDateValue(min ?? '');
  const maxDate = parseDateValue(max ?? '');
  const monthStart = startOfMonth(visibleMonth);
  const gridStart = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    1 - monthStart.getDay()
  );
  const today = new Date();
  const todayAtMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index
    );
    const valueText = formatDateInputValue(date);
    const isDisabled =
      (minDate ? date < minDate : false) ||
      (maxDate ? date > maxDate : false);

    return {
      value: valueText,
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === visibleMonth.getMonth(),
      isDisabled,
      isSelected: valueText === value,
      isToday: isSameDay(date, todayAtMidnight),
    };
  });
}
