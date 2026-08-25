'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { JobApplication, EmailSend, Company } from '@/lib/types';
import CompanyAutocomplete from '@/components/CompanyAutocomplete';

const STATUS_OPTIONS = [
  'not_applied',
  'referral_requested',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
  'closed',
] as const;

const PLATFORM_OPTIONS = [
  'Greenhouse',
  'Lever',
  'Workday',
  'LinkedIn',
  'Ashby',
  'SmartRecruiters',
  'Email',
  'Direct',
  'Generic',
] as const;

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800',
  not_applied: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800',
  referral_requested: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  applied: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
  screening: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
  interview: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
  offer: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  rejected: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
  withdrawn: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800',
  closed: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800',
};

const PLATFORM_ICONS: Record<string, string> = {
  Greenhouse: 'G',
  Lever: 'L',
  Workday: 'W',
  LinkedIn: 'in',
  Ashby: 'A',
  SmartRecruiters: 'S',
  Email: '✉',
  Direct: '⚡',
  Generic: '·',
};

function formatLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

function isReadyToApply(app: JobApplication): boolean {
  if (app.status === 'referral_requested' && app.referral_requested_at) {
    const elapsed = Date.now() - new Date(app.referral_requested_at).getTime();
    return elapsed >= TWO_DAYS_MS;
  }
  return false;
}

function getDaysSinceReferral(app: JobApplication): number | null {
  if (app.referral_requested_at) {
    const diff = Date.now() - new Date(app.referral_requested_at).getTime();
    return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
  }
  return null;
}

