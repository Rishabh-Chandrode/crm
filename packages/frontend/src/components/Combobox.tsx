'use client';

import { useState, useRef, useEffect, useId } from 'react';

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface Props {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Allow clearing back to empty string */
  clearable?: boolean;
  clearLabel?: string;
}

export default function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Choose…',
  className = '',
  clearable = true,
  clearLabel = 'None',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const instanceId = useId();

  const selected = options.find((o) => o.value === value);

  const filtered = query.trim()
    ? options.filter((o) =>
        `${o.label} ${o.sublabel ?? ''}`.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  // Prepend a clear option when clearable and nothing forced
  const listItems: ComboboxOption[] = clearable
    ? [{ value: '', label: clearLabel }, ...filtered]
    : filtered;

  function openDropdown() {
    setOpen(true);
    setQuery('');
    setActiveIdx(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function close() {
    setOpen(false);
    setQuery('');
    setActiveIdx(-1);
  }

  function select(val: string) {
    onChange(val);
    close();
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, listItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      select(listItems[activeIdx]!.value);
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const item = listRef.current.children[activeIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  return (
    <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={instanceId}
        onClick={() => (open ? close() : openDropdown())}
        className="form-input w-full text-left flex items-center justify-between gap-2 pr-3 cursor-pointer"
      >
        <span className={`truncate ${selected ? 'text-zinc-900 dark:text-zinc-100 font-medium' : 'text-zinc-400 dark:text-zinc-500'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-zinc-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Popover */}
      {open && (
        <div className="absolute z-50 mt-1.5 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg overflow-hidden backdrop-blur-md">
          {/* Search */}
          <div className="p-1.5 border-b border-zinc-100 dark:border-zinc-800">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIdx(-1); }}
                placeholder="Type to search…"
                className="w-full pl-7 pr-2.5 py-1 text-xs bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/70 rounded-md text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-950 dark:focus:ring-zinc-300"
              />
            </div>
          </div>

          {/* Options list */}
          <ul
            id={instanceId}
            ref={listRef}
            role="listbox"
            className="max-h-56 overflow-y-auto p-1 space-y-0.5"
          >
            {listItems.length === 0 && (
              <li className="px-3 py-3 text-xs text-zinc-400 text-center">No matching results</li>
            )}
            {listItems.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isActive = idx === activeIdx;
              return (
                <li
                  key={opt.value || '__clear__'}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => { e.preventDefault(); select(opt.value); }}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                    isActive
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                  } ${opt.value === '' ? 'text-zinc-400 dark:text-zinc-500 italic' : 'text-zinc-800 dark:text-zinc-200'}`}
                >
                  <span className="text-xs font-medium truncate">{opt.label}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {opt.sublabel && (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-[140px]">{opt.sublabel}</span>
                    )}
                    {isSelected && opt.value !== '' && (
                      <svg className="w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
