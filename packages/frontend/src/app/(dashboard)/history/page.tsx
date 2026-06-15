'use client';

import React, { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { prospectFullName } from '@/lib/types';
import type { EmailSend } from '@/lib/types';

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <span className="absolute bottom-full left-0 mb-1.5 z-50 w-64 rounded-md bg-slate-800 px-3 py-2 text-xs text-white shadow-lg whitespace-normal">
          {text}
          <span className="absolute top-full left-3 border-4 border-transparent border-t-slate-800" />
        </span>
      )}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  sent:    'bg-green-100 text-green-700',
  failed:  'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
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
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[send.status] ?? ''} ${send.error_message ? 'cursor-help' : ''}`}>
      {send.status}
    </span>
  );
  return send.error_message ? <Tooltip text={send.error_message}>{badge}</Tooltip> : badge;
}

function OpenedCell({ send }: { send: EmailSend }) {
  return (
    <div>
      {send.opened_at ? (
        <div className="flex items-center gap-1 mb-0.5">
          <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span className="text-xs text-green-700 font-medium">{formatOpenedAt(send.opened_at)}</span>
          {send.open_count > 1 && <span className="text-xs text-slate-400">×{send.open_count}</span>}
        </div>
      ) : send.status === 'sent' ? (
        <div className="text-xs text-slate-300 mb-0.5">not opened</div>
      ) : null}
      <div className="text-xs text-slate-400">
        {send.sent_at ? new Date(send.sent_at).toLocaleString() : new Date(send.created_at).toLocaleString()}
      </div>
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
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Send History</h1>
        <p className="text-slate-500 text-sm mt-1">{total} emails{statusFilter !== 'all' || search ? ' matching filters' : ' total'}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 self-start">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleStatusChange(tab.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                statusFilter === tab.value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search name, email, subject…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(''); setPage(0); setSearch(''); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : sends.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg font-medium mb-1">
            {statusFilter !== 'all' || search ? 'No emails match your filters' : 'No emails sent yet'}
          </p>
          {statusFilter === 'all' && !search && (
            <p className="text-sm">Go to Send Emails to get started</p>
          )}
        </div>
      ) : (
        <>
          {/* Cards — all screen sizes */}
          <div className="space-y-3 mb-4">
            {sends.map((s) => (
              <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 truncate">{s.prospect ? prospectFullName(s.prospect) : '—'}</div>
                    <div className="text-xs text-slate-400 truncate">{s.prospect?.email ?? ''}</div>
                    {(s.company?.name ?? s.template?.name) && (
                      <div className="text-xs text-slate-400 truncate">
                        {[s.company?.name, s.template?.name].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge send={s} />
                    {s.status === 'failed' && (
                      <button
                        onClick={() => void handleRetry(s.id)}
                        disabled={retrying === s.id}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {retrying === s.id ? 'Retrying…' : '↺ Retry'}
                      </button>
                    )}
                  </div>
                </div>
                {s.subject && (
                  <div className="text-sm text-slate-600 truncate mb-2">{s.subject}</div>
                )}
                <OpenedCell send={s} />
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm">
            <p className="text-slate-500">
              Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * limit >= total}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
