'use client';

import { useEffect, useState } from 'react';
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
  sent: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs shadow-emerald-500/10',
  failed: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 shadow-xs shadow-rose-500/10',
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-xs shadow-amber-500/10',
  sending: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30 shadow-xs shadow-sky-500/10',
  cancelled: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30',
};

const APP_STATUS_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  not_applied: { label: 'Saved', color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700', dotColor: 'bg-slate-400' },
  applied: { label: 'Applied', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30', dotColor: 'bg-blue-500' },
  screening: { label: 'Screening', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30', dotColor: 'bg-indigo-500' },
  interview: { label: 'Interview', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30', dotColor: 'bg-purple-500' },
  offer: { label: 'Offer', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', dotColor: 'bg-emerald-500' },
  rejected: { label: 'Rejected', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30', dotColor: 'bg-rose-500' },
  withdrawn: { label: 'Withdrawn', color: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700', dotColor: 'bg-slate-400' },
};

const CATEGORY_COLOR: Record<string, string> = {
  hr: 'from-purple-500 to-indigo-500 shadow-purple-500/20',
  engineer: 'from-blue-500 to-cyan-500 shadow-blue-500/20',
  other: 'from-slate-400 to-slate-500 shadow-slate-400/20',
  unknown: 'from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700 shadow-slate-400/10',
};

const CATEGORY_LABEL: Record<string, string> = {
  hr: 'HR / Recruiter',
  engineer: 'Engineer',
  other: 'Other',
  unknown: 'Uncategorised',
};

function AntigravityStatCard({
  label,
  value,
  sub,
  accentGradient,
  icon,
  href,
  delay = '0ms',
}: {
  label: string;
  value: string | number;
  sub?: string;
  accentGradient: string;
  icon: React.ReactNode;
  href?: string;
  delay?: string;
}) {
  const content = (
    <div
      style={{ animationDelay: delay }}
      className="group relative rounded-3xl p-5 bg-white/80 dark:bg-slate-900/75 backdrop-blur-xl border border-white/70 dark:border-slate-800/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)] hover:shadow-[0_20px_40px_rgba(99,102,241,0.12)] dark:hover:shadow-[0_20px_40px_rgba(99,102,241,0.2)] hover:border-indigo-500/40 dark:hover:border-indigo-400/40 hover:-translate-y-1.5 transition-all duration-300 ease-out will-change-transform overflow-hidden flex flex-col justify-between"
    >
      {/* Subtle Specular Ambient Glow inside card */}
      <div className="absolute -top-12 -right-12 w-28 h-28 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500 pointer-events-none" />

      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight mt-1.5">{value}</p>
        </div>
        <div className={`p-3 rounded-2xl bg-gradient-to-br ${accentGradient} text-white shadow-md group-hover:scale-110 transition-transform duration-300 shrink-0`}>
          {icon}
        </div>
      </div>

      {sub && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60 relative z-10 flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">{sub}</p>
          <span className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all text-xs font-bold">
            →
          </span>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-3xl">
        {content}
      </Link>
    );
  }
  return content;
}

function GlowingMiniBar({ value, max, gradient }: { value: number; max: number; gradient: string }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  return (
    <div className="w-full bg-slate-100/80 dark:bg-slate-800/80 rounded-full h-2 overflow-hidden p-0.5 border border-slate-200/50 dark:border-slate-700/50">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-700 ease-out shadow-xs`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ActivityChart({ days }: { days: { day: string; sent: number; failed: number }[] }) {
  const max = Math.max(...days.map((d) => d.sent + d.failed), 1);
  return (
    <div className="flex items-end gap-2 h-32 pt-4 px-1">
      {days.map((d) => {
        const total = d.sent + d.failed;
        const pct = (total / max) * 100;
        const failPct = total > 0 ? (d.failed / total) * 100 : 0;
        const sentPct = 100 - failPct;
        const label = new Date(d.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
            <div
              className="w-full rounded-xl overflow-hidden flex flex-col-reverse transition-all duration-300 bg-slate-100/70 dark:bg-slate-800/70 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 border border-slate-200/40 dark:border-slate-700/40 group-hover:scale-y-105 origin-bottom shadow-xs"
              style={{ height: `${Math.max(pct, 10)}%` }}
            >
              <div
                className="bg-gradient-to-t from-emerald-600 to-teal-400 dark:from-emerald-500 dark:to-teal-300 transition-all duration-500 shadow-sm"
                style={{ height: `${sentPct}%` }}
              />
              {d.failed > 0 && (
                <div
                  className="bg-gradient-to-t from-rose-600 to-pink-500 dark:from-rose-500 dark:to-pink-400 transition-all duration-500 shadow-sm"
                  style={{ height: `${failPct}%` }}
                />
              )}
            </div>

            {/* Antigravity Floating Glass Tooltip */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900/90 dark:bg-slate-800/95 backdrop-blur-md text-white text-[11px] font-medium px-2.5 py-1 rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 pointer-events-none z-30 shadow-xl border border-white/10 flex items-center gap-1.5">
              <span>{label}:</span>
              <span className="font-bold text-emerald-400">{d.sent} sent</span>
              {d.failed > 0 && <span className="font-bold text-rose-400">· {d.failed} failed</span>}
            </div>
          </div>
        );
      })}
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
      <div className="relative p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-9 bg-slate-200/70 dark:bg-slate-800/70 backdrop-blur-md rounded-2xl w-56 animate-pulse" />
            <div className="h-4 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl w-72 animate-pulse" />
          </div>
          <div className="h-11 bg-slate-200/70 dark:bg-slate-800/70 rounded-2xl w-40 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-36 bg-slate-200/60 dark:bg-slate-900/60 rounded-3xl animate-pulse backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50" />
          ))}
        </div>
        <div className="h-44 bg-slate-200/60 dark:bg-slate-900/60 rounded-3xl animate-pulse backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-72 bg-slate-200/60 dark:bg-slate-900/60 rounded-3xl animate-pulse backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50" />
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
    <div className="relative p-4 md:p-8 space-y-8 max-w-7xl mx-auto overflow-hidden">
      {/* Antigravity Ambient Lighting Spheres (Floating in backdrop) */}
      <div className="absolute top-0 left-1/4 -translate-x-1/2 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-600/15 rounded-full blur-3xl pointer-events-none animate-pulse-glow" />
      <div className="absolute top-1/3 right-10 w-80 h-80 bg-purple-500/10 dark:bg-purple-600/15 rounded-full blur-3xl pointer-events-none animate-pulse-glow" style={{ animationDelay: '3s' }} />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-emerald-500/10 dark:bg-emerald-600/15 rounded-full blur-3xl pointer-events-none animate-pulse-glow" style={{ animationDelay: '5s' }} />

      {/* Hero Header with Live Pulse Badge & Actions */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 p-6 rounded-3xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl border border-white/80 dark:border-slate-800/80 shadow-[0_8px_30px_rgb(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              Mission Control
            </h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs shadow-emerald-500/10">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="w-2 h-2 rounded-full bg-emerald-500 -ml-3.5" />
              Live Sync
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Recruiter outreach, multi-channel pipelines, and candidate engagement metrics
          </p>
        </div>

        {/* Action Buttons with Glassmorphism elevation */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/send"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-bold px-4 py-2.5 rounded-2xl transition-all duration-200 shadow-md shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Compose / Send
          </Link>
          <Link
            href="/applications"
            className="inline-flex items-center gap-2 bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-800 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 text-xs font-bold px-3.5 py-2.5 rounded-2xl transition-all duration-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
          >
            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Applications
          </Link>
          <Link
            href="/prospects"
            className="inline-flex items-center gap-2 bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-800 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 text-xs font-bold px-3.5 py-2.5 rounded-2xl transition-all duration-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
          >
            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Add Prospect
          </Link>
        </div>
      </div>

      {/* 3D Stat Cards Grid */}
      <div className="relative z-10 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <AntigravityStatCard
          label="Applications"
          value={stats.applications ?? 0}
          sub={`${appStatusCounts.interview} in interview`}
          accentGradient="from-indigo-600 to-indigo-500 shadow-indigo-500/25"
          href="/applications"
          delay="0ms"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }
        />
        <AntigravityStatCard
          label="Emails Sent"
          value={stats.emails.sent}
          sub={`${stats.emails.total} queued overall`}
          accentGradient="from-emerald-600 to-teal-500 shadow-emerald-500/25"
          href="/history"
          delay="50ms"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />
        <AntigravityStatCard
          label="Open Rate"
          value={`${stats.emails.openRate}%`}
          sub={`${stats.emails.opened} opened sends`}
          accentGradient="from-sky-600 to-blue-500 shadow-sky-500/25"
          href="/history"
          delay="100ms"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-.274.832-.67 1.608-1.166 2.305" />
            </svg>
          }
        />
        <AntigravityStatCard
          label="Prospects"
          value={stats.prospects}
          sub="Verified contacts"
          accentGradient="from-purple-600 to-violet-500 shadow-purple-500/25"
          href="/prospects"
          delay="150ms"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
          }
        />
        <AntigravityStatCard
          label="Companies"
          value={stats.companies}
          sub="Hiring pipelines"
          accentGradient="from-blue-600 to-indigo-500 shadow-blue-500/25"
          href="/companies"
          delay="200ms"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3M9 7h1m-1 4h1m4-4h1m-1 4h1M9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4" />
            </svg>
          }
        />
        <AntigravityStatCard
          label="Templates"
          value={stats.templates}
          sub="Outreach assets"
          accentGradient="from-amber-500 to-orange-500 shadow-amber-500/25"
          href="/templates"
          delay="250ms"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
      </div>

      {/* Application Funnel & Stages Tracker */}
      <div className="relative z-10 rounded-3xl p-6 sm:p-7 bg-white/75 dark:bg-slate-900/75 backdrop-blur-2xl border border-white/80 dark:border-slate-800/80 shadow-[0_8px_30px_rgb(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              Application Pipeline Stages
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Automated tracking via extension scraping and job portal synchronization</p>
          </div>
          <Link
            href="/applications"
            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors"
          >
            Manage pipeline →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
          {[
            { key: 'applied', label: 'Applied', count: appStatusCounts.applied, gradient: 'from-blue-500 to-cyan-500', text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/5 dark:bg-blue-500/10 border-blue-500/20' },
            { key: 'screening', label: 'Screening', count: appStatusCounts.screening, gradient: 'from-indigo-500 to-purple-500', text: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/5 dark:bg-indigo-500/10 border-indigo-500/20' },
            { key: 'interview', label: 'Interviewing', count: appStatusCounts.interview, gradient: 'from-purple-500 to-pink-500', text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/5 dark:bg-purple-500/10 border-purple-500/20' },
            { key: 'offer', label: 'Offers', count: appStatusCounts.offer, gradient: 'from-emerald-500 to-teal-500', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/20' },
            { key: 'rejected', label: 'Rejected', count: appStatusCounts.rejected, gradient: 'from-rose-500 to-red-500', text: 'text-rose-500 dark:text-rose-400', bg: 'bg-rose-500/5 dark:bg-rose-500/10 border-rose-500/20' },
          ].map((stage) => {
            const pct = stats.applications > 0 ? Math.round((stage.count / stats.applications) * 100) : 0;
            return (
              <div
                key={stage.key}
                className={`rounded-2xl border p-4 ${stage.bg} backdrop-blur-md flex flex-col justify-between hover:scale-[1.02] transition-transform duration-200 shadow-xs`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{stage.label}</span>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 font-mono">{pct}%</span>
                </div>
                <div className="mt-3">
                  <span className={`text-2xl font-black ${stage.text} tracking-tight`}>{stage.count}</span>
                  <div className="w-full bg-slate-200/60 dark:bg-slate-800/60 rounded-full h-1.5 mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${stage.gradient} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Middle Visualizers Row: Activity Chart + Categories + Top Companies */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 14-day outreach activity chart */}
        <div className="rounded-3xl p-6 bg-white/75 dark:bg-slate-900/75 backdrop-blur-2xl border border-white/80 dark:border-slate-800/80 shadow-[0_8px_30px_rgb(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Outreach Activity (14 Days)
              </h2>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                {stats.emails.sent} sent
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-3">Daily sent and failed outreach dispatches</p>
            <div className="flex gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-xs shadow-emerald-500/50" />
                Sent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-xs shadow-rose-500/50" />
                Failed
              </span>
            </div>
          </div>
          {stats.dailyActivity.length === 0 ? (
            <p className="text-slate-400 text-xs py-10 text-center font-medium">No email activity recorded in the last 14 days.</p>
          ) : (
            <ActivityChart days={stats.dailyActivity} />
          )}
        </div>

        {/* Prospect category distribution */}
        <div className="rounded-3xl p-6 bg-white/75 dark:bg-slate-900/75 backdrop-blur-2xl border border-white/80 dark:border-slate-800/80 shadow-[0_8px_30px_rgb(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              Prospects by Category
            </h2>
            <Link href="/prospects" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold">
              View all →
            </Link>
          </div>
          {stats.prospectsByCategory.length === 0 ? (
            <p className="text-slate-400 text-xs py-10 text-center font-medium">No categorized prospects found.</p>
          ) : (
            <div className="space-y-4">
              {stats.prospectsByCategory.map((r) => (
                <div key={r.category} className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </span>
                    <span>
                      {r.count}{' '}
                      <span className="text-slate-400 font-normal">
                        ({categoryTotal > 0 ? Math.round((r.count / categoryTotal) * 100) : 0}%)
                      </span>
                    </span>
                  </div>
                  <GlowingMiniBar
                    value={r.count}
                    max={categoryTotal}
                    gradient={CATEGORY_COLOR[r.category] ?? 'from-slate-400 to-slate-500'}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top target companies leaderboard */}
        <div className="rounded-3xl p-6 bg-white/75 dark:bg-slate-900/75 backdrop-blur-2xl border border-white/80 dark:border-slate-800/80 shadow-[0_8px_30px_rgb(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              Top Target Companies
            </h2>
            <Link href="/companies" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold">
              View all →
            </Link>
          </div>
          {stats.topCompanies.length === 0 ? (
            <p className="text-slate-400 text-xs py-10 text-center font-medium">No company targets added yet.</p>
          ) : (
            <div className="space-y-3.5">
              {stats.topCompanies.map((c, index) => (
                <div key={c.name} className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300 font-semibold">
                    <span className="truncate pr-2 flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] flex items-center justify-center font-mono font-bold text-slate-500">
                        {index + 1}
                      </span>
                      {c.name}
                    </span>
                    <span className="shrink-0 text-slate-500 dark:text-slate-400 text-[11px]">
                      {c.count} prospect{c.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <GlowingMiniBar value={c.count} max={companyMax} gradient="from-indigo-500 to-blue-500 shadow-indigo-500/20" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Recent Sends + Recent Applications + Upcoming Schedules */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent email outreach */}
        <div className="rounded-3xl bg-white/75 dark:bg-slate-900/75 backdrop-blur-2xl border border-white/80 dark:border-slate-800/80 shadow-[0_8px_30px_rgb(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/80">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Recent Dispatches
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Latest outreach transmission records</p>
            </div>
            <Link href="/history" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold">
              History →
            </Link>
          </div>
          {stats.recentSends.length === 0 ? (
            <p className="px-6 py-12 text-slate-400 text-xs text-center font-medium">No outreach emails sent yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 overflow-y-auto max-h-84">
              {(stats.recentSends as EmailSend[]).map((send) => (
                <div key={send.id} className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {send.prospect ? prospectFullName(send.prospect) : send.company?.name ?? '—'}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {send.template?.name ?? send.subject ?? 'Direct outreach message'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_COLOR[send.status] ?? ''}`}>
                        {send.status}
                      </span>
                      {send.open_count > 0 && (
                        <span className="text-[10px] font-bold text-sky-500 bg-sky-500/10 px-1.5 py-0.5 rounded-full border border-sky-500/20 shadow-xs">
                          👁 {send.open_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono mt-2 flex items-center gap-1">
                    <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div className="rounded-3xl bg-white/75 dark:bg-slate-900/75 backdrop-blur-2xl border border-white/80 dark:border-slate-800/80 shadow-[0_8px_30px_rgb(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/80">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Recent Applications
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Recorded job submissions & portals</p>
            </div>
            <Link href="/applications" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold">
              View all →
            </Link>
          </div>
          {(!stats.recentApplications || stats.recentApplications.length === 0) ? (
            <p className="px-6 py-12 text-slate-400 text-xs text-center font-medium">No job applications recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 overflow-y-auto max-h-84">
              {stats.recentApplications.map((app) => {
                const conf = APP_STATUS_CONFIG[app.status] ?? APP_STATUS_CONFIG.applied;
                return (
                  <div key={app.id} className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{app.company_name}</p>
                          {app.platform && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-slate-100/90 dark:bg-slate-800 text-slate-500 border border-slate-200/50 dark:border-slate-700/50">
                              {app.platform}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 font-medium">{app.job_title}</p>
                      </div>
                      <span className={`inline-flex text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${conf.color}`}>
                        {conf.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(app.applied_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      {app.job_url && (
                        <a
                          href={app.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
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
        <div className="rounded-3xl bg-white/75 dark:bg-slate-900/75 backdrop-blur-2xl border border-white/80 dark:border-slate-800/80 shadow-[0_8px_30px_rgb(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/80">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Scheduled Queue
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Automated batch dispatches</p>
            </div>
            <Link href="/scheduled" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold">
              Queue →
            </Link>
          </div>
          {stats.upcomingSchedules.length === 0 ? (
            <p className="px-6 py-12 text-slate-400 text-xs text-center font-medium">No upcoming outreach scheduled.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 overflow-y-auto max-h-84">
              {(stats.upcomingSchedules as EmailSchedule[]).map((s) => (
                <div key={s.id} className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{s.company?.name ?? 'Target Company'}</p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{s.template?.name ?? 'Batch outreach'}</p>
                    </div>
                    <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_COLOR[s.status] ?? ''}`}>
                      {s.total_prospects} recipient{s.total_prospects !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono mt-2 flex items-center gap-1">
                    <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
