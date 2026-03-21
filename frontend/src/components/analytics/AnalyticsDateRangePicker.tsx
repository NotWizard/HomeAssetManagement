import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '../../lib/cn';

type AnalyticsDateRangePickerProps = {
  startDate: string;
  endDate: string;
  minDate: string;
  maxDate: string;
  onStartDateChange: (startDate: string) => void;
  onEndDateChange: (endDate: string) => void;
  onRangeChange: (range: { startDate: string; endDate: string }) => void;
};

type PickerField = 'start' | 'end';

type CalendarDay = {
  value: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isDisabled: boolean;
  isSelected: boolean;
  isToday: boolean;
};

type PresetOption = {
  id: 'last3Months' | 'last6Months' | 'last1Year' | 'allTime';
  label: string;
  startDate: string;
  endDate: string;
};

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function parseDateValue(value: string): Date | null {
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

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatDateValue(value: string): string {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return '未选择';
  }

  return `${parsed.getFullYear()}.${String(parsed.getMonth() + 1).padStart(2, '0')}.${String(parsed.getDate()).padStart(2, '0')}`;
}

function buildRangeSummary(startDate: string, endDate: string): string {
  const start = parseDateValue(startDate);
  const end = parseDateValue(endDate);
  if (!start || !end) {
    return '暂未设置';
  }

  const dayCount = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
  if (dayCount === 1) {
    return '单日视图';
  }

  return `已选 ${dayCount} 天`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function shiftCalendarMonths(date: Date, offset: number): Date {
  const shiftedMonth = new Date(date.getFullYear(), date.getMonth() + offset, 1);
  const monthLastDay = new Date(shiftedMonth.getFullYear(), shiftedMonth.getMonth() + 1, 0).getDate();

  return new Date(shiftedMonth.getFullYear(), shiftedMonth.getMonth(), Math.min(date.getDate(), monthLastDay));
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

function formatMonthLabel(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function pickEarlierDate(left?: string, right?: string): string | undefined {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return left < right ? left : right;
}

function pickLaterDate(left?: string, right?: string): string | undefined {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return left > right ? left : right;
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

function buildPresetOptions(minDate: string, maxDate: string): PresetOption[] {
  const end = parseDateValue(maxDate);
  if (!minDate || !maxDate || !end) {
    return [];
  }

  return [
    {
      id: 'last3Months',
      label: '近3个月',
      startDate: clampDateValue(formatDateInputValue(shiftCalendarMonths(end, -3)), minDate, maxDate),
      endDate: maxDate,
    },
    {
      id: 'last6Months',
      label: '近6个月',
      startDate: clampDateValue(formatDateInputValue(shiftCalendarMonths(end, -6)), minDate, maxDate),
      endDate: maxDate,
    },
    {
      id: 'last1Year',
      label: '近1年',
      startDate: clampDateValue(formatDateInputValue(shiftCalendarMonths(end, -12)), minDate, maxDate),
      endDate: maxDate,
    },
    {
      id: 'allTime',
      label: '全部时间',
      startDate: minDate,
      endDate: maxDate,
    },
  ];
}

function buildCalendarDays(visibleMonth: Date, value: string, min?: string, max?: string): CalendarDay[] {
  const minDate = parseDateValue(min ?? '');
  const maxDate = parseDateValue(max ?? '');
  const monthStart = startOfMonth(visibleMonth);
  const gridStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 - monthStart.getDay());
  const today = new Date();
  const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    const valueText = formatDateInputValue(date);
    const isDisabled = (minDate ? date < minDate : false) || (maxDate ? date > maxDate : false);

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

function DateSegmentTrigger({
  label,
  value,
  isActive,
  onClick,
  className,
}: {
  label: string;
  value: string;
  isActive: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={isActive}
      aria-label={`选择${label}`}
      onClick={onClick}
      className={cn(
        'group flex h-12 w-full items-center gap-2 rounded-[16px] px-3 text-left transition-colors duration-200 hover:bg-slate-50',
        isActive && 'bg-slate-50',
        className
      )}
    >
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <span className="truncate text-sm font-semibold text-slate-900">{formatDateValue(value)}</span>
    </button>
  );
}

export function AnalyticsDateRangePicker({
  startDate,
  endDate,
  minDate,
  maxDate,
  onStartDateChange,
  onEndDateChange,
  onRangeChange,
}: AnalyticsDateRangePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [openField, setOpenField] = useState<'start' | 'end' | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(parseDateValue(endDate || maxDate) ?? new Date())
  );
  const rangeSummary = buildRangeSummary(startDate, endDate);

  const activeValue = openField === 'start' ? startDate : endDate;
  const activeMin = openField === 'end' ? pickLaterDate(minDate, startDate) : minDate;
  const activeMax = openField === 'start' ? pickEarlierDate(maxDate, endDate) : maxDate;

  const presetOptions = useMemo(() => buildPresetOptions(minDate, maxDate), [minDate, maxDate]);
  const activePresetId = presetOptions.find((option) => option.startDate === startDate && option.endDate === endDate)?.id;

  useEffect(() => {
    if (!openField) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenField(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenField(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openField]);

  useEffect(() => {
    if (!openField) {
      return;
    }

    const initialDate = parseDateValue(openField === 'start' ? startDate : endDate) ?? parseDateValue(maxDate) ?? new Date();
    setVisibleMonth(startOfMonth(initialDate));
  }, [openField, startDate, endDate, maxDate]);

  const calendarDays = useMemo(() => {
    if (!openField) {
      return [];
    }

    return buildCalendarDays(visibleMonth, activeValue, activeMin, activeMax);
  }, [activeMax, activeMin, activeValue, openField, visibleMonth]);

  const handleFieldToggle = (field: PickerField) => {
    const nextField = openField === field ? null : field;
    setOpenField(nextField);

    if (!nextField) {
      return;
    }

    const initialDate =
      parseDateValue(nextField === 'start' ? startDate : endDate) ?? parseDateValue(maxDate) ?? new Date();
    setVisibleMonth(startOfMonth(initialDate));
  };

  const handleDateSelect = (value: string) => {
    if (openField === 'start') {
      onStartDateChange(value);
    } else if (openField === 'end') {
      onEndDateChange(value);
    }

    setOpenField(null);
  };

  const handlePresetSelect = (option: PresetOption) => {
    onRangeChange({
      startDate: option.startDate,
      endDate: option.endDate,
    });
    setOpenField(null);
  };

  return (
    <section className="w-full xl:min-w-[520px] xl:max-w-[540px]">
      <div className="flex flex-col gap-3">
        <div ref={containerRef} className="relative">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex min-w-0 items-center gap-2 px-1">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">时间区间</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{rangeSummary}</p>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 items-center rounded-[18px] border border-slate-200/80 bg-white/90 px-1">
              <DateSegmentTrigger
                label="开始日期"
                value={startDate}
                isActive={openField === 'start'}
                onClick={() => handleFieldToggle('start')}
                className="flex-1"
              />
              <div className="flex h-8 items-center px-1 text-slate-300">
                <ArrowRight className="h-4 w-4 shrink-0" />
              </div>
              <DateSegmentTrigger
                label="结束日期"
                value={endDate}
                isActive={openField === 'end'}
                onClick={() => handleFieldToggle('end')}
                className="flex-1"
              />
            </div>
          </div>

          {openField ? (
            <div
              role="dialog"
              aria-label={openField === 'start' ? '选择开始日期' : '选择结束日期'}
              className="absolute right-0 top-full z-50 mt-3 w-full max-w-[340px] rounded-[22px] border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {openField === 'start' ? '选择开始日期' : '选择结束日期'}
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900">{formatMonthLabel(visibleMonth)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="上一个月"
                    className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="下一个月"
                    className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-1">
                {DAY_LABELS.map((label) => (
                  <div
                    key={label}
                    className="flex h-8 items-center justify-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400"
                  >
                    {label}
                  </div>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-7 gap-1">
                {calendarDays.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    disabled={day.isDisabled}
                    onClick={() => handleDateSelect(day.value)}
                    className={cn(
                      'flex h-10 items-center justify-center rounded-[14px] text-sm font-medium transition-colors',
                      day.isDisabled && 'cursor-not-allowed text-slate-300',
                      !day.isDisabled && 'hover:bg-slate-100',
                      !day.isCurrentMonth && !day.isSelected && 'text-slate-400',
                      day.isCurrentMonth && !day.isSelected && 'text-slate-700',
                      day.isSelected && 'bg-primary text-primary-foreground hover:bg-primary',
                      day.isToday && !day.isSelected && 'border border-primary/40 text-primary'
                    )}
                  >
                    {day.dayNumber}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between rounded-[16px] bg-slate-50 px-3 py-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">当前选择</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{formatDateValue(activeValue)}</p>
                </div>
                <button
                  type="button"
                  className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
                  onClick={() => setOpenField(null)}
                >
                  完成
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {presetOptions.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-2">
            {presetOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handlePresetSelect(option)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  activePresetId === option.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
