'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import type { JobApplication } from '@/lib/types';

const STATUS_OPTIONS = ['not_applied', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'] as const;

const PLATFORM_OPTIONS = ['Greenhouse', 'Lever', 'Workday', 'LinkedIn', 'Ashby', 'SmartRecruiters', 'Email', 'Generic'] as const;

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
  Greenhouse:      'G',
  Lever:           'L',
  Workday:         'W',
  LinkedIn:        'in',
  Ashby:           'A',
  SmartRecruiters: 'S',
  Email:           '✉',
  Generic:         '·',
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

  // Edit modal state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCompany, setEditCompany] = useState('');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editJobUrl, setEditJobUrl] = useState('');
  const [editPlatform, setEditPlatform] = useState('Generic');
  const [editStatus, setEditStatus] = useState<string>('applied');
  const [editNotes, setEditNotes] = useState('');
  const [editAppliedAt, setEditAppliedAt] = useState('');
  const [editError, setEditError] = useState('');

  // Create modal state
  const [isCreating, setIsCreating] = useState(false);
  const [newCompany, setNewCompany] = useState('');
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobUrl, setNewJobUrl] = useState('');
  const [newPlatform, setNewPlatform] = useState('Generic');
  const [newStatus, setNewStatus] = useState<string>('applied');
  const [newNotes, setNewNotes] = useState('');
  const [newAppliedAt, setNewAppliedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [createError, setCreateError] = useState('');

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
    setEditCompany(app.company_name);
    setEditJobTitle(app.job_title);
    setEditJobUrl(app.job_url);
    setEditPlatform(app.platform || 'Generic');
    setEditStatus(app.status);
    setEditNotes(app.notes ?? '');
    setEditAppliedAt(
      app.applied_at ? new Date(app.applied_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
    );
    setEditError('');
  }

  function resetCreateForm() {
    setNewCompany('');
    setNewJobTitle('');
    setNewJobUrl('');
    setNewPlatform('Generic');
    setNewStatus('applied');
    setNewNotes('');
    setNewAppliedAt(new Date().toISOString().slice(0, 10));
    setCreateError('');
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!editCompany.trim()) { setEditError('Company name is required'); return; }
    if (!editJobTitle.trim()) { setEditError('Job title is required'); return; }
    if (!editJobUrl.trim()) { setEditError('Job URL is required'); return; }

    setSaving(true);
    setEditError('');
    try {
      await api.applications.update(editingId, {
        company_name: editCompany.trim(),
        job_title: editJobTitle.trim(),
        job_url: editJobUrl.trim(),
        platform: editPlatform.trim() || 'Generic',
        status: editStatus,
        notes: editNotes.trim() || null,
        applied_at: editAppliedAt ? new Date(editAppliedAt).toISOString() : undefined,
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function saveCreate() {
    if (!newCompany.trim()) { setCreateError('Company name is required'); return; }
    if (!newJobTitle.trim()) { setCreateError('Job title is required'); return; }
    if (!newJobUrl.trim()) { setCreateError('Job URL is required'); return; }

    setSaving(true);
    setCreateError('');
    try {
      await api.applications.create({
        company_name: newCompany.trim(),
        job_title: newJobTitle.trim(),
        job_url: newJobUrl.trim(),
        platform: newPlatform.trim() || 'Generic',
        status: newStatus || 'applied',
        notes: newNotes.trim() || undefined,
        applied_at: newAppliedAt ? new Date(newAppliedAt).toISOString() : undefined,
      });
      setIsCreating(false);
      resetCreateForm();
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create application');
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
        <button
          onClick={() => { resetCreateForm(); setIsCreating(true); }}
          className="btn-primary inline-flex items-center gap-1.5 text-xs py-2 px-3.5 shadow-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Application
        </button>
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
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto mb-4">
            Track applications automatically via the Chrome extension or email sends, or click below to add one manually.
          </p>
          <button
            onClick={() => { resetCreateForm(); setIsCreating(true); }}
            className="btn-primary text-xs py-1.5 px-3"
          >
            + Add First Application
          </button>
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
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-100 dark:border-zinc-800">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Edit Application</h2>
              <button
                onClick={() => setEditingId(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {editError && (
              <div className="mb-4 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-medium border border-rose-200 dark:border-rose-900">
                {editError}
              </div>
            )}

            <div className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label text-xs">Company Name *</label>
                  <input
                    type="text"
                    value={editCompany}
                    onChange={e => setEditCompany(e.target.value)}
                    placeholder="e.g. Stripe"
                    className="form-input text-xs"
                  />
                </div>
                <div>
                  <label className="form-label text-xs">Job Title / Role *</label>
                  <input
                    type="text"
                    value={editJobTitle}
                    onChange={e => setEditJobTitle(e.target.value)}
                    placeholder="e.g. Senior Software Engineer"
                    className="form-input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="form-label text-xs">Job / Application URL *</label>
                <input
                  type="url"
                  value={editJobUrl}
                  onChange={e => setEditJobUrl(e.target.value)}
                  placeholder="https://..."
                  className="form-input text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="form-label text-xs">Platform</label>
                  <select
                    value={editPlatform}
                    onChange={e => setEditPlatform(e.target.value)}
                    className="form-select text-xs"
                  >
                    {PLATFORM_OPTIONS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label text-xs">Status</label>
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value)}
                    className="form-select text-xs"
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s} className="capitalize">
                        {formatLabel(s).replace(/\b\w/g, c => c.toUpperCase())}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label text-xs">Applied Date</label>
                  <input
                    type="date"
                    value={editAppliedAt}
                    onChange={e => setEditAppliedAt(e.target.value)}
                    className="form-input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="form-label text-xs">Notes</label>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={3}
                  placeholder="Interview stages, recruiters, referral info, follow-up dates…"
                  className="form-textarea text-xs resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4 mt-5 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => setEditingId(null)}
                className="btn-ghost text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveEdit()}
                disabled={saving}
                className="btn-primary text-xs py-1.5 px-4"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-100 dark:border-zinc-800">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Track New Application</h2>
              <button
                onClick={() => setIsCreating(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-medium border border-rose-200 dark:border-rose-900">
                {createError}
              </div>
            )}

            <div className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label text-xs">Company Name *</label>
                  <input
                    type="text"
                    value={newCompany}
                    onChange={e => setNewCompany(e.target.value)}
                    placeholder="e.g. OpenAI"
                    className="form-input text-xs"
                  />
                </div>
                <div>
                  <label className="form-label text-xs">Job Title / Role *</label>
                  <input
                    type="text"
                    value={newJobTitle}
                    onChange={e => setNewJobTitle(e.target.value)}
                    placeholder="e.g. Machine Learning Engineer"
                    className="form-input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="form-label text-xs">Job / Application URL *</label>
                <input
                  type="url"
                  value={newJobUrl}
                  onChange={e => setNewJobUrl(e.target.value)}
                  placeholder="https://jobs.lever.co/openai/..."
                  className="form-input text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="form-label text-xs">Platform</label>
                  <select
                    value={newPlatform}
                    onChange={e => setNewPlatform(e.target.value)}
                    className="form-select text-xs"
                  >
                    {PLATFORM_OPTIONS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label text-xs">Status</label>
                  <select
                    value={newStatus}
                    onChange={e => setNewStatus(e.target.value)}
                    className="form-select text-xs"
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s} className="capitalize">
                        {formatLabel(s).replace(/\b\w/g, c => c.toUpperCase())}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label text-xs">Applied Date</label>
                  <input
                    type="date"
                    value={newAppliedAt}
                    onChange={e => setNewAppliedAt(e.target.value)}
                    className="form-input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="form-label text-xs">Notes</label>
                <textarea
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  rows={3}
                  placeholder="Interview stages, recruiters, referral info, follow-up dates…"
                  className="form-textarea text-xs resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4 mt-5 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => setIsCreating(false)}
                className="btn-ghost text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveCreate()}
                disabled={saving}
                className="btn-primary text-xs py-1.5 px-4"
              >
                {saving ? 'Creating…' : 'Track Application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
