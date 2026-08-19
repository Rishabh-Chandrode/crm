'use client';

import { useState, useEffect, useMemo, useId, useRef } from 'react';

interface Props {
  value: string; // "YYYY-MM-DDTHH:mm"
  onChange: (value: string) => void;
  min?: string; // "YYYY-MM-DDTHH:mm"
  className?: string;
  inline?: boolean;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function parseDateTimeString(val: string) {
  const d = val ? new Date(val) : new Date();
  const safeDate = isNaN(d.getTime()) ? new Date() : d;
  
  const year = safeDate.getFullYear();
  const month = safeDate.getMonth();
  const day = safeDate.getDate();
  let hours = safeDate.getHours();
  const minutes = safeDate.getMinutes();
  const period: 'AM' | 'PM' = hours >= 12 ? 'PM' : 'AM';
  
  let displayHour = hours % 12;
  if (displayHour === 0) displayHour = 12;

  const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;

  return { year, month, day, hours, minutes, displayHour, period, dateStr };
}

export default function DateTimePicker({
  value,
  onChange,
  min,
  className = '',
  inline = false,
}: Props) {
  const parsed = useMemo(() => parseDateTimeString(value), [value]);

  const [viewYear, setViewYear] = useState(parsed.year);
  const [viewMonth, setViewMonth] = useState(parsed.month);
  const [selectedDate, setSelectedDate] = useState(parsed.dateStr);
  const [hour12, setHour12] = useState(parsed.displayHour);
  const [minute, setMinute] = useState(parsed.minutes);
  const [period, setPeriod] = useState<'AM' | 'PM'>(parsed.period);
  const [open, setOpen] = useState(inline);

  const containerRef = useRef<HTMLDivElement>(null);
  const instanceId = useId();

  // Sync internal state when value prop changes externally
  useEffect(() => {
    const p = parseDateTimeString(value);
    setViewYear(p.year);
    setViewMonth(p.month);
    setSelectedDate(p.dateStr);
    setHour12(p.displayHour);
    setMinute(p.minutes);
    setPeriod(p.period);
  }, [value]);

  // Close popup on outside click if not inline
  useEffect(() => {
    if (inline || !open) return;
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, inline]);

  function emitChange(newDateStr: string, newHour12: number, newMinute: number, newPeriod: 'AM' | 'PM') {
    let h24 = newHour12 % 12;
    if (newPeriod === 'PM') h24 += 12;
    const formatted = `${newDateStr}T${pad(h24)}:${pad(newMinute)}`;
    onChange(formatted);
  }

  function handleDateSelect(dateStr: string) {
    setSelectedDate(dateStr);
    emitChange(dateStr, hour12, minute, period);
  }

  function handleHourChange(newHour: number) {
    const clamped = Math.max(1, Math.min(12, newHour));
    setHour12(clamped);
    emitChange(selectedDate, clamped, minute, period);
  }

  function handleMinuteChange(newMin: number) {
    const clamped = Math.max(0, Math.min(59, newMin));
    setMinute(clamped);
    emitChange(selectedDate, hour12, clamped, period);
  }

  function handlePeriodToggle(newPeriod: 'AM' | 'PM') {
    setPeriod(newPeriod);
    emitChange(selectedDate, hour12, minute, newPeriod);
  }

  // Quick preset actions
  function applyPreset(offsetHours: number, targetHour?: number, targetMinute?: number) {
    const d = new Date();
    d.setHours(d.getHours() + offsetHours);
    if (targetHour !== undefined && targetMinute !== undefined) {
      d.setHours(targetHour, targetMinute, 0, 0);
    }
    const y = d.getFullYear();
    const m = d.getMonth();
    const dateStr = `${y}-${pad(m + 1)}-${pad(d.getDate())}`;
    let h = d.getHours();
    const minVal = d.getMinutes();
    const p: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;

    setViewYear(y);
    setViewMonth(m);
    setSelectedDate(dateStr);
    setHour12(h12);
    setMinute(minVal);
    setPeriod(p);
    emitChange(dateStr, h12, minVal, p);
  }

  // Calendar math
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const minDateStr = min ? min.split('T')[0] : '';
  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }, []);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  const formattedDisplay = useMemo(() => {
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return 'Select date & time';
      return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return 'Select date & time';
    }
  }, [value]);

  const pickerPanel = (
    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.4)] space-y-3 select-none">
      {/* Quick Presets Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <button
          type="button"
          onClick={() => applyPreset(2)}
          className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200/60 dark:border-slate-700/60 transition-colors"
        >
          +2 Hours
        </button>
        <button
          type="button"
          onClick={() => applyPreset(24, 9, 0)}
          className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200/60 dark:border-slate-700/60 transition-colors"
        >
          Tomorrow 9 AM
        </button>
        <button
          type="button"
          onClick={() => applyPreset(24, 14, 0)}
          className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200/60 dark:border-slate-700/60 transition-colors"
        >
          Tomorrow 2 PM
        </button>
      </div>

      {/* Month & Year Navigation Header */}
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={prevMonth}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            aria-label="Previous Month"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            aria-label="Next Month"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Day of week headers */}
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {DAYS_SHORT.map((d) => (
          <div key={d} className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Days Matrix */}
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {/* Previous Month trailing days */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => {
          const dayNum = daysInPrevMonth - firstDayOfWeek + i + 1;
          return (
            <div
              key={`prev-${i}`}
              className="w-7 h-7 mx-auto flex items-center justify-center text-[11px] text-slate-300 dark:text-slate-700"
            >
              {dayNum}
            </div>
          );
        })}

        {/* Current Month days */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const currentDayStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(dayNum)}`;
          const isSelected = selectedDate === currentDayStr;
          const isToday = todayStr === currentDayStr;
          const isDisabled = minDateStr && currentDayStr < minDateStr;

          return (
            <button
              key={currentDayStr}
              type="button"
              disabled={Boolean(isDisabled)}
              onClick={() => handleDateSelect(currentDayStr)}
              className={`w-7 h-7 mx-auto rounded-lg text-[11px] font-semibold flex items-center justify-center transition-all duration-150 relative ${
                isDisabled
                  ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-40'
                  : isSelected
                  ? 'bg-gradient-to-tr from-indigo-600 to-violet-500 text-white font-bold shadow-sm shadow-indigo-500/30 scale-105 z-10'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
              }`}
            >
              {dayNum}
              {isToday && !isSelected && (
                <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-indigo-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Time Selection Controls */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Time
          </span>
          <div className="flex items-center gap-1">
            {/* Quick minute pills */}
            {[0, 15, 30, 45].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleMinuteChange(m)}
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border transition-colors ${
                  minute === m
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500/40 text-indigo-600 dark:text-indigo-400'
                    : 'border-slate-200/60 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                :{pad(m)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Hour Input with Stepper */}
          <div className="flex-1 flex items-center bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-0.5">
            <span className="text-[9px] font-bold text-slate-400 mr-1 uppercase">Hr</span>
            <input
              type="number"
              min={1}
              max={12}
              value={hour12}
              onChange={(e) => handleHourChange(parseInt(e.target.value, 10) || 1)}
              className="w-full text-xs font-bold text-slate-900 dark:text-slate-100 bg-transparent focus:outline-none"
            />
          </div>

          <span className="text-slate-400 font-bold text-xs">:</span>

          {/* Minute Input with Stepper */}
          <div className="flex-1 flex items-center bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-0.5">
            <span className="text-[9px] font-bold text-slate-400 mr-1 uppercase">Min</span>
            <input
              type="number"
              min={0}
              max={59}
              value={pad(minute)}
              onChange={(e) => handleMinuteChange(parseInt(e.target.value, 10) || 0)}
              className="w-full text-xs font-bold text-slate-900 dark:text-slate-100 bg-transparent focus:outline-none font-mono"
            />
          </div>

          {/* AM / PM Toggle */}
          <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => handlePeriodToggle('AM')}
              className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                period === 'AM'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              AM
            </button>
            <button
              type="button"
              onClick={() => handlePeriodToggle('PM')}
              className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                period === 'PM'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              PM
            </button>
          </div>
        </div>
      </div>

      {/* Selected Time Banner */}
      <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
        <span className="text-slate-400 font-medium">Scheduled for:</span>
        <span className="font-bold text-indigo-600 dark:text-indigo-400 truncate max-w-[190px]">
          {formattedDisplay}
        </span>
      </div>
    </div>
  );

  if (inline) {
    return <div className={`w-full ${className}`}>{pickerPanel}</div>;
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={instanceId}
        onClick={() => setOpen((v) => !v)}
        className="form-input w-full text-left flex items-center justify-between gap-2 pr-3 cursor-pointer hover:border-indigo-500/40 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
            {formattedDisplay}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Popover Dropdown */}
      {open && (
        <div id={instanceId} className="absolute z-50 mt-2 left-0 right-0 min-w-[300px]">
          {pickerPanel}
        </div>
      )}
    </div>
  );
}
