'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import type { JobApplication } from '@/lib/types';

const STATUS_OPTIONS = ['not_applied', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'] as const;

const STATUS_COLORS: Record<string, string> = {
  not_applied: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
  applied:     'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60',
  screening:   'bg-yellow-50 dark:bg-yellow-950/60 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800/60',
  interview:   'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60',
  offer:       'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
  rejected:    'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60',
  withdrawn:   'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
};

const STATUS_CARD_THEMES: Record<string, { bg: string; activeBg: string; text: string; labelColor: string; border: string; activeBorder: string }> = {
  not_applied: {
    bg: 'bg-amber-500/10 dark:bg-amber-950/30',
    activeBg: 'bg-amber-500/20 dark:bg-amber-950/60',
    text: 'text-amber-700 dark:text-amber-300',
    labelColor: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/25 dark:border-amber-800/50',
    activeBorder: 'border-amber-500 ring-2 ring-amber-500/30',
  },
  applied: {
    bg: 'bg-blue-500/10 dark:bg-blue-950/30',
    activeBg: 'bg-blue-500/20 dark:bg-blue-950/60',
    text: 'text-blue-700 dark:text-blue-300',
    labelColor: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/25 dark:border-blue-800/50',
    activeBorder: 'border-blue-500 ring-2 ring-blue-500/30',
  },
  screening: {
    bg: 'bg-yellow-500/10 dark:bg-yellow-950/30',
    activeBg: 'bg-yellow-500/20 dark:bg-yellow-950/60',
    text: 'text-yellow-700 dark:text-yellow-300',
    labelColor: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-500/25 dark:border-yellow-800/50',
    activeBorder: 'border-yellow-500 ring-2 ring-yellow-500/30',
  },
  interview: {
    bg: 'bg-purple-500/10 dark:bg-purple-950/30',
    activeBg: 'bg-purple-500/20 dark:bg-purple-950/60',
    text: 'text-purple-700 dark:text-purple-300',
    labelColor: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/25 dark:border-purple-800/50',
    activeBorder: 'border-purple-500 ring-2 ring-purple-500/30',
  },
  offer: {
    bg: 'bg-emerald-500/10 dark:bg-emerald-950/30',
    activeBg: 'bg-emerald-500/20 dark:bg-emerald-950/60',
    text: 'text-emerald-700 dark:text-emerald-300',
    labelColor: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/25 dark:border-emerald-800/50',
    activeBorder: 'border-emerald-500 ring-2 ring-emerald-500/30',
  },
  rejected: {
    bg: 'bg-rose-500/10 dark:bg-rose-950/30',
    activeBg: 'bg-rose-500/20 dark:bg-rose-950/60',
    text: 'text-rose-700 dark:text-rose-300',
    labelColor: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-500/25 dark:border-rose-800/50',
    activeBorder: 'border-rose-500 ring-2 ring-rose-500/30',
  },
  withdrawn: {
    bg: 'bg-slate-500/10 dark:bg-slate-800/40',
    activeBg: 'bg-slate-500/20 dark:bg-slate-800/70',
    text: 'text-slate-700 dark:text-slate-300',
    labelColor: 'text-slate-500 dark:text-slate-400',
    border: 'border-slate-500/25 dark:border-slate-700/50',
    activeBorder: 'border-slate-500 ring-2 ring-slate-500/30',
  },
};

const PLATFORM_ICONS: Record<string, string> = {
  Greenhouse: 'G',
  Lever:      'L',
  Workday:    'W',
  Generic:    '·',
};

function formatLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function isStale(app: JobApplication): boolean {
  return app.status === 'not_applied' && Date.now() - new Date(app.applied_at).getTime() > ONE_MONTH_MS;
}

/** Clickable status pill with inline dropdown (portaled to body to avoid overflow clipping) */
function StatusPill({
  app,
  onStatusChange,
}: {
  app: JobApplication;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number; flipUp: boolean }>({ top: 0, left: 0, flipUp: false });

  // Position the dropdown relative to the pill button
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const dropdownHeight = 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
    const isRightAligned = rect.left > window.innerWidth / 2;
    setPos({
      top: flipUp ? rect.top : rect.bottom + 4,
      left: isRightAligned ? undefined : rect.left,
      right: isRightAligned ? window.innerWidth - rect.right : undefined,
      flipUp,
    });
  }, [open]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (
        btnRef.current && !btnRef.current.contains(target) &&
        dropRef.current && !dropRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on scroll/resize
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize cursor-pointer border transition-all hover:ring-2 hover:ring-indigo-500/20 ${STATUS_COLORS[app.status] ?? 'bg-slate-100 text-slate-600'}`}
      >
        {formatLabel(app.status)}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 py-1.5 w-[140px] overflow-hidden"
          style={{
            top: pos.flipUp ? undefined : pos.top,
            bottom: pos.flipUp ? window.innerHeight - pos.top + 4 : undefined,
            left: pos.left,
            right: pos.right,
          }}
        >
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => {
                onStatusChange(app.id, s);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs font-semibold capitalize transition-colors flex items-center ${
                s === app.status
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${STATUS_COLORS[s]?.split(' ')[0] ?? 'bg-slate-200'}`} />
              {formatLabel(s)}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.applications.list({
        search: search || undefined,
        status: filterStatus || undefined,
      });
      setApplications(res.applications);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(app: JobApplication) {
    setEditingId(app.id);
    setEditStatus(app.status);
    setEditNotes(app.notes ?? '');
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    try {
      await api.applications.update(editingId, { status: editStatus, notes: editNotes || undefined });
      setEditingId(null);
      await load();
    } catch {
      // keep modal open
    } finally {
      setSaving(false);
    }
  }

  async function handleInlineStatusChange(id: string, status: string) {
    setApplications(prev =>
      prev.map(a => (a.id === id ? { ...a, status: status as JobApplication['status'] } : a))
    );
    try {
      await api.applications.update(id, { status });
    } catch {
      await load();
    }
  }

  async function deleteApp(id: string) {
    if (!confirm('Delete this application?')) return;
    try {
      await api.applications.delete(id);
      await load();
    } catch {
      // ignore
    }
  }

  function fmt(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const counts = STATUS_OPTIONS.reduce<Record<string, number>>((acc, s) => {
    acc[s] = applications.filter(a => a.status === s).length;
    return acc;
  }, {});

  return (
    <div className="p-4 md:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Job Applications</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            {total} application{total !== 1 ? 's' : ''} tracked across platforms
          </p>
        </div>
      </div>

      {/* Quick status summary */}
      <div className="flex sm:grid sm:grid-cols-7 gap-3 mb-6 overflow-x-auto pb-2 sm:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {STATUS_OPTIONS.map((s) => {
          const theme = STATUS_CARD_THEMES[s] ?? STATUS_CARD_THEMES.withdrawn;
          const isActive = filterStatus === s;
          return (
            <button
              key={s}
              onClick={() => setFilterStatus((prev) => (prev === s ? '' : s))}
              className={`flex-none min-w-[95px] sm:min-w-0 rounded-2xl p-3.5 text-center border backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
                isActive
                  ? `${theme.activeBg} ${theme.activeBorder} shadow-sm scale-[1.02]`
                  : `${theme.bg} ${theme.border} hover:scale-[1.01]`
              }`}
            >
              <div className={`text-xl sm:text-2xl font-extrabold tracking-tight ${theme.text}`}>
                {counts[s] ?? 0}
              </div>
              <div className={`text-[11px] sm:text-xs font-bold capitalize mt-1 tracking-tight ${theme.labelColor}`}>
                {formatLabel(s)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Search toolbar */}
      <div className="flex gap-2.5 mb-6 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search company or role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
          />
        </div>
        {(search || filterStatus) && (
          <button
            onClick={() => { setSearch(''); setFilterStatus(''); }}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table & Cards */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading applications…</div>
      ) : error ? (
        <div className="text-center py-16 text-red-500 text-sm">{error}</div>
      ) : applications.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-8 shadow-xs">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <p className="font-bold text-slate-800 dark:text-slate-200 text-base mb-1">No applications yet</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Use the Autofill feature in the Chrome extension — applications are automatically logged whenever you submit job forms.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {applications.map(app => {
              const stale = isStale(app);
              return (
                <div key={app.id} className={`bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 flex flex-col gap-3 shadow-xs ${stale ? 'opacity-50' : ''}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <a href={app.job_url} target="_blank" rel="noopener noreferrer" className="font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline text-sm">
                        {app.company_name}
                      </a>
                      {stale && <span className="ml-2 text-[10px] font-bold text-amber-500 uppercase tracking-wide">stale</span>}
                      <p className="text-slate-600 dark:text-slate-400 text-xs mt-0.5">{app.job_title}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(app)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800" title="Edit">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => void deleteApp(app.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Delete">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <StatusPill app={app} onStatusChange={handleInlineStatusChange} />
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <span className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400 text-[9px]">
                          {PLATFORM_ICONS[app.platform] ?? app.platform[0]}
                        </span>
                      </span>
                      <span className="text-xs text-slate-400">{fmt(app.applied_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-x-auto shadow-xs">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 text-left">
                  <th className="px-5 py-3.5 font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">Company</th>
                  <th className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">Role</th>
                  <th className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">Platform</th>
                  <th className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">Status</th>
                  <th className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">Applied</th>
                  <th className="px-5 py-3.5 text-right font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {applications.map(app => {
                  const stale = isStale(app);
                  return (
                    <tr
                      key={app.id}
                      className={`transition-colors ${stale ? 'opacity-50 bg-slate-50/30 dark:bg-slate-950/30' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60'}`}
                    >
                      <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-slate-100">
                        <a
                          href={app.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline"
                        >
                          {app.company_name}
                        </a>
                        {stale && (
                          <span className="ml-2 text-[10px] font-bold text-amber-500 uppercase tracking-wide">stale</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 text-xs font-medium">{app.job_title}</td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                          <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 text-[10px]">
                            {PLATFORM_ICONS[app.platform] ?? app.platform[0]}
                          </span>
                          {app.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusPill app={app} onStatusChange={handleInlineStatusChange} />
                      </td>
                      <td className="px-4 py-3.5 text-slate-400 text-xs font-mono">
                        {fmt(app.applied_at)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(app)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => void deleteApp(app.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Edit modal */}
      {editingId && (() => {
        const app = applications.find(a => a.id === editingId);
        if (!app) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-sm p-6">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">{app.company_name}</h2>
              <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">{app.job_title}</p>

              <label className="form-label text-xs">Application Status</label>
              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value)}
                className="form-select text-xs mb-4"
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s} className="capitalize">{formatLabel(s).replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>

              <label className="form-label text-xs">Notes</label>
              <textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                rows={3}
                placeholder="Interview stages, contacts, follow-up dates…"
                className="form-textarea text-xs mb-5 resize-none"
              />

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEditingId(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void saveEdit()}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-xs"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
