import { ArrowRight, CalendarDays, ChevronDown } from 'lucide-react';
import { type RefObject, useRef } from 'react';

import { cn } from '../../lib/cn';
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

function formatRangeSummary(startDate: string, endDate: string): string {
  if (!startDate || !endDate) {
    return '请选择时间区间';
  }

  return `${formatDateValue(startDate)} - ${formatDateValue(endDate)}`;
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

function DateField({
  label,
  value,
  helperText,
  min,
  max,
  onChange,
  inputRef,
  accentClassName,
}: {
  label: string;
  value: string;
  helperText: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement>;
  accentClassName: string;
}) {
  return (
    <label className="group relative block overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/80 to-slate-100/60 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <div className="pointer-events-none flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{formatDateValue(value)}</p>
          <p className="mt-1 text-xs text-slate-500">{helperText}</p>
        </div>
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/90 shadow-sm',
            accentClassName
          )}
        >
          <CalendarDays className="h-4 w-4" />
        </div>
      </div>
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
    </label>
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

  return (
    <section className="w-full rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,250,252,0.92))] p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur xl:max-w-[680px]">
      <button
        type="button"
        onClick={() => openPicker(startInputRef)}
        className="flex w-full items-center justify-between gap-4 rounded-[22px] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,41,59,0.88))] px-4 py-4 text-left text-white transition-transform duration-200 hover:-translate-y-0.5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/14 text-cyan-100 shadow-inner shadow-white/10">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100/80">时间区间</p>
            <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-white sm:text-base">
              <span className="truncate">{formatDateValue(startDate)}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-cyan-200/80" />
              <span className="truncate">{formatDateValue(endDate)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-300">点击整块区域即可快速调整开始日期，再用下方卡片精细选择。</p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/12 px-3 py-2 text-xs font-medium text-white/90 ring-1 ring-white/10">
          编辑日期
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <DateField
          label="开始日期"
          value={startDate}
          max={endDate}
          onChange={onStartDateChange}
          inputRef={startInputRef}
          helperText="建议选择你希望纳入统计的最早日期"
          accentClassName="text-cyan-600"
        />
        <DateField
          label="结束日期"
          value={endDate}
          min={startDate}
          onChange={onEndDateChange}
          inputRef={endInputRef}
          helperText={`当前区间：${formatRangeSummary(startDate, endDate)}`}
          accentClassName="text-indigo-600"
        />
      </div>
    </section>
  );
}
