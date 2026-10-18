'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { prospectFullName, getGmailSearchUrl, formatTemplateLabel } from '@/lib/types';
import type { EmailSend, EmailSchedule, JobApplication, PendingProspect } from '@/lib/types';

interface ExtendedStats {
  companies: number;
  prospects: number;
  templates: number;
  applications: number;
  emails: {
    total: number;
    sent: number;
    failed: number;
    pending: number;
    opened: number;
    openRate: number;
  };
  applicationsByStatus?: { status: string; count: number }[];
  recentApplications?: JobApplication[];
  readyToApplyApplications?: JobApplication[];
  readyToApplyCount?: number;
  referralSentApplications?: JobApplication[];
  referralSentCount?: number;
  notAppliedApplications?: JobApplication[];
  notAppliedCount?: number;
  activeInterviewApplications?: JobApplication[];
  activeInterviewCount?: number;
  failedSends?: EmailSend[];
  pendingProspects?: PendingProspect[];
  pendingProspectCount?: number;
  prospectsByCategory?: { category: string; count: number }[];
  topCompanies?: { name: string; count: number }[];
  recentSends: EmailSend[];
  upcomingSchedules: EmailSchedule[];
  dailyActivity?: { day: string; sent: number; failed: number }[];
}

type ActionFilter = 'all' | 'manual_prospect' | 'referral_sent' | 'ready_to_apply' | 'not_applied' | 'interview' | 'failed';

