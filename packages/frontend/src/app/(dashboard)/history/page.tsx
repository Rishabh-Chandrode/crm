'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { prospectFullName } from '@/lib/types';
import type { EmailSend } from '@/lib/types';

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <span
        className="inline-flex"
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ x: r.left, y: r.top });
        }}
        onMouseLeave={() => setPos(null)}
      >
        {children}
      </span>
      {pos && typeof document !== 'undefined' && createPortal(
        (() => {
          const clampedLeft = Math.min(pos.x, window.innerWidth - 256 - 8);
          const arrowLeft = pos.x - clampedLeft + 8;
          return (
            <span
              className="fixed z-[9999] w-64 rounded-xl bg-zinc-900 dark:bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs text-zinc-100 shadow-xl whitespace-normal pointer-events-none"
              style={{ top: pos.y - 8, transform: 'translateY(-100%)', left: clampedLeft }}
            >
              {text}
              <span className="absolute top-full border-4 border-transparent border-t-zinc-900 dark:border-t-zinc-800" style={{ left: arrowLeft }} />
            </span>
          );
        })(),
        document.body
      )}
    </>
  );
}

const STATUS_STYLES: Record<string, string> = {
  sent:    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20',
  failed:  'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20',
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20',
};

const STATUS_TABS = [
  { value: 'all',     label: 'All' },
  { value: 'sent',    label: 'Sent' },
  { value: 'failed',  label: 'Failed' },
  { value: 'pending', label: 'Pending' },
];

function formatOpenedAt(dateStr: string): string {
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function StatusBadge({ send }: { send: EmailSend }) {
  const badge = (
    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${STATUS_STYLES[send.status] ?? ''} ${send.error_message ? 'cursor-help' : ''}`}>
      {send.status}
    </span>
  );
  return send.error_message ? <Tooltip text={send.error_message}>{badge}</Tooltip> : badge;
}

function SendCard({
  send,
  onRetry,
  retrying,
}: {
  send: EmailSend;
  onRetry: (id: string) => void;
  retrying: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card overflow-hidden transition-all">
      {/* Summary — always visible */}
      <div
        className="p-4 cursor-pointer hover:bg-zinc-50/70 dark:hover:bg-zinc-850/60 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <div className="min-w-0">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs truncate">
              {send.prospect ? prospectFullName(send.prospect) : 'Unknown recipient'}
            </div>
            <div className="text-[11px] text-zinc-400 font-mono truncate">{send.prospect?.email ?? ''}</div>
            {(send.company?.name ?? send.template?.name ?? send.job_url) && (
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1.5 flex-wrap">
                {[send.company?.name, send.template?.name].filter(Boolean).join(' · ')}
                {send.job_url && (
                  <>
                    {(send.company?.name || send.template?.name) && <span>·</span>}
                    <a
                      href={send.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-700 dark:text-zinc-300 hover:underline inline-flex items-center gap-0.5 font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Job Post
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge send={send} />
            {send.status === 'failed' && (
              <button
                onClick={(e) => { e.stopPropagation(); onRetry(send.id); }}
                disabled={retrying === send.id}
                className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50 transition-colors"
              >
                {retrying === send.id ? 'Retrying…' : '↺ Retry'}
              </button>
            )}
            <svg
              className={`w-3.5 h-3.5 text-zinc-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20" fill="currentColor"
            >
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        </div>

        {send.subject && (
          <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate mb-1.5">
            <span className="text-zinc-400 font-normal">Subject: </span>
            {send.subject}
          </div>
        )}

        {/* Opened / sent info */}
        <div className="flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500 pt-1">
          <div>
            {send.opened_at ? (
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>Opened {formatOpenedAt(send.opened_at)}</span>
                {send.open_count > 1 && <span className="text-zinc-400 font-normal">({send.open_count}×)</span>}
              </div>
            ) : send.status === 'sent' ? (
              <span className="text-zinc-400">Not opened yet</span>
            ) : null}
          </div>
          <div>
            {send.sent_at ? new Date(send.sent_at).toLocaleString() : new Date(send.created_at).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/60 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Recipient Details</p>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {send.prospect?.first_name?.[0]?.toUpperCase() ?? 'U'}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{send.prospect ? prospectFullName(send.prospect) : '—'}</p>
                  <p className="text-[11px] text-zinc-400 font-mono">{send.prospect?.email}</p>
                  {send.prospect?.job_title && (
                    <p className="text-[11px] text-zinc-500">{send.prospect.job_title}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div>
                <span className="text-zinc-400 font-bold uppercase tracking-wider text-[10px] block">Template:</span>
                <span className="text-zinc-800 dark:text-zinc-200 font-medium">{send.template?.name ?? 'Quick Email / Direct'}</span>
              </div>
              <div>
                <span className="text-zinc-400 font-bold uppercase tracking-wider text-[10px] block">Company:</span>
                <span className="text-zinc-800 dark:text-zinc-200 font-medium">{send.company?.name ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* Error */}
          {send.error_message && (
            <div>
              <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1">Delivery Failure Diagnostic</p>
              <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 font-mono">
                {send.error_message}
              </p>
            </div>
          )}

          {/* Email body preview */}
          {send.body && (
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Delivered Message</p>
              <pre className="text-xs text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono leading-relaxed">
                {send.body}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  const [sends, setSends] = useState<EmailSend[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limit = 25;

  async function load(p: number, status: string, q: string) {
    setLoading(true);
    try {
      const res = await api.email.history(limit, p * limit, {
        status: status !== 'all' ? status : undefined,
        search: q || undefined,
      });
      setSends(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(page, statusFilter, search); }, [page, statusFilter, search]);

  function handleSearchChange(val: string) {
    setSearchInput(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => { setPage(0); setSearch(val); }, 300);
  }

  function handleStatusChange(val: string) {
    setStatusFilter(val);
    setPage(0);
  }

  async function handleRetry(id: string) {
    setRetrying(id);
    try {
      await api.email.retry(id);
      await load(page, statusFilter, search);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5">
      <div className="pb-1 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Send History</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">{total} email{total !== 1 ? 's' : ''}{statusFilter !== 'all' || search ? ' matching filters' : ' logged'}</p>
      </div>

      {/* Filters toolbar */}
      <div className="card p-2.5 flex flex-wrap items-center gap-2.5">
        <div className="segmented-control">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleStatusChange(tab.value)}
              className={`segmented-item ${statusFilter === tab.value ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1 sm:flex-initial">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search name, email, subject…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="form-input pl-8 py-1.5 text-xs"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(''); setPage(0); setSearch(''); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-zinc-400 text-xs py-12 text-center">Loading history…</p>
      ) : sends.length === 0 ? (
        <div className="text-center py-16 card p-8">
          <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-0.5">
            {statusFilter !== 'all' || search ? 'No emails match your filter criteria' : 'No emails sent yet'}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {statusFilter === 'all' && !search ? 'Start your outreach campaigns to track delivery here' : 'Try clearing your search or status filter'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {sends.map((s) => (
              <SendCard key={s.id} send={s} onRetry={handleRetry} retrying={retrying} />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 pt-2">
            <p>
              Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total} sends
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
                className="btn-secondary"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * limit >= total}
                className="btn-secondary"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