/** Clickable status pill with inline dropdown (portaled to body) */
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
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number; flipUp: boolean } | null>(null);

  const calculatePos = useCallback(() => {
    if (!btnRef.current) return null;
    const rect = btnRef.current.getBoundingClientRect();
    const dropdownHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
    const isRightAligned = rect.left > window.innerWidth / 2;
    return {
      top: flipUp ? rect.top : rect.bottom + 4,
      left: isRightAligned ? undefined : rect.left,
      right: isRightAligned ? window.innerWidth - rect.right : undefined,
      flipUp,
    };
  }, []);

  const toggleDropdown = () => {
    if (open) {
      setOpen(false);
      setPos(null);
    } else {
      const newPos = calculatePos();
      if (newPos) {
        setPos(newPos);
        setOpen(true);
      }
    }
  };

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
        setPos(null);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Keep dropdown anchored or close on scroll/resize
  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const newPos = calculatePos();
      if (newPos) {
        setPos(newPos);
      } else {
        setOpen(false);
        setPos(null);
      }
    };
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, calculatePos]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggleDropdown}
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold capitalize cursor-pointer border transition-all hover:opacity-90 ${STATUS_COLORS[app.status] ?? STATUS_COLORS['applied']}`}
        title="Click to change status"
      >
        {formatLabel(app.status)}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 py-1 w-[160px] overflow-hidden animate-in fade-in duration-100"
          style={{
            top: pos.flipUp ? undefined : `${pos.top}px`,
            bottom: pos.flipUp ? `${window.innerHeight - pos.top + 4}px` : undefined,
            left: pos.left !== undefined ? `${pos.left}px` : undefined,
            right: pos.right !== undefined ? `${pos.right}px` : undefined,
            transformOrigin: pos.flipUp ? 'bottom left' : 'top left',
          }}
        >
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                onStatusChange(app.id, s);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs font-medium capitalize transition-colors flex items-center justify-between ${
                s === app.status
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold'
                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-850'
              }`}
            >
              <span className="flex items-center">
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${STATUS_COLORS[s]?.split(' ')[0] ?? 'bg-zinc-200'}`} />
                {formatLabel(s)}
              </span>
              {s === app.status && (
                <svg className="w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

export default function ApplicationsPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
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
  const [newStatus, setNewStatus] = useState<string>('not_applied');
  const [newNotes, setNewNotes] = useState('');
  const [newAppliedAt, setNewAppliedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [createError, setCreateError] = useState('');

  // Outreach drawer state
  const [activeOutreachApp, setActiveOutreachApp] = useState<JobApplication | null>(null);
  const [outreachEmails, setOutreachEmails] = useState<EmailSend[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);

  const [saving, setSaving] = useState(false);

  const loadCompanies = useCallback(async () => {
    try {
      const res = await api.companies.list();
      setCompanies(res.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

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
    setNewStatus('not_applied');
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
      void loadCompanies();
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
        status: newStatus || 'not_applied',
        notes: newNotes.trim() || undefined,
        applied_at: newAppliedAt ? new Date(newAppliedAt).toISOString() : undefined,
      });
      setIsCreating(false);
      resetCreateForm();
      void loadCompanies();
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
      await load();
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

  async function openOutreachDrawer(app: JobApplication) {
    setActiveOutreachApp(app);
    setLoadingEmails(true);
    try {
      const res = await api.applications.getEmails(app.id);
      setOutreachEmails(res.data);
    } catch {
      setOutreachEmails([]);
    } finally {
      setLoadingEmails(false);
    }
  }

  function handleAskReferral(app: JobApplication) {
    const params = new URLSearchParams();
    params.set('jobId', app.job_id ?? app.id);
    if (app.company_id) {
      params.set('companyId', app.company_id);
    }
    if (app.company_name) {
      params.set('companyName', app.company_name);
    }
    router.push(`/send?${params.toString()}`);
  }

  function fmt(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const counts = {
    total: applications.length,
    referral_requested: applications.filter(a => a.status === 'referral_requested').length,
    ready_to_apply: applications.filter(isReadyToApply).length,
    applied: applications.filter(a => a.status === 'applied').length,
    interviewing: applications.filter(a => a.status === 'screening' || a.status === 'interview').length,
    offer: applications.filter(a => a.status === 'offer').length,
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-1 border-b border-zinc-200/80 dark:border-zinc-800/80 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Job Applications
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">
            Track job opportunities, referral outreach, 1–2 day waiting period, and application stages
          </p>
        </div>
        <button
          onClick={() => { resetCreateForm(); setIsCreating(true); }}
          className="btn-primary inline-flex items-center gap-1.5 text-xs py-2 px-3.5 shadow-sm self-start sm:self-auto"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Application / Opportunity
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="card p-3.5">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
            Total Pipeline
          </span>
          <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{counts.total}</div>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 block">
            Opportunities saved
          </span>
        </div>

        <div className="card p-3.5 border-l-4 border-l-amber-500">
          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider block mb-1">
            Referrals Pending
          </span>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-300">
            {counts.referral_requested}
          </div>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 block">
            Waiting 1–2 days
          </span>
        </div>

        <div className="card p-3.5 border-l-4 border-l-emerald-500">
          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block mb-1">
            Ready to Apply (2d+)
          </span>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-300">
            {counts.ready_to_apply}
          </div>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 block">
            No referral? Apply directly
          </span>
        </div>

        <div className="card p-3.5 border-l-4 border-l-purple-500">
          <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wider block mb-1">
            Interviewing
          </span>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-300">
            {counts.interviewing}
          </div>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 block">
            Screening &amp; rounds
          </span>
        </div>

        <div className="card p-3.5 border-l-4 border-l-emerald-600">
          <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider block mb-1">
            Offers
          </span>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-300">
            {counts.offer}
          </div>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 block">
            Offers received 🎉
          </span>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-850 rounded-xl border border-zinc-200/60 dark:border-zinc-800/80 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <button
            onClick={() => setFilterStatus('')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none whitespace-nowrap ${
              filterStatus === ''
                ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs border border-zinc-200/50 dark:border-zinc-700/80'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            All Statuses
          </button>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(prev => prev === s ? '' : s)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none whitespace-nowrap capitalize ${
                filterStatus === s
                  ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs border border-zinc-200/50 dark:border-zinc-700/80'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              {formatLabel(s)}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search company or role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input pl-8.5 pr-8 py-1.5 text-xs w-full"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs"
            >
              ✕
            </button>
          )}
        </div>
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
          <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mb-0.5">
            {search || filterStatus ? 'No applications match your filter' : 'No applications tracked yet'}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto mb-4">
            Track job opportunities, send referral requests to prospects, wait 1–2 days, and submit applications.
          </p>
          <button
            onClick={() => { resetCreateForm(); setIsCreating(true); }}
            className="btn-primary text-xs py-1.5 px-3"
          >
            + Add First Application
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[750px]">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-left">
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Role &amp; Opportunity
                  </th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Company
                  </th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Status (Editable)
                  </th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Referral Outreach
                  </th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Platform / Date
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {applications.map(app => {
                  const daysSince = getDaysSinceReferral(app);
                  const readyToApply = isReadyToApply(app);
                  return (
                    <tr
                      key={app.id}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-850/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                        <div className="flex items-center gap-1.5">
                          <span>{app.job_title}</span>
                          <a
                            href={app.job_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                            title="Open Job Posting"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 font-medium">
                        {app.company_name}
                      </td>

                      <td className="px-4 py-3">
                        <StatusPill app={app} onStatusChange={handleInlineStatusChange} />
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {app.email_count && app.email_count > 0 ? (
                            <button
                              onClick={() => void openOutreachDrawer(app)}
                              className="text-left text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:underline inline-flex items-center gap-1"
                            >
                              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                              {app.email_count} email{app.email_count !== 1 ? 's' : ''} sent
                            </button>
                          ) : (
                            <span className="text-zinc-400 text-[11px]">No outreach yet</span>
                          )}

                          {daysSince !== null && app.status === 'referral_requested' && (
                            <div className="flex items-center gap-1">
                              <span
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                  readyToApply
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold'
                                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                }`}
                              >
                                {daysSince === 0
                                  ? 'Asked today'
                                  : `Waited ${daysSince}d ${readyToApply ? '⚡ Ready to Apply' : ''}`}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        <div className="flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-zinc-600 dark:text-zinc-300 text-[9px]">
                            {PLATFORM_ICONS[app.platform] ?? app.platform[0]}
                          </span>
                          <span>{app.platform}</span>
                          <span className="text-zinc-400 font-mono text-[11px] ml-1">· {fmt(app.applied_at)}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {app.status !== 'applied' && app.status !== 'interview' && app.status !== 'offer' && (
                            <button
                              onClick={() => handleAskReferral(app)}
                              className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-2 py-1 rounded transition-colors"
                            >
                              Ask Referral
                            </button>
                          )}

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
        </div>
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
                ✕
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
                  <CompanyAutocomplete
                    value={editCompany}
                    onChange={(val) => setEditCompany(val)}
                    companies={companies}
                    placeholder="e.g. Airtel, Stripe"
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
                <label className="form-label text-xs">Job URL *</label>
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
                      <option key={s} value={s}>{formatLabel(s)}</option>
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
                  className="form-textarea text-xs resize-none"
                  placeholder="Referral notes, recruiters, interview feedback…"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4 mt-5 border-t border-zinc-100 dark:border-zinc-800">
              <button onClick={() => setEditingId(null)} className="btn-ghost text-xs">
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
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Add Application / Opportunity</h2>
              <button
                onClick={() => setIsCreating(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                ✕
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
                  <CompanyAutocomplete
                    value={newCompany}
                    onChange={(val) => setNewCompany(val)}
                    companies={companies}
                    placeholder="e.g. Airtel, Stripe"
                  />
                </div>
                <div>
                  <label className="form-label text-xs">Job Title / Role *</label>
                  <input
                    type="text"
                    value={newJobTitle}
                    onChange={e => setNewJobTitle(e.target.value)}
                    placeholder="e.g. ML Platform Engineer"
                    className="form-input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="form-label text-xs">Job URL *</label>
                <input
                  type="url"
                  value={newJobUrl}
                  onChange={e => setNewJobUrl(e.target.value)}
                  placeholder="https://jobs.lever.co/company/..."
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
                      <option key={s} value={s}>{formatLabel(s)}</option>
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
                  className="form-textarea text-xs resize-none"
                  placeholder="Target salary, referral contacts, hiring manager notes…"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4 mt-5 border-t border-zinc-100 dark:border-zinc-800">
              <button onClick={() => setIsCreating(false)} className="btn-ghost text-xs">
                Cancel
              </button>
              <button
                onClick={() => void saveCreate()}
                disabled={saving}
                className="btn-primary text-xs py-1.5 px-4"
              >
                {saving ? 'Saving…' : 'Save Application'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Referral Outreach History Drawer */}
      {activeOutreachApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-xl p-6 my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Referral Outreach History
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {activeOutreachApp.job_title} at {activeOutreachApp.company_name}
                </p>
              </div>
              <button
                onClick={() => setActiveOutreachApp(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            {loadingEmails ? (
              <div className="py-12 text-center text-xs text-zinc-400">Loading outreach emails…</div>
            ) : outreachEmails.length === 0 ? (
              <div className="py-12 text-center card p-6">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                  No outreach emails linked to this role yet.
                </p>
                <button
                  onClick={() => {
                    const target = activeOutreachApp;
                    setActiveOutreachApp(null);
                    handleAskReferral(target);
                  }}
                  className="btn-primary text-xs py-1.5 px-3"
                >
                  Send Referral Request
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {outreachEmails.map((email) => (
                  <div
                    key={email.id}
                    className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/50 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                          {email.prospect ? `${email.prospect.first_name} ${email.prospect.last_name || ''}` : 'Prospect'}
                        </span>
                        {email.prospect?.email && (
                          <span className="text-[11px] text-zinc-500 font-mono">
                            {email.prospect.email}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize ${
                          email.status === 'sent'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : email.status === 'failed'
                            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                            : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {email.status}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 line-clamp-1">
                      {email.subject || '(No subject)'}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 pt-1 border-t border-zinc-200/50 dark:border-zinc-800/50">
                      <span>{fmt(email.created_at)}</span>
                      {email.open_count > 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Opened {email.open_count} time{email.open_count !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span>Not opened yet</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 mt-5 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => {
                  const target = activeOutreachApp;
                  setActiveOutreachApp(null);
                  handleAskReferral(target);
                }}
                className="btn-primary text-xs py-1.5 px-3"
              >
                + Reach Out to More Contacts
              </button>
              <button
                onClick={() => setActiveOutreachApp(null)}
                className="btn-ghost text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
