'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import type { JobApplication } from '@/lib/types';

const STATUS_OPTIONS = ['not_applied', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'] as const;

const STATUS_COLORS: Record<string, string> = {
  not_applied: 'bg-amber-100 text-amber-700',
  applied:   'bg-blue-100 text-blue-700',
  screening: 'bg-yellow-100 text-yellow-700',
  interview: 'bg-purple-100 text-purple-700',
  offer:     'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
  withdrawn: 'bg-slate-100 text-slate-500',
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
    const dropdownHeight = 260; // approximate max height
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
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold capitalize cursor-pointer transition-all hover:ring-2 hover:ring-offset-1 hover:ring-indigo-300 ${STATUS_COLORS[app.status] ?? 'bg-slate-100 text-slate-600'}`}
      >
        {formatLabel(app.status)}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-white rounded-xl shadow-lg border border-slate-200 py-1 w-[120px]"
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
              className={`w-full text-left px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                s === app.status
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-50'
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
    // Optimistic update
    setApplications(prev =>
      prev.map(a => (a.id === id ? { ...a, status: status as JobApplication['status'] } : a))
    );
    try {
      await api.applications.update(id, { status });
    } catch {
      // Revert on failure
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

  // Count per status for quick stats
  const counts = STATUS_OPTIONS.reduce<Record<string, number>>((acc, s) => {
    acc[s] = applications.filter(a => a.status === s).length;
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Job Applications</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {total} application{total !== 1 ? 's' : ''} tracked
          </p>
        </div>
      </div>

      {/* Quick status summary */}
      <div className="flex sm:grid sm:grid-cols-7 gap-2 sm:gap-3 mb-6 overflow-x-auto pb-1 sm:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {STATUS_OPTIONS.map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(prev => prev === s ? '' : s)}
            className={`flex-none min-w-[90px] sm:min-w-0 rounded-xl p-2 sm:p-3 text-center border transition-all ${
              filterStatus === s
                ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="text-lg sm:text-xl font-bold text-slate-800">{counts[s] ?? 0}</div>
            <div className={`text-[10px] sm:text-xs font-semibold capitalize mt-0.5 ${STATUS_COLORS[s]?.split(' ')[1] ?? 'text-slate-500'}`}>{formatLabel(s)}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search company or role…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {(search || filterStatus) && (
          <button
            onClick={() => { setSearch(''); setFilterStatus(''); }}
            className="px-3 py-2 rounded-lg text-sm text-slate-500 border border-slate-200 hover:bg-slate-50"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading…</div>
      ) : error ? (
        <div className="text-center py-16 text-red-500">{error}</div>
      ) : applications.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <p className="font-medium text-slate-600">No applications yet</p>
          <p className="text-sm mt-1">Use the Autofill feature in the extension — applications are tracked automatically when you submit a form.</p>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {applications.map(app => {
              const stale = isStale(app);
              return (
                <div key={app.id} className={`bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 ${stale ? 'opacity-50 bg-slate-50/50' : ''}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <a href={app.job_url} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-900 hover:text-indigo-600 hover:underline">
                        {app.company_name}
                      </a>
                      {stale && <span className="ml-2 text-[10px] font-medium text-slate-400 uppercase tracking-wide">stale</span>}
                      <p className="text-slate-700 text-sm mt-0.5">{app.job_title}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(app)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title="Edit">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => void deleteApp(app.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50" title="Delete">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <StatusPill app={app} onStatusChange={handleInlineStatusChange} />
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <span className="w-4 h-4 rounded bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-[9px]">
                          {PLATFORM_ICONS[app.platform] ?? app.platform[0]}
                        </span>
                      </span>
                      <span className="text-xs text-slate-500">{fmt(app.applied_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">Company</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Role</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Platform</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Applied</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map(app => {
                  const stale = isStale(app);
                  return (
                    <tr
                      key={app.id}
                      className={`transition-colors ${stale ? 'opacity-50 bg-slate-50/50' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <a
                          href={app.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-indigo-600 hover:underline"
                        >
                          {app.company_name}
                        </a>
                        {stale && (
                          <span className="ml-1.5 text-[10px] font-medium text-slate-400 uppercase tracking-wide">stale</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{app.job_title}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-[10px]">
                            {PLATFORM_ICONS[app.platform] ?? app.platform[0]}
                          </span>
                          {app.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill app={app} onStatusChange={handleInlineStatusChange} />
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {fmt(app.applied_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(app)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => void deleteApp(app.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">{app.company_name}</h2>
              <p className="text-slate-500 text-sm mb-4">{app.job_title}</p>

              <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s} className="capitalize">{formatLabel(s).replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>

              <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
              <textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                rows={3}
                placeholder="Interview notes, contacts, etc."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEditingId(null)}
                  className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void saveEdit()}
                  disabled={saving}
                  className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