function readStoredIds(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

const STATUS_COLOR: Record<string, string> = {
  sent: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
  failed: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
  sending: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20',
  cancelled: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20',
};

const APP_STATUS_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  not_applied: { label: 'Saved', color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800', dotColor: 'bg-zinc-400' },
  referral_requested: { label: 'Referral Asked', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', dotColor: 'bg-amber-500' },
  applied: { label: 'Applied', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', dotColor: 'bg-blue-500' },
  screening: { label: 'Screening', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20', dotColor: 'bg-indigo-500' },
  interview: { label: 'Interview', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20', dotColor: 'bg-purple-500' },
  offer: { label: 'Offer', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', dotColor: 'bg-emerald-500' },
  rejected: { label: 'Rejected', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20', dotColor: 'bg-rose-500' },
  withdrawn: { label: 'Withdrawn', color: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800', dotColor: 'bg-zinc-400' },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<ExtendedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const applicationIds = readStoredIds('crm_dismissed_actions');
      const failedSendIds = readStoredIds('crm_dismissed_failed_sends');
      if (applicationIds.length > 0 || failedSendIds.length > 0) {
        await api.stats.dismiss(applicationIds, failedSendIds);
        localStorage.removeItem('crm_dismissed_actions');
        localStorage.removeItem('crm_dismissed_failed_sends');
      }
      const data = await api.stats.get();
      setStats(data as unknown as ExtendedStats);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load dashboard stats';
      console.error('Failed to load dashboard:', err);
      setError(msg);
      api.logs.ingest({
        level: 'error',
        message: `Dashboard stats fetch failed: ${msg}`,
        source: 'frontend-dashboard',
        errorName: err instanceof Error ? err.name : 'DashboardLoadError',
        stackTrace: err instanceof Error ? err.stack : undefined,
      }).catch(() => null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStats();
  }, []);

  // Handle 1-click status upgrade to 'applied'
  const handleMarkApplied = async (id: string) => {
    try {
      setApplyingId(id);
      await api.applications.update(id, { status: 'applied' });
      setStats((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          readyToApplyApplications: prev.readyToApplyApplications?.filter((a) => a.id !== id),
          readyToApplyCount: Math.max(0, (prev.readyToApplyCount ?? 1) - 1),
          referralSentApplications: prev.referralSentApplications?.filter((a) => a.id !== id),
          referralSentCount: prev.referralSentApplications?.some((a) => a.id === id)
            ? Math.max(0, (prev.referralSentCount ?? 1) - 1)
            : prev.referralSentCount,
          notAppliedApplications: prev.notAppliedApplications?.filter((a) => a.id !== id),
          notAppliedCount: Math.max(0, (prev.notAppliedCount ?? 1) - 1),
        };
      });
    } catch (err) {
      console.error('Failed to mark application as applied:', err);
    } finally {
      setApplyingId(null);
    }
  };

  // Handle 1-click status update to 'closed' (listing expired)
  const handleMarkExpired = async (id: string) => {
    try {
      setActioningId(id);
      await api.applications.update(id, { status: 'closed' });
      setStats((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          readyToApplyApplications: prev.readyToApplyApplications?.filter((a) => a.id !== id),
          readyToApplyCount: Math.max(0, (prev.readyToApplyCount ?? 1) - 1),
          referralSentApplications: prev.referralSentApplications?.filter((a) => a.id !== id),
          referralSentCount: prev.referralSentApplications?.some((a) => a.id === id)
            ? Math.max(0, (prev.referralSentCount ?? 1) - 1)
            : prev.referralSentCount,
          notAppliedApplications: prev.notAppliedApplications?.filter((a) => a.id !== id),
          notAppliedCount: Math.max(0, (prev.notAppliedCount ?? 1) - 1),
        };
      });
    } catch (err) {
      console.error('Failed to mark listing as expired:', err);
    } finally {
      setActioningId(null);
    }
  };

  // Handle removing/dismissing an action item from the priority queue
  const handleDismissAction = async (type: 'ready' | 'referral_sent' | 'not_applied' | 'interview' | 'failed' | 'manual_prospect', id: string) => {
    try {
      if (type === 'manual_prospect') {
        await api.stats.dismiss([], [], [id]);
        setStats((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            pendingProspects: prev.pendingProspects?.filter((p) => p.id !== id),
            pendingProspectCount: Math.max(0, (prev.pendingProspectCount ?? 1) - 1),
          };
        });
        return;
      }

      if (type === 'failed') {
        await api.stats.dismiss([], [id]);
        setStats((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            failedSends: prev.failedSends?.filter((s) => s.id !== id),
          };
        });
        return;
      }

      setActioningId(id);
      const nextStatus = type === 'not_applied' ? 'ineligible' : 'closed';
      await api.applications.update(id, { status: nextStatus });
      setStats((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          readyToApplyApplications: prev.readyToApplyApplications?.filter((a) => a.id !== id),
          readyToApplyCount: type === 'ready' ? Math.max(0, (prev.readyToApplyCount ?? 1) - 1) : prev.readyToApplyCount,
          referralSentApplications: prev.referralSentApplications?.filter((a) => a.id !== id),
          referralSentCount: type === 'referral_sent' ? Math.max(0, (prev.referralSentCount ?? 1) - 1) : prev.referralSentCount,
          notAppliedApplications: prev.notAppliedApplications?.filter((a) => a.id !== id),
          notAppliedCount: type === 'not_applied' ? Math.max(0, (prev.notAppliedCount ?? 1) - 1) : prev.notAppliedCount,
          activeInterviewApplications: prev.activeInterviewApplications?.filter((a) => a.id !== id),
          activeInterviewCount: type === 'interview' ? Math.max(0, (prev.activeInterviewCount ?? 1) - 1) : prev.activeInterviewCount,
        };
      });
    } catch (err) {
      console.error('Failed to dismiss action item:', err);
    } finally {
      setActioningId(null);
    }
  };

  // Action items counts
  const pendingCount = stats?.pendingProspectCount ?? stats?.pendingProspects?.length ?? 0;
  const readyCount = stats?.readyToApplyCount ?? stats?.readyToApplyApplications?.length ?? 0;
  const referralSentCount = stats?.referralSentCount ?? stats?.referralSentApplications?.length ?? 0;
  const notAppliedCount = stats?.notAppliedCount ?? stats?.notAppliedApplications?.length ?? 0;
  const interviewCount = stats?.activeInterviewCount ?? stats?.activeInterviewApplications?.length ?? 0;
  const failedCount = stats?.failedSends?.length ?? (stats?.emails?.failed ? Math.min(stats.emails.failed, 3) : 0);
  const totalActionCount = pendingCount + readyCount + referralSentCount + notAppliedCount + interviewCount + (stats?.failedSends?.length ?? 0);

  if (loading) {
    return (
      <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto animate-pulse">
        {/* Priority Actions Hub Skeleton */}
        <div className="h-72 bg-zinc-200/60 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50" />

        {/* Dual Column Bottom Feed Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="h-72 bg-zinc-200/60 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50" />
          <div className="h-72 bg-zinc-200/60 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50" />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
        <div className="card p-8 border-rose-500/20 bg-rose-500/5 dark:bg-rose-950/20 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto text-xl font-bold">
            ⚠
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              Unable to load dashboard
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              {error || 'An unexpected error occurred while loading dashboard statistics.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => void fetchStats()}
              className="btn-primary text-xs flex items-center gap-2 cursor-pointer"
            >
              <span>↻ Retry</span>
            </button>
            <Link href="/applications" className="btn-secondary text-xs">
              View Applications
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Hero Section: Priority Action Center */}
      <div id="priority-action-center" className="card p-5 sm:p-6 border-zinc-200 dark:border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800/80">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-2">
                <span className="text-amber-500 text-lg">⚡</span>
                Priority Action Center
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                {totalActionCount} total
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Direct links to high-priority opportunities, expired referral windows, and in-flight interviews.
            </p>
          </div>

          {/* Action Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/70 dark:border-zinc-700/70 overflow-x-auto">
            <button
              onClick={() => setActionFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                actionFilter === 'all'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              All Actions ({totalActionCount})
            </button>

            {pendingCount > 0 && (
              <button
                onClick={() => setActionFilter('manual_prospect')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  actionFilter === 'manual_prospect'
                    ? 'bg-white dark:bg-zinc-900 text-amber-800 dark:text-amber-200 shadow-2xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Manual Prospects ({pendingCount})
              </button>
            )}

            {referralSentCount > 0 && (
              <button
                onClick={() => setActionFilter('referral_sent')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  actionFilter === 'referral_sent'
                    ? 'bg-white dark:bg-zinc-900 text-amber-800 dark:text-amber-200 shadow-2xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Referral Sent ({referralSentCount})
              </button>
            )}

            <button
              onClick={() => setActionFilter('ready_to_apply')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                actionFilter === 'ready_to_apply'
                  ? 'bg-white dark:bg-zinc-900 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Referral Expired ({readyCount})
            </button>

            <button
              onClick={() => setActionFilter('not_applied')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                actionFilter === 'not_applied'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
              Saved Jobs ({notAppliedCount})
            </button>

            {interviewCount > 0 && (
              <button
                onClick={() => setActionFilter('interview')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  actionFilter === 'interview'
                    ? 'bg-white dark:bg-zinc-900 text-purple-700 dark:text-purple-300 shadow-2xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                Interviews ({interviewCount})
              </button>
            )}

            {stats.failedSends && stats.failedSends.length > 0 && (
              <button
                onClick={() => setActionFilter('failed')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  actionFilter === 'failed'
                    ? 'bg-white dark:bg-zinc-900 text-rose-700 dark:text-rose-300 shadow-2xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Failed Sends ({stats.failedSends.length})
              </button>
            )}
          </div>
        </div>

        {/* Action Items List */}
        <div className="space-y-3">
          {/* Manual Prospect Entries (Missing Email from LinkedIn Share) */}
          {(actionFilter === 'all' || actionFilter === 'manual_prospect') &&
            stats.pendingProspects &&
            stats.pendingProspects.map((pending) => {
              const fullName = [pending.first_name, pending.last_name].filter(Boolean).join(' ') || 'LinkedIn Contact';
              const enterUrl = `/prospects?new=true&firstName=${encodeURIComponent(pending.first_name || '')}&lastName=${encodeURIComponent(pending.last_name || '')}&companyName=${encodeURIComponent(pending.company_name || '')}&jobTitle=${encodeURIComponent(pending.job_title || '')}&linkedinUrl=${encodeURIComponent(pending.linkedin_url || '')}&pendingId=${pending.id}`;
              return (
                <div
                  key={`pending-${pending.id}`}
                  className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-amber-500/60 relative group"
                >
                  <div className="min-w-0 space-y-1 pr-8 md:pr-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{fullName}</span>
                      {pending.company_name && (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-600">•</span>
                          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{pending.company_name}</span>
                        </>
                      )}
                      {pending.job_title && (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-600">•</span>
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">{pending.job_title}</span>
                        </>
                      )}
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        Manual Prospect Entry
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span>Email not found via Prospeo or Apollo · Manual entry needed</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center sm:gap-2">
                    {pending.linkedin_url && (
                      <a
                        href={pending.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-xs inline-flex items-center justify-center gap-1.5 py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg w-full sm:w-auto text-center font-medium"
                      >
                        Open LinkedIn
                        <svg className="w-3.5 h-3.5 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                    <Link
                      href={enterUrl}
                      className={`inline-flex items-center justify-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg transition-colors w-full sm:w-auto text-center ${
                        pending.linkedin_url ? '' : 'col-span-2 sm:col-span-1'
                      }`}
                    >
                      Enter Details
                    </Link>
                    <button
                      onClick={() => handleDismissAction('manual_prospect', pending.id)}
                      disabled={actioningId === pending.id}
                      className="absolute top-3 right-3 z-10 md:static text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
                      title="Dismiss from action queue"
                      aria-label="Dismiss action"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

          {/* Referral emails sent in the last 2 days */}
          {(actionFilter === 'all' || actionFilter === 'referral_sent') &&
            stats.referralSentApplications &&
            stats.referralSentApplications.map((app) => {
              const sentCount = app.email_count ?? 0;
              return (
                <div
                  key={`sent-${app.id}`}
                  className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-amber-500/60 relative group"
                >
                  <div className="min-w-0 space-y-1 pr-8 md:pr-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{app.company_name}</span>
                      <span className="text-zinc-300 dark:text-zinc-600">•</span>
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{app.job_title}</span>
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        Referral outreach
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        {sentCount} referral email{sentCount !== 1 ? 's' : ''} sent
                      </span>
                      <span>·</span>
                      <span>Waiting on the referral window</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center sm:gap-2">
                    {app.job_url && (
                      <a
                        href={app.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-xs inline-flex items-center justify-center gap-1.5 py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg w-full sm:w-auto text-center font-medium"
                      >
                        Open Portal
                        <svg className="w-3.5 h-3.5 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                    <Link
                      href={`/send?jobId=${app.job_id ?? app.id}&companyName=${encodeURIComponent(app.company_name)}`}
                      className={`inline-flex items-center justify-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg transition-colors w-full sm:w-auto text-center ${
                        app.job_url ? '' : 'col-span-2 sm:col-span-1'
                      }`}
                    >
                      Send another
                    </Link>
                    <button
                      onClick={() => handleDismissAction('referral_sent', app.id)}
                      disabled={actioningId === app.id}
                      className="absolute top-3 right-3 z-10 md:static text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
                      title="Dismiss from action queue"
                      aria-label="Dismiss action"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

          {/* 1. Ready to Apply Directly (Referral Expired > 48h) */}
          {(actionFilter === 'all' || actionFilter === 'ready_to_apply') &&
            stats.readyToApplyApplications &&
            stats.readyToApplyApplications.map((app) => {
              const daysWaited = app.referral_requested_at
                ? Math.max(0, Math.floor((Date.now() - new Date(app.referral_requested_at).getTime()) / (24 * 60 * 60 * 1000)))
                : 2;

              return (
                <div
                  key={`ready-${app.id}`}
                  className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-emerald-500/60 relative group"
                >
                  <div className="min-w-0 space-y-1 pr-8 md:pr-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{app.company_name}</span>
                      <span className="text-zinc-300 dark:text-zinc-600">•</span>
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{app.job_title}</span>
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        ⚡ Referral window expired ({daysWaited}d+ waited)
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {app.email_count && app.email_count > 0 ? (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {app.email_count} referral email{app.email_count !== 1 ? 's' : ''} sent
                        </span>
                      ) : (
                        <span>Outreach dispatched</span>
                      )}
                      <span>·</span>
                      <span>Ready for direct job portal submission</span>
                    </div>
                  </div>

                  {/* Direct Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center sm:gap-2 sm:flex-wrap">
                    {app.job_url && (
                      <a
                        href={app.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-xs inline-flex items-center justify-center gap-1.5 py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg w-full sm:w-auto text-center font-medium"
                      >
                        Open Portal
                        <svg className="w-3.5 h-3.5 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}

                    <Link
                      href={`/send?jobId=${app.job_id ?? app.id}&companyName=${encodeURIComponent(app.company_name)}`}
                      className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg transition-colors w-full sm:w-auto text-center"
                    >
                      Follow-up Note
                    </Link>

                    <button
                      onClick={() => handleMarkApplied(app.id)}
                      disabled={applyingId === app.id}
                      className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg transition-all shadow-2xs cursor-pointer w-full sm:w-auto text-center"
                    >
                      {applyingId === app.id ? 'Updating...' : '✓ Mark as Applied'}
                    </button>

                    <button
                      onClick={() => handleMarkExpired(app.id)}
                      disabled={actioningId === app.id}
                      className={`inline-flex items-center justify-center gap-1 text-xs font-semibold text-zinc-600 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 bg-zinc-100 hover:bg-rose-500/10 dark:bg-zinc-800 dark:hover:bg-rose-500/20 border border-zinc-200 dark:border-zinc-700/80 hover:border-rose-500/30 py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg transition-colors cursor-pointer w-full sm:w-auto text-center ${
                        app.job_url ? '' : 'col-span-2 sm:col-span-1'
                      }`}
                      title="Mark this job opening as closed/expired"
                    >
                      {actioningId === app.id ? 'Updating...' : '✕ Mark Expired'}
                    </button>

                    <button
                      onClick={() => handleDismissAction('ready', app.id)}
                      disabled={actioningId === app.id}
                      className="absolute top-3 right-3 z-10 md:static text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
                      title="Dismiss from action queue"
                      aria-label="Dismiss action"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

          {/* 2. Saved / Not Applied Opportunities (Needs Outreach or Direct Apply) */}
          {(actionFilter === 'all' || actionFilter === 'not_applied') &&
            stats.notAppliedApplications &&
            stats.notAppliedApplications.map((app) => (
              <div
                key={`saved-${app.id}`}
                className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-zinc-400 dark:hover:border-zinc-700 relative group"
              >
                <div className="min-w-0 space-y-1 pr-8 md:pr-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{app.company_name}</span>
                    <span className="text-zinc-300 dark:text-zinc-600">•</span>
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{app.job_title}</span>
                    {app.platform && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        {app.platform}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Saved on {new Date(app.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · Ready for referral outreach or direct application
                    {app.email_count && app.email_count > 0 ? (
                      <span className="font-medium text-amber-700 dark:text-amber-300">
                        {' '}· {app.email_count} referral email{app.email_count !== 1 ? 's' : ''} sent
                      </span>
                    ) : null}
                  </p>
                </div>

                {/* Direct Action Buttons */}
                <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center sm:gap-2 sm:flex-wrap">
                  {app.job_url && (
                    <a
                      href={app.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-xs inline-flex items-center justify-center gap-1.5 py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg w-full sm:w-auto text-center font-medium"
                    >
                      Listing
                      <svg className="w-3.5 h-3.5 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}

                  <Link
                    href={`/send?jobId=${app.job_id ?? app.id}&companyName=${encodeURIComponent(app.company_name)}`}
                    className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg transition-colors w-full sm:w-auto text-center"
                  >
                    Ask Referral
                  </Link>

                  <button
                    onClick={() => handleMarkApplied(app.id)}
                    disabled={applyingId === app.id}
                    className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/25 py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg transition-colors cursor-pointer w-full sm:w-auto text-center"
                  >
                    {applyingId === app.id ? 'Updating...' : '✓ Mark Applied'}
                  </button>

                  <button
                    onClick={() => handleDismissAction('not_applied', app.id)}
                    disabled={actioningId === app.id}
                    className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-zinc-600 hover:text-amber-700 dark:text-zinc-400 dark:hover:text-amber-300 bg-zinc-100 hover:bg-amber-500/10 dark:bg-zinc-800 dark:hover:bg-amber-500/20 border border-zinc-200 dark:border-zinc-700/80 hover:border-amber-500/30 py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg transition-colors cursor-pointer w-full sm:w-auto text-center"
                    title="Mark this job as ineligible"
                  >
                    {actioningId === app.id ? 'Updating...' : '✕ Ineligible'}
                  </button>

                  <button
                    onClick={() => handleMarkExpired(app.id)}
                    disabled={actioningId === app.id}
                    className={`inline-flex items-center justify-center gap-1 text-xs font-semibold text-zinc-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 bg-zinc-100 hover:bg-rose-500/10 dark:bg-zinc-800 dark:hover:bg-rose-500/20 border border-zinc-200 dark:border-zinc-700/80 hover:border-rose-500/30 py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg transition-colors cursor-pointer w-full sm:w-auto text-center ${
                      app.job_url ? 'col-span-2 sm:col-span-1' : ''
                    }`}
                    title="Mark this job opening as closed/expired"
                  >
                    {actioningId === app.id ? 'Updating...' : '✕ Mark Expired'}
                  </button>

                  <button
                    onClick={() => handleDismissAction('not_applied', app.id)}
                    disabled={actioningId === app.id}
                    className="absolute top-3 right-3 z-10 md:static text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
                    title="Dismiss from action queue"
                    aria-label="Dismiss action"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}

          {/* 3. Active Interviews & Screenings */}
          {(actionFilter === 'all' || actionFilter === 'interview') &&
            stats.activeInterviewApplications &&
            stats.activeInterviewApplications.map((app) => {
              const conf = APP_STATUS_CONFIG[app.status] ?? APP_STATUS_CONFIG.interview;
              return (
                <div
                  key={`interview-${app.id}`}
                  className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 dark:bg-purple-950/20 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-purple-500/40 relative group"
                >
                  <div className="min-w-0 space-y-1 pr-8 md:pr-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{app.company_name}</span>
                      <span className="text-zinc-300 dark:text-zinc-600">•</span>
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{app.job_title}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${conf.color}`}>
                        {conf.label} Stage
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      In-flight interview cycle · Prepare talking points or follow up with hiring manager
                    </p>
                  </div>

                  {/* Direct Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center sm:gap-2">
                    <Link
                      href="/applications"
                      className="btn-secondary text-xs inline-flex items-center justify-center py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg w-full sm:w-auto text-center font-medium"
                    >
                      View Notes & Status
                    </Link>

                    <Link
                      href={`/send?companyName=${encodeURIComponent(app.company_name)}`}
                      className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg transition-colors w-full sm:w-auto text-center"
                    >
                      Send Update Note
                    </Link>

                    <button
                      onClick={() => handleDismissAction('interview', app.id)}
                      disabled={actioningId === app.id}
                      className="absolute top-3 right-3 z-10 md:static text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
                      title="Dismiss from action queue"
                      aria-label="Dismiss action"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

          {/* 4. Failed Email Outreach Alerts */}
          {(actionFilter === 'all' || actionFilter === 'failed') &&
            stats.failedSends &&
            stats.failedSends.map((send) => (
              <div
                key={`failed-${send.id}`}
                className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/20 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 relative group"
              >
                <div className="min-w-0 space-y-1 pr-8 md:pr-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      {send.prospect ? prospectFullName(send.prospect) : send.recipient_email}
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-600">•</span>
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{send.subject ?? 'Direct message'}</span>
                    <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                      Delivery Failed
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-mono">
                    {send.error_message ?? 'Connection error or invalid recipient address'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center sm:gap-2">
                  <Link
                    href={`/send?to=${encodeURIComponent(send.recipient_email ?? '')}&subject=${encodeURIComponent(send.subject ?? '')}`}
                    className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg transition-colors shadow-2xs w-full sm:w-auto text-center"
                  >
                    Retry Send
                  </Link>
                  <Link
                    href="/history"
                    className="btn-secondary text-xs inline-flex items-center justify-center py-2 px-2.5 sm:py-1.5 sm:px-3 rounded-lg w-full sm:w-auto text-center font-medium"
                  >
                    Inspect in History
                  </Link>
                  <button
                    onClick={() => handleDismissAction('failed', send.id)}
                    className="absolute top-3 right-3 z-10 md:static text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
                    title="Dismiss alert"
                    aria-label="Dismiss alert"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}

          {/* Zero State (All Actions Cleared) */}
          {totalActionCount === 0 && (
            <div className="py-12 px-4 text-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto text-xl font-bold">
                ✓
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">All caught up! No urgent action items.</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
                  You have answered all pending referral windows and saved opportunities. Keep your momentum going by discovering new prospects or sending fresh connection notes.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <Link href="/prospects" className="btn-secondary text-xs">
                  Discover Prospects
                </Link>
                <Link href="/send" className="btn-primary text-xs">
                  Compose Outreach
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Streamlined Dual-Column Real-Time Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Column: Recent Dispatches & Live Email Engagement */}
        <div className="card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight uppercase">
                Recent Dispatches & Live Opens
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Real-time email tracking and status</p>
            </div>
            <Link href="/history" className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-medium">
              View All History →
            </Link>
          </div>

          {!stats.recentSends || stats.recentSends.length === 0 ? (
            <p className="px-5 py-12 text-zinc-400 text-xs text-center font-medium">No outreach emails sent yet.</p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-y-auto max-h-80">
              {stats.recentSends.map((send) => {
                const gmailUrl = getGmailSearchUrl({
                  to: send.prospect?.email,
                  subject: send.subject,
                  messageId: send.resend_id,
                });

                return (
                  <div key={send.id} className="p-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-850/60 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {send.prospect ? prospectFullName(send.prospect) : send.company?.name ?? '—'}
                          </p>
                          {send.open_count > 0 && (
                            <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20 inline-flex items-center gap-1">
                              👁 {send.open_count} open{send.open_count !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                          {formatTemplateLabel(send.template) || send.subject || 'Direct message'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLOR[send.status] ?? ''}`}>
                          {send.status}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-1">
                      <span className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
                        <svg className="w-3 h-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {new Date(send.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>

                      <a
                        href={gmailUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:underline inline-flex items-center gap-1"
                        title="Search and view thread in Gmail"
                      >
                        Gmail Thread ↗
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Scheduled Outbox & Recent Applications */}
        <div className="space-y-5">
          {/* Scheduled Outbox */}
          <div className="card overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight uppercase">
                  Scheduled Batch Queue
                </h2>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Automated outreach dispatches</p>
              </div>
              <Link href="/scheduled" className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-medium">
                Manage Queue →
              </Link>
            </div>

            {stats.upcomingSchedules.length === 0 ? (
              <p className="px-5 py-8 text-zinc-400 text-xs text-center font-medium">No upcoming outreach scheduled.</p>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-y-auto max-h-48">
                {(stats.upcomingSchedules as EmailSchedule[]).map((s) => (
                  <div key={s.id} className="p-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-850/60 transition-colors">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">{s.company?.name ?? 'Target Company'}</p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{formatTemplateLabel(s.template) || 'Batch outreach'}</p>
                      </div>
                      <span className={`shrink-0 inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLOR[s.status] ?? ''}`}>
                        {s.total_prospects} recipient{s.total_prospects !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 font-mono mt-1.5 flex items-center gap-1">
                      <svg className="w-3 h-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {new Date(s.scheduled_for).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Applications Snapshot */}
          <div className="card overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight uppercase">
                  Recent Applications
                </h2>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Recorded job submissions & portals</p>
              </div>
              <Link href="/applications" className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-medium">
                View All →
              </Link>
            </div>

            {(!stats.recentApplications || stats.recentApplications.length === 0) ? (
              <p className="px-5 py-8 text-zinc-400 text-xs text-center font-medium">No job applications recorded yet.</p>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-y-auto max-h-48">
                {stats.recentApplications.slice(0, 4).map((app) => {
                  const conf = APP_STATUS_CONFIG[app.status] ?? APP_STATUS_CONFIG.applied;
                  return (
                    <div key={app.id} className="p-3 hover:bg-zinc-50 dark:hover:bg-zinc-850/60 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">{app.company_name}</p>
                            {app.platform && (
                              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/60">
                                {app.platform}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5 font-medium">{app.job_title}</p>
                        </div>
                        <span className={`inline-flex text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${conf.color}`}>
                          {conf.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
