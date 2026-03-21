import { ArrowRight, CalendarDays } from 'lucide-react';
import { type RefObject, useRef } from 'react';

import { Input } from '../ui/input';

type AnalyticsDateRangePickerProps = {
  startDate: string;
  endDate: string;
  onStartDateChange: (startDate: string) => void;
  onEndDateChange: (endDate: string) => void;
};

function formatDateValue(value: string): string {
  if (!value) {
    return '未选择';
  }

  const [year, month, day] = value.split('-');
  if (!year || !month || !day) {
    return value;
  }

  return `${year}.${month}.${day}`;
}

function buildRangeSummary(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return '暂未设置';
  }

  const dayCount = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
  if (dayCount === 1) {
    return '单日视图';
  }

  return `已选 ${dayCount} 天`;
}

function openPicker(inputRef: RefObject<HTMLInputElement>) {
  const input = inputRef.current;
  if (!input) {
    return;
  }

  if (typeof input.showPicker === 'function') {
    input.showPicker();
    return;
  }

  input.focus();
}

function DateSegmentTrigger({
  label,
  value,
  min,
  max,
  onChange,
  inputRef,
  className,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement>;
  className?: string;
}) {
  return (
    <div className={`relative min-w-0 ${className ?? 'flex-1'}`}>
      <button
        type="button"
        onClick={() => openPicker(inputRef)}
        className="group flex h-12 w-full items-center gap-2 rounded-[16px] px-3 text-left transition-colors duration-200 hover:bg-white/90"
      >
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
        <span className="truncate text-sm font-semibold text-slate-900">{formatDateValue(value)}</span>
      </button>
      <Input
        ref={inputRef}
        type="date"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
      />
    </div>
  );
}

export function AnalyticsDateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: AnalyticsDateRangePickerProps) {
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const rangeSummary = buildRangeSummary(startDate, endDate);

  return (
    <section className="w-full xl:min-w-[520px] xl:max-w-[540px]">
      <div className="flex w-full flex-col gap-2 rounded-[20px] bg-slate-100/80 p-2 sm:flex-row sm:items-center sm:gap-1.5">
        <div className="flex min-w-0 items-center gap-2 px-2 py-2 sm:pr-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-white/90 text-primary">
            <CalendarDays className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">时间区间</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{rangeSummary}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center rounded-[18px] bg-white/80 px-1">
          <DateSegmentTrigger
            label="开始日期"
            value={startDate}
            max={endDate}
            onChange={onStartDateChange}
            inputRef={startInputRef}
            className="flex-1"
          />
          <div className="flex h-8 items-center px-1 text-slate-300">
            <ArrowRight className="h-4 w-4 shrink-0" />
          </div>
          <DateSegmentTrigger
            label="结束日期"
            value={endDate}
            min={startDate}
            onChange={onEndDateChange}
            inputRef={endInputRef}
            className="flex-1"
          />
        </div>
      </div>
    </section>
  );
}
