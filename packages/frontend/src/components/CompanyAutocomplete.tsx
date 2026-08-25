'use client';

import { useState, useRef, useEffect, useId } from 'react';
import type { Company } from '@/lib/types';

export interface CompanyAutocompleteProps {
  value: string;
  onChange: (value: string, company?: Company) => void;
  companies: Company[];
  placeholder?: string;
  className?: string;
  id?: string;
  required?: boolean;
  autoFocus?: boolean;
}

export default function CompanyAutocomplete({
  value,
  onChange,
  companies,
  placeholder = 'e.g. Airtel, Stripe, Google…',
  className = '',
  id,
  required = false,
  autoFocus = false,
}: CompanyAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const trimmed = value.trim();
  const exactMatch = companies.find(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase()
  );

  const filtered = trimmed
    ? companies.filter((c) =>
        c.name.toLowerCase().includes(trimmed.toLowerCase())
      ).slice(0, 8)
    : companies.slice(0, 8);

  const showAddNewOption = trimmed.length > 0 && !exactMatch;

  // Options list: filtered matches + optional "Add new company" option
  type OptionItem = { type: 'company'; company: Company } | { type: 'create'; name: string };
  const items: OptionItem[] = [
    ...filtered.map((c): OptionItem => ({ type: 'company', company: c })),
    ...(showAddNewOption ? [{ type: 'create' as const, name: trimmed }] : []),
  ];

  function selectOption(item: OptionItem) {
    if (item.type === 'company') {
      onChange(item.company.name, item.company);
    } else {
      onChange(item.name, undefined);
    }
    setOpen(false);
    setActiveIdx(-1);
  }

  // Handle outside click
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((prev) => (prev < items.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((prev) => (prev > 0 ? prev - 1 : items.length - 1));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && activeIdx < items.length) {
        e.preventDefault();
        selectOption(items[activeIdx]!);
      } else {
        setOpen(false);
      }
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={(e) => {
            const val = e.target.value;
            const matched = companies.find(
              (c) => c.name.toLowerCase() === val.trim().toLowerCase()
            );
            onChange(val, matched);
            setOpen(true);
            setActiveIdx(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          className="form-input text-xs w-full pr-8"
        />

        {trimmed && (
          <button
            type="button"
            onClick={() => {
              onChange('', undefined);
              setOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs p-0.5 cursor-pointer"
            title="Clear"
          >
            ✕
          </button>
        )}
      </div>

      {/* Live Status Badge */}
      {trimmed.length > 0 && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
          {exactMatch ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Existing Company in Companies table</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
              </svg>
              <span>New Company (will be added to Companies table)</span>
            </span>
          )}
        </div>
      )}

      {/* Suggestions Dropdown */}
      {open && items.length > 0 && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl max-h-60 overflow-y-auto py-1 animate-in fade-in duration-100 divide-y divide-zinc-100 dark:divide-zinc-800/60"
        >
          {items.map((item, idx) => {
            const isSelected = idx === activeIdx;
            if (item.type === 'company') {
              const comp = item.company;
              const isExact = comp.name.toLowerCase() === trimmed.toLowerCase();
              return (
                <li
                  key={comp.id}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input blur
                    selectOption(item);
                  }}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-850 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 flex items-center justify-center text-[10px] font-bold text-zinc-600 dark:text-zinc-300 shrink-0">
                      {comp.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="truncate">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {comp.name}
                      </span>
                      {comp.industry && (
                        <span className="text-[10px] text-zinc-400 ml-1.5 font-normal">
                          · {comp.industry}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                      Existing
                    </span>
                    {isExact && (
                      <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </li>
              );
            }

            // Create new option
            return (
              <li
                key="create-new"
                role="option"
                aria-selected={isSelected}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(item);
                }}
                onMouseEnter={() => setActiveIdx(idx)}
                className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between transition-colors ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200'
                    : 'hover:bg-blue-50/60 dark:hover:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 flex items-center justify-center text-xs font-bold shrink-0">
                    +
                  </span>
                  <span className="truncate">
                    Add <span className="font-semibold">&quot;{item.name}&quot;</span> as new company
                  </span>
                </div>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 shrink-0 ml-2">
                  ✨ New
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
