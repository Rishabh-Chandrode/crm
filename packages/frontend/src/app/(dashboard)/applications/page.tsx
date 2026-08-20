'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import type { JobApplication } from '@/lib/types';

const STATUS_OPTIONS = ['not_applied', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'] as const;

const STATUS_COLORS: Record<string, string> = {
  not_applied: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800',
  applied:     'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
  screening:   'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  interview:   'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
  offer:       'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  rejected:    'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
  withdrawn:   'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800',
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
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold capitalize cursor-pointer border transition-all hover:opacity-90 ${STATUS_COLORS[app.status] ?? 'bg-zinc-100 text-zinc-600'}`}
      >
        {formatLabel(app.status)}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 py-1 w-[140px] overflow-hidden animate-in fade-in zoom-in-95 duration-100"
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
              className={`w-full text-left px-3 py-1.5 text-xs font-medium capitalize transition-colors flex items-center ${
                s === app.status
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold'
                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-850'
              }`}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${STATUS_COLORS[s]?.split(' ')[0] ?? 'bg-zinc-200'}`} />
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
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between pb-1 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Job Applications</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">
            {total} application{total !== 1 ? 's' : ''} tracked across platforms
          </p>
        </div>
      </div>

      {/* Quick status summary */}
      <div className="flex sm:grid sm:grid-cols-7 gap-2 overflow-x-auto pb-2 sm:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {STATUS_OPTIONS.map((s) => {
          const isActive = filterStatus === s;
          return (
            <button
              key={s}
              onClick={() => setFilterStatus((prev) => (prev === s ? '' : s))}
              className={`flex-none min-w-[90px] sm:min-w-0 rounded-xl p-3 text-center border transition-all cursor-pointer ${
                isActive
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 shadow-sm'
                  : 'bg-white dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-900 dark:text-zinc-100'
              }`}
            >
              <div className="text-xl font-bold tracking-tight">
                {counts[s] ?? 0}
              </div>
              <div className={`text-[10px] font-semibold capitalize mt-0.5 tracking-tight ${
                isActive ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-500 dark:text-zinc-400'
              }`}>
                {formatLabel(s)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Search toolbar */}
      <div className="flex gap-2 card p-2.5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search company or role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input pl-8 py-1.5 text-xs"
          />
        </div>
        {(search || filterStatus) && (
          <button
            onClick={() => { setSearch(''); setFilterStatus(''); }}
            className="btn-ghost text-xs py-1"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table & Cards */}
      {loading ? (
        <div className="text-center py-16 text-zinc-400 text-xs">Loading applications…</div>
      ) : error ? (
        <div className="text-center py-16 text-rose-600 dark:text-rose-400 text-xs">{error}</div>
      ) : applications.length === 0 ? (
        <div className="text-center py-16 card p-8">
          <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mb-0.5">No applications yet</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            Use the Autofill feature in the Chrome extension — applications are automatically logged whenever you submit job forms.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-2.5">
            {applications.map(app => {
              const stale = isStale(app);
              return (
                <div key={app.id} className={`card p-3.5 flex flex-col gap-2.5 ${stale ? 'opacity-50' : ''}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <a href={app.job_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-zinc-900 dark:text-zinc-100 hover:underline text-xs">
                        {app.company_name}
                      </a>
                      {stale && <span className="ml-1.5 text-[9px] font-bold text-amber-500 uppercase tracking-wide">stale</span>}
                      <p className="text-zinc-600 dark:text-zinc-400 text-[11px] mt-0.5">{app.job_title}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(app)} className="p-1 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100" title="Edit">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => void deleteApp(app.id)} className="p-1 rounded text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400" title="Delete">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <StatusPill app={app} onStatusChange={handleInlineStatusChange} />
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                        <span className="w-4 h-4 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-semibold text-zinc-600 dark:text-zinc-400 text-[9px]">
                          {PLATFORM_ICONS[app.platform] ?? app.platform[0]}
                        </span>
                      </span>
                      <span className="text-[11px] text-zinc-400">{fmt(app.applied_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block card overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-left">
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Company</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Role</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Platform</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Status</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Applied</th>
                  <th className="px-4 py-3 text-right font-semibold text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {applications.map(app => {
                  const stale = isStale(app);
                  return (
                    <tr
                      key={app.id}
                      className={`transition-colors ${stale ? 'opacity-50 bg-zinc-50/30 dark:bg-zinc-950/30' : 'hover:bg-zinc-50/80 dark:hover:bg-zinc-850/50'}`}
                    >
                      <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                        <a
                          href={app.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-zinc-600 dark:hover:text-zinc-300 hover:underline"
                        >
                          {app.company_name}
                        </a>
                        {stale && (
                          <span className="ml-1.5 text-[9px] font-bold text-amber-500 uppercase tracking-wide">stale</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 font-medium">{app.job_title}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                          <span className="w-4 h-4 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-zinc-600 dark:text-zinc-300 text-[9px]">
                            {PLATFORM_ICONS[app.platform] ?? app.platform[0]}
                          </span>
                          {app.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill app={app} onStatusChange={handleInlineStatusChange} />
                      </td>
                      <td className="px-4 py-3 text-zinc-400 font-mono">
                        {fmt(app.applied_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(app)}
                            className="p-1 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                            title="Edit"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => void deleteApp(app.id)}
                            className="p-1 rounded text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-sm p-5">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-0.5">{app.company_name}</h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-xs mb-3.5">{app.job_title}</p>

              <label className="form-label text-xs">Application Status</label>
              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value)}
                className="form-select text-xs mb-3.5"
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
                className="form-textarea text-xs mb-4 resize-none"
              />

              <div className="flex gap-2 justify-end pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  onClick={() => setEditingId(null)}
                  className="btn-ghost"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void saveEdit()}
                  disabled={saving}
                  className="btn-primary"
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

