'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { prospectFullName, getGmailSearchUrl } from '@/lib/types';
import type { EmailSend, EmailSchedule, JobApplication } from '@/lib/types';

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
  notAppliedApplications?: JobApplication[];
  notAppliedCount?: number;
  activeInterviewApplications?: JobApplication[];
  activeInterviewCount?: number;
  failedSends?: EmailSend[];
  prospectsByCategory?: { category: string; count: number }[];
  topCompanies?: { name: string; count: number }[];
  recentSends: EmailSend[];
  upcomingSchedules: EmailSchedule[];
  dailyActivity?: { day: string; sent: number; failed: number }[];
}

type ActionFilter = 'all' | 'ready_to_apply' | 'not_applied' | 'interview' | 'failed';

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

function KpiCard({
  label,
  value,
  badge,
  badgeColor = 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  sub,
  icon,
  href,
  onClick,
}: {
  label: string;
  value: string | number;
  badge?: string;
  badgeColor?: string;
  sub?: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <div className="card p-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 group flex flex-col justify-between h-full cursor-pointer relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{label}</p>
            {badge && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border border-current/10 ${badgeColor}`}>
                {badge}
              </span>
            )}
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight mt-1.5">{value}</p>
        </div>
        <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 shrink-0 group-hover:scale-105 transition-transform">
          {icon}
        </div>
      </div>

      {sub && (
        <div className="mt-3.5 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium truncate">{sub}</p>
          <span className="text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 group-hover:translate-x-0.5 transition-all text-xs font-semibold">
            →
          </span>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 rounded-xl">
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button onClick={onClick} type="button" className="text-left w-full focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 rounded-xl">
        {content}
      </button>
    );
  }

  return content;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<ExtendedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  useEffect(() => {
    api.stats.get()
      .then((data) => {
        const dismissed = typeof window !== 'undefined'
          ? JSON.parse(localStorage.getItem('crm_dismissed_actions') || '[]') as string[]
          : [];
        const dismissedFailed = typeof window !== 'undefined'
          ? JSON.parse(localStorage.getItem('crm_dismissed_failed_sends') || '[]') as string[]
          : [];

        const extended = data as unknown as ExtendedStats;
        if (dismissed.length > 0) {
          if (extended.readyToApplyApplications) {
            extended.readyToApplyApplications = extended.readyToApplyApplications.filter((a) => !dismissed.includes(a.id));
            extended.readyToApplyCount = extended.readyToApplyApplications.length;
          }
          if (extended.notAppliedApplications) {
            extended.notAppliedApplications = extended.notAppliedApplications.filter((a) => !dismissed.includes(a.id));
            extended.notAppliedCount = extended.notAppliedApplications.length;
          }
          if (extended.activeInterviewApplications) {
            extended.activeInterviewApplications = extended.activeInterviewApplications.filter((a) => !dismissed.includes(a.id));
            extended.activeInterviewCount = extended.activeInterviewApplications.length;
          }
        }
        if (dismissedFailed.length > 0 && extended.failedSends) {
          extended.failedSends = extended.failedSends.filter((s) => !dismissedFailed.includes(s.id));
        }
        setStats(extended);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
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
      if (typeof window !== 'undefined') {
        const dismissed = JSON.parse(localStorage.getItem('crm_dismissed_actions') || '[]') as string[];
        if (!dismissed.includes(id)) {
          localStorage.setItem('crm_dismissed_actions', JSON.stringify([...dismissed, id]));
        }
      }
      setStats((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          readyToApplyApplications: prev.readyToApplyApplications?.filter((a) => a.id !== id),
          readyToApplyCount: Math.max(0, (prev.readyToApplyCount ?? 1) - 1),
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
  const handleDismissAction = async (type: 'ready' | 'not_applied' | 'interview' | 'failed', id: string) => {
    try {
      if (type === 'failed') {
        if (typeof window !== 'undefined') {
          const dismissedFailed = JSON.parse(localStorage.getItem('crm_dismissed_failed_sends') || '[]') as string[];
          if (!dismissedFailed.includes(id)) {
            localStorage.setItem('crm_dismissed_failed_sends', JSON.stringify([...dismissedFailed, id]));
          }
        }
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
      await api.applications.update(id, { status: 'closed' });
      if (typeof window !== 'undefined') {
        const dismissed = JSON.parse(localStorage.getItem('crm_dismissed_actions') || '[]') as string[];
        if (!dismissed.includes(id)) {
          localStorage.setItem('crm_dismissed_actions', JSON.stringify([...dismissed, id]));
        }
      }
      setStats((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          readyToApplyApplications: prev.readyToApplyApplications?.filter((a) => a.id !== id),
          readyToApplyCount: type === 'ready' ? Math.max(0, (prev.readyToApplyCount ?? 1) - 1) : prev.readyToApplyCount,
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

  // Pipeline summary aggregation
  const pipelineMetrics = useMemo(() => {
    if (!stats?.applicationsByStatus) {
      return { totalActive: 0, screening: 0, interview: 0, offer: 0, applied: 0 };
    }
    const map: Record<string, number> = {};
    for (const item of stats.applicationsByStatus) {
      map[item.status] = (map[item.status] ?? 0) + item.count;
    }
    const applied = map['applied'] ?? 0;
    const screening = map['screening'] ?? 0;
    const interview = map['interview'] ?? 0;
    const offer = map['offer'] ?? 0;
    const totalActive = applied + screening + interview + offer;
    return { totalActive, screening, interview, offer, applied };
  }, [stats?.applicationsByStatus]);

  // Action items counts
  const readyCount = stats?.readyToApplyCount ?? stats?.readyToApplyApplications?.length ?? 0;
  const notAppliedCount = stats?.notAppliedCount ?? stats?.notAppliedApplications?.length ?? 0;
  const interviewCount = stats?.activeInterviewCount ?? stats?.activeInterviewApplications?.length ?? 0;
  const failedCount = stats?.failedSends?.length ?? (stats?.emails?.failed ? Math.min(stats.emails.failed, 3) : 0);
  const totalActionCount = readyCount + notAppliedCount + interviewCount + (stats?.failedSends?.length ?? 0);

  if (loading) {
    return (
      <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto animate-pulse">
        <div className="flex justify-between items-center pb-2 border-b border-zinc-200/80 dark:border-zinc-800/80">
          <div className="space-y-2">
            <div className="h-7 bg-zinc-200 dark:bg-zinc-800 rounded-lg w-48" />
            <div className="h-4 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-md w-72" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 bg-zinc-200 dark:bg-zinc-800 rounded-lg w-28" />
            <div className="h-9 bg-zinc-200 dark:bg-zinc-800 rounded-lg w-32" />
          </div>
        </div>

        {/* Action Toolbar Skeleton */}
        <div className="h-12 bg-zinc-200/50 dark:bg-zinc-900/50 rounded-xl" />

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-zinc-200/60 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50" />
          ))}
        </div>

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

  if (!stats) return null;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header & Urgent Status Briefing */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
              Mission Control
            </h1>
            {totalActionCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25 animate-in fade-in duration-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                {totalActionCount} Priority Action{totalActionCount !== 1 ? 's' : ''} Pending
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                All Systems Clear
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200/80 dark:border-zinc-700/80">
              Live Sync
            </span>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">
            Focus on what matters: urgent application deadlines, follow-ups, and live email engagements.
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/send" className="btn-primary">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Compose Outreach
          </Link>
          <Link href="/applications" className="btn-secondary">
            <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Applications Board
          </Link>
          <Link href="/prospects" className="btn-secondary">
            <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Prospects
          </Link>
        </div>
      </div>

      {/* Quick Links & Workflow Shortcuts Bar */}
      <div className="p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/40 flex items-center justify-between gap-2 overflow-x-auto">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-2 shrink-0 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Direct Shortcuts
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <Link
            href="/send"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors shadow-2xs"
          >
            ✉️ Quick Send
          </Link>
          <Link
            href="/applications"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors shadow-2xs"
          >
            📋 Application Pipeline
          </Link>
          <Link
            href="/prospects"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors shadow-2xs"
          >
            👥 Recruiter Directory
          </Link>
          <Link
            href="/history"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors shadow-2xs"
          >
            👁️ Email Opens & History
          </Link>
          <Link
            href="/scheduled"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors shadow-2xs"
          >
            ⏰ Scheduled Outbox
          </Link>
          <Link
            href="/companies"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors shadow-2xs"
          >
            🏢 Target Companies
          </Link>
        </div>
      </div>

      {/* High-Signal 4-KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Active In-Flight Pipeline */}
        <KpiCard
          label="Active Pipeline"
          value={pipelineMetrics.totalActive}
          badge={pipelineMetrics.interview > 0 ? `${pipelineMetrics.interview} in interview` : undefined}
          badgeColor="bg-purple-500/10 text-purple-700 dark:text-purple-300"
          sub={`${pipelineMetrics.screening} screening · ${pipelineMetrics.offer} offer`}
          href="/applications"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }
        />

        {/* KPI 2: Priority Action Items Pending */}
        <KpiCard
          label="Priority Actions"
          value={totalActionCount}
          badge={readyCount > 0 ? `${readyCount} expired referrals` : undefined}
          badgeColor="bg-amber-500/10 text-amber-700 dark:text-amber-300"
          sub={`${notAppliedCount} saved awaiting outreach`}
          onClick={() => {
            const el = document.getElementById('priority-action-center');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
          icon={
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />

        {/* KPI 3: Outreach & Open Rate */}
        <KpiCard
          label="Outreach & Opens"
          value={`${stats.emails.openRate}%`}
          badge={`${stats.emails.opened} opened`}
          badgeColor="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          sub={`${stats.emails.sent} sent · ${stats.emails.total} total recorded`}
          href="/history"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-.274.832-.67 1.608-1.166 2.305" />
            </svg>
          }
        />

        {/* KPI 4: Verified Prospects Network */}
        <KpiCard
          label="Prospects Network"
          value={stats.prospects}
          badge={`${stats.companies} companies`}
          sub="Verified recruiter & engineer contacts"
          href="/prospects"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
          }
        />
      </div>

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
                  <div className="min-w-0 space-y-1 pr-6 md:pr-0">
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
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {app.job_url && (
                      <a
                        href={app.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-xs inline-flex items-center gap-1.5"
                      >
                        Open Portal
                        <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}

                    <Link
                      href={`/send?jobId=${app.job_id ?? app.id}&companyName=${encodeURIComponent(app.company_name)}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Follow-up Note
                    </Link>

                    <button
                      onClick={() => handleMarkExpired(app.id)}
                      disabled={actioningId === app.id}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 bg-zinc-100 hover:bg-rose-500/10 dark:bg-zinc-800 dark:hover:bg-rose-500/20 border border-zinc-200 dark:border-zinc-700/80 hover:border-rose-500/30 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                      title="Mark this job opening as closed/expired"
                    >
                      {actioningId === app.id ? 'Updating...' : '✕ Mark Expired'}
                    </button>

                    <button
                      onClick={() => handleMarkApplied(app.id)}
                      disabled={applyingId === app.id}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-all shadow-2xs cursor-pointer"
                    >
                      {applyingId === app.id ? 'Updating...' : '✓ Mark as Applied'}
                    </button>

                    <button
                      onClick={() => handleDismissAction('ready', app.id)}
                      disabled={actioningId === app.id}
                      className="text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
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
                <div className="min-w-0 space-y-1 pr-6 md:pr-0">
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
                  </p>
                </div>

                {/* Direct Action Buttons */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {app.job_url && (
                    <a
                      href={app.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-xs inline-flex items-center gap-1"
                    >
                      Listing
                      <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}

                  <Link
                    href={`/send?jobId=${app.job_id ?? app.id}&companyName=${encodeURIComponent(app.company_name)}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Ask Referral
                  </Link>

                  <button
                    onClick={() => handleMarkExpired(app.id)}
                    disabled={actioningId === app.id}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 bg-zinc-100 hover:bg-rose-500/10 dark:bg-zinc-800 dark:hover:bg-rose-500/20 border border-zinc-200 dark:border-zinc-700/80 hover:border-rose-500/30 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                    title="Mark this job opening as closed/expired"
                  >
                    {actioningId === app.id ? 'Updating...' : '✕ Mark Expired'}
                  </button>

                  <button
                    onClick={() => handleMarkApplied(app.id)}
                    disabled={applyingId === app.id}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/25 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    {applyingId === app.id ? 'Updating...' : '✓ Mark Applied'}
                  </button>

                  <button
                    onClick={() => handleDismissAction('not_applied', app.id)}
                    disabled={actioningId === app.id}
                    className="text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
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
                  <div className="min-w-0 space-y-1 pr-6 md:pr-0">
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
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Link
                      href="/applications"
                      className="btn-secondary text-xs"
                    >
                      View Notes & Status
                    </Link>

                    <Link
                      href={`/send?companyName=${encodeURIComponent(app.company_name)}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Send Update Note
                    </Link>

                    <button
                      onClick={() => handleDismissAction('interview', app.id)}
                      disabled={actioningId === app.id}
                      className="text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
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
                <div className="min-w-0 space-y-1 pr-6 md:pr-0">
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

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/send?to=${encodeURIComponent(send.recipient_email ?? '')}&subject=${encodeURIComponent(send.subject ?? '')}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 px-3 py-1.5 rounded-lg transition-colors shadow-2xs"
                  >
                    Retry Send
                  </Link>
                  <Link href="/history" className="btn-secondary text-xs">
                    Inspect in History
                  </Link>
                  <button
                    onClick={() => handleDismissAction('failed', send.id)}
                    className="text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
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

          {stats.recentSends.length === 0 ? (
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
                          {send.template?.name ?? send.subject ?? 'Direct message'}
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
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{s.template?.name ?? 'Batch outreach'}</p>
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
