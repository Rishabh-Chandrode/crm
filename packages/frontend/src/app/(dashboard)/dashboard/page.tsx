'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { prospectFullName } from '@/lib/types';
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
  prospectsByCategory: { category: string; count: number }[];
  topCompanies: { name: string; count: number }[];
  recentSends: EmailSend[];
  upcomingSchedules: EmailSchedule[];
  dailyActivity: { day: string; sent: number; failed: number }[];
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
  applied: { label: 'Applied', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', dotColor: 'bg-blue-500' },
  screening: { label: 'Screening', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20', dotColor: 'bg-indigo-500' },
  interview: { label: 'Interview', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20', dotColor: 'bg-purple-500' },
  offer: { label: 'Offer', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', dotColor: 'bg-emerald-500' },
  rejected: { label: 'Rejected', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20', dotColor: 'bg-rose-500' },
  withdrawn: { label: 'Withdrawn', color: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800', dotColor: 'bg-zinc-400' },
};

const CATEGORY_LABEL: Record<string, string> = {
  hr: 'HR / Recruiter',
  engineer: 'Engineer',
  other: 'Other',
  unknown: 'Uncategorised',
};

function StatCard({
  label,
  value,
  sub,
  icon,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  href?: string;
}) {
  const content = (
    <div className="card p-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all group flex flex-col justify-between h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight mt-1">{value}</p>
        </div>
        <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 shrink-0">
          {icon}
        </div>
      </div>

      {sub && (
        <div className="mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium truncate">{sub}</p>
          <span className="text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 group-hover:translate-x-0.5 transition-all text-xs font-semibold">
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
  return content;
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  return (
    <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
      <div
        className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ActivityChart({ days }: { days: { day: string; sent: number; failed: number }[] }) {
  const full14Days = useMemo(() => {
    const map = new Map<string, { sent: number; failed: number }>();
    for (const d of days) {
      const dateKey = new Date(d.day).toISOString().slice(0, 10);
      map.set(dateKey, { sent: Number(d.sent), failed: Number(d.failed) });
    }

    const result: { dateKey: string; date: Date; sent: number; failed: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const target = new Date(now);
      target.setDate(target.getDate() - i);
      const dateKey = target.toISOString().slice(0, 10);
      const existing = map.get(dateKey) || { sent: 0, failed: 0 };
      result.push({
        dateKey,
        date: target,
        sent: existing.sent,
        failed: existing.failed,
      });
    }
    return result;
  }, [days]);

  const max = Math.max(...full14Days.map((d) => d.sent + d.failed), 1);

  return (
    <div className="pt-2 w-full min-w-0 overflow-hidden">
      <div className="flex items-end justify-between gap-1 h-32 pt-4 px-0.5 w-full min-w-0">
        {full14Days.map((d) => {
          const total = d.sent + d.failed;
          const hasActivity = total > 0;
          const pct = hasActivity ? Math.max((total / max) * 100, 14) : 0;
          const failPct = total > 0 ? (d.failed / total) * 100 : 0;
          const sentPct = 100 - failPct;
          const label = d.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          const dayNum = d.date.getDate();

          return (
            <div key={d.dateKey} className="flex-1 min-w-0 flex flex-col items-center gap-1.5 group relative h-full justify-end">
              {/* Bar track container */}
              <div className="w-full flex items-end justify-center h-full pb-0.5">
                {hasActivity ? (
                  <div
                    className="w-full max-w-[12px] sm:max-w-[16px] rounded-md overflow-hidden flex flex-col-reverse transition-all bg-zinc-100 dark:bg-zinc-800 group-hover:scale-y-105 origin-bottom"
                    style={{ height: `${pct}%` }}
                  >
                    <div
                      className="bg-emerald-500 transition-all duration-300"
                      style={{ height: `${sentPct}%` }}
                    />
                    {d.failed > 0 && (
                      <div
                        className="bg-rose-500 transition-all duration-300"
                        style={{ height: `${failPct}%` }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="w-full max-w-[12px] sm:max-w-[16px] h-1 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                )}
              </div>

              {/* Day label */}
              <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500 font-mono truncate text-center w-full leading-none">
                {dayNum}
              </span>

              {/* Tooltip */}
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 shadow-md flex items-center gap-1.5">
                <span>{label}:</span>
                {hasActivity ? (
                  <>
                    <span className="font-semibold text-emerald-400 dark:text-emerald-600">{d.sent} sent</span>
                    {d.failed > 0 && <span className="font-semibold text-rose-400 dark:text-rose-600">· {d.failed} fail</span>}
                  </>
                ) : (
                  <span>0 emails</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<ExtendedStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stats.get()
      .then((data) => setStats(data as unknown as ExtendedStats))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-7 bg-zinc-200 dark:bg-zinc-800 rounded-lg w-48 animate-pulse" />
            <div className="h-4 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-md w-64 animate-pulse" />
          </div>
          <div className="h-9 bg-zinc-200 dark:bg-zinc-800 rounded-lg w-32 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 bg-zinc-200/60 dark:bg-zinc-900/60 rounded-xl animate-pulse border border-zinc-200/50 dark:border-zinc-800/50" />
          ))}
        </div>
        <div className="h-36 bg-zinc-200/60 dark:bg-zinc-900/60 rounded-xl animate-pulse border border-zinc-200/50 dark:border-zinc-800/50" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-zinc-200/60 dark:bg-zinc-900/60 rounded-xl animate-pulse border border-zinc-200/50 dark:border-zinc-800/50" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const categoryTotal = stats.prospectsByCategory?.reduce((s, r) => s + r.count, 0) ?? 0;
  const companyMax = Math.max(...(stats.topCompanies?.map((c) => c.count) ?? [1]), 1);

  // Application pipeline aggregation
  const appStatusCounts: Record<string, number> = {
    applied: 0,
    screening: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
  };
  if (stats.applicationsByStatus) {
    for (const item of stats.applicationsByStatus) {
      if (item.status in appStatusCounts) {
        appStatusCounts[item.status] = item.count;
      }
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
              Mission Control
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Live Sync
            </span>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">
            Recruiter outreach, multi-channel pipelines, and candidate engagement metrics
          </p>
        </div>

        {/* Action Buttons (shadcn & Apple style) */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/send" className="btn-primary">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Compose / Send
          </Link>
          <Link href="/applications" className="btn-secondary">
            <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Applications
          </Link>
          <Link href="/prospects" className="btn-secondary">
            <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Add Prospect
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        <StatCard
          label="Applications"
          value={stats.applications ?? 0}
          sub={`${appStatusCounts.interview} in interview`}
          href="/applications"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }
        />
        <StatCard
          label="Emails Sent"
          value={stats.emails.sent}
          sub={`${stats.emails.total} queued overall`}
          href="/history"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatCard
          label="Open Rate"
          value={`${stats.emails.openRate}%`}
          sub={`${stats.emails.opened} opened sends`}
          href="/history"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-.274.832-.67 1.608-1.166 2.305" />
            </svg>
          }
        />
        <StatCard
          label="Prospects"
          value={stats.prospects}
          sub="Verified contacts"
          href="/prospects"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
          }
        />
        <StatCard
          label="Companies"
          value={stats.companies}
          sub="Hiring pipelines"
          href="/companies"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3M9 7h1m-1 4h1m4-4h1m-1 4h1M9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4" />
            </svg>
          }
        />
        <StatCard
          label="Templates"
          value={stats.templates}
          sub="Outreach assets"
          href="/templates"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
      </div>

      {/* Application Funnel & Stages Tracker */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight uppercase">
              Application Pipeline Stages
            </h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Automated tracking via extension scraping and job portal synchronization</p>
          </div>
          <Link
            href="/applications"
            className="text-xs font-semibold text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors"
          >
            Manage pipeline →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {[
            { key: 'applied', label: 'Applied', count: appStatusCounts.applied, color: 'text-blue-600 dark:text-blue-400' },
            { key: 'screening', label: 'Screening', count: appStatusCounts.screening, color: 'text-indigo-600 dark:text-indigo-400' },
            { key: 'interview', label: 'Interviewing', count: appStatusCounts.interview, color: 'text-purple-600 dark:text-purple-400' },
            { key: 'offer', label: 'Offers', count: appStatusCounts.offer, color: 'text-emerald-600 dark:text-emerald-400' },
            { key: 'rejected', label: 'Rejected', count: appStatusCounts.rejected, color: 'text-rose-500 dark:text-rose-400' },
          ].map((stage) => {
            const pct = stats.applications > 0 ? Math.round((stage.count / stats.applications) * 100) : 0;
            return (
              <div
                key={stage.key}
                className="rounded-lg border border-zinc-200/70 dark:border-zinc-800/70 p-3 bg-zinc-50/50 dark:bg-zinc-900/40 flex flex-col justify-between transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{stage.label}</span>
                  <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">{pct}%</span>
                </div>
                <div className="mt-2.5">
                  <span className={`text-xl font-bold ${stage.color} tracking-tight`}>{stage.count}</span>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1 mt-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Middle Row: Activity Chart + Categories + Top Companies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
        {/* 14-day outreach activity chart */}
        <div className="card p-5 flex flex-col justify-between lg:col-span-2 xl:col-span-1">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight uppercase">
                Outreach Activity (14 Days)
              </h2>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                {stats.emails.sent} sent
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-3">Daily sent and failed outreach dispatches</p>
            <div className="flex gap-3 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Sent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                Failed
              </span>
            </div>
          </div>
          {stats.dailyActivity.length === 0 ? (
            <p className="text-zinc-400 text-xs py-8 text-center font-medium">No email activity recorded in the last 14 days.</p>
          ) : (
            <ActivityChart days={stats.dailyActivity} />
          )}
        </div>

        {/* Prospect category distribution */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight uppercase">
              Prospects by Category
            </h2>
            <Link href="/prospects" className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-medium">
              View all →
            </Link>
          </div>
          {stats.prospectsByCategory.length === 0 ? (
            <p className="text-zinc-400 text-xs py-8 text-center font-medium">No categorized prospects found.</p>
          ) : (
            <div className="space-y-3">
              {stats.prospectsByCategory.map((r) => (
                <div key={r.category} className="space-y-1">
                  <div className="flex justify-between text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100" />
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </span>
                    <span>
                      {r.count}{' '}
                      <span className="text-zinc-400 font-normal">
                        ({categoryTotal > 0 ? Math.round((r.count / categoryTotal) * 100) : 0}%)
                      </span>
                    </span>
                  </div>
                  <MiniBar value={r.count} max={categoryTotal} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top target companies leaderboard */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight uppercase">
              Top Target Companies
            </h2>
            <Link href="/companies" className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-medium">
              View all →
            </Link>
          </div>
          {stats.topCompanies.length === 0 ? (
            <p className="text-zinc-400 text-xs py-8 text-center font-medium">No company targets added yet.</p>
          ) : (
            <div className="space-y-2.5">
              {stats.topCompanies.map((c, index) => (
                <div key={c.name} className="space-y-1">
                  <div className="flex justify-between text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                    <span className="truncate pr-2 flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] flex items-center justify-center font-mono font-semibold text-zinc-500">
                        {index + 1}
                      </span>
                      {c.name}
                    </span>
                    <span className="shrink-0 text-zinc-500 dark:text-zinc-400 text-[11px]">
                      {c.count} prospect{c.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <MiniBar value={c.count} max={companyMax} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Recent Sends + Recent Applications + Upcoming Schedules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
        {/* Recent email outreach */}
        <div className="card overflow-hidden flex flex-col lg:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight uppercase">
                Recent Dispatches
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Latest outreach transmission records</p>
            </div>
            <Link href="/history" className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-medium">
              History →
            </Link>
          </div>
          {stats.recentSends.length === 0 ? (
            <p className="px-5 py-10 text-zinc-400 text-xs text-center font-medium">No outreach emails sent yet.</p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-y-auto max-h-80">
              {(stats.recentSends as EmailSend[]).map((send) => (
                <div key={send.id} className="p-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-850/60 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {send.prospect ? prospectFullName(send.prospect) : send.company?.name ?? '—'}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        {send.template?.name ?? send.subject ?? 'Direct outreach message'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLOR[send.status] ?? ''}`}>
                        {send.status}
                      </span>
                      {send.open_count > 0 && (
                        <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                          👁 {send.open_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-400 font-mono mt-1.5 flex items-center gap-1">
                    <svg className="w-3 h-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {new Date(send.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent job applications */}
        <div className="card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight uppercase">
                Recent Applications
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Recorded job submissions & portals</p>
            </div>
            <Link href="/applications" className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-medium">
              View all →
            </Link>
          </div>
          {(!stats.recentApplications || stats.recentApplications.length === 0) ? (
            <p className="px-5 py-10 text-zinc-400 text-xs text-center font-medium">No job applications recorded yet.</p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-y-auto max-h-80">
              {stats.recentApplications.map((app) => {
                const conf = APP_STATUS_CONFIG[app.status] ?? APP_STATUS_CONFIG.applied;
                return (
                  <div key={app.id} className="p-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-850/60 transition-colors">
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
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {new Date(app.applied_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      {app.job_url && (
                        <a
                          href={app.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 hover:underline flex items-center gap-1 font-medium"
                        >
                          Listing
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming schedules */}
        <div className="card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight uppercase">
                Scheduled Queue
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Automated batch dispatches</p>
            </div>
            <Link href="/scheduled" className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-medium">
              Queue →
            </Link>
          </div>
          {stats.upcomingSchedules.length === 0 ? (
            <p className="px-5 py-10 text-zinc-400 text-xs text-center font-medium">No upcoming outreach scheduled.</p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-y-auto max-h-80">
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
      </div>
    </div>
  );
}

