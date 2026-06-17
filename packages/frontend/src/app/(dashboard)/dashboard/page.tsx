'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { prospectFullName } from '@/lib/types';
import type { EmailSend, EmailSchedule } from '@/lib/types';

type Stats = Awaited<ReturnType<typeof api.stats.get>>;

const STATUS_COLOR: Record<string, string> = {
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
  sending: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const CATEGORY_COLOR: Record<string, string> = {
  hr: 'bg-purple-500',
  engineer: 'bg-blue-500',
  other: 'bg-slate-400',
  unknown: 'bg-slate-300',
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
  accent,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4">
      <div className={`rounded-lg p-2.5 ${accent}`}>{icon}</div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ActivityChart({ days }: { days: { day: string; sent: number; failed: number }[] }) {
  const max = Math.max(...days.map((d) => d.sent + d.failed), 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {days.map((d) => {
        const total = d.sent + d.failed;
        const pct = (total / max) * 100;
        const failPct = total > 0 ? (d.failed / total) * 100 : 0;
        const sentPct = 100 - failPct;
        const label = new Date(d.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div
              className="w-full rounded-sm overflow-hidden flex flex-col-reverse"
              style={{ height: `${Math.max(pct, 4)}%` }}
            >
              <div className="bg-green-400" style={{ height: `${sentPct}%` }} />
              {d.failed > 0 && <div className="bg-red-400" style={{ height: `${failPct}%` }} />}
            </div>
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {label}: {d.sent}✓ {d.failed > 0 ? `${d.failed}✗` : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stats.get()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-8">Loading…</p>
      </div>
    );
  }

  if (!stats) return null;

  const categoryTotal = stats.prospectsByCategory.reduce((s, r) => s + r.count, 0);
  const companyMax = Math.max(...stats.topCompanies.map((c) => c.count), 1);

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Overview of your outreach activity</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Companies"
          value={stats.companies}
          accent="bg-blue-50"
          icon={<svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3M9 7h1m-1 4h1m4-4h1m-1 4h1M9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4" /></svg>}
        />
        <StatCard
          label="Prospects"
          value={stats.prospects}
          accent="bg-violet-50"
          icon={<svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" /></svg>}
        />
        <StatCard
          label="Templates"
          value={stats.templates}
          accent="bg-amber-50"
          icon={<svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" /></svg>}
        />
        <StatCard
          label="Emails Sent"
          value={stats.emails.sent}
          sub={`${stats.emails.total} total`}
          accent="bg-green-50"
          icon={<svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
        />
        <StatCard
          label="Open Rate"
          value={`${stats.emails.openRate}%`}
          sub={`${stats.emails.opened} opened`}
          accent="bg-sky-50"
          icon={<svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-.274.832-.67 1.608-1.166 2.305" /></svg>}
        />
        <StatCard
          label="Failed"
          value={stats.emails.failed}
          sub={`${stats.emails.pending} pending`}
          accent="bg-red-50"
          icon={<svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
      </div>

      {/* Middle row: activity chart + category breakdown + top companies */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* 14-day activity */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Email activity (14 days)</h2>
          <div className="flex gap-3 text-xs text-slate-400 mb-3">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Sent</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Failed</span>
          </div>
          {stats.dailyActivity.length === 0 ? (
            <p className="text-slate-400 text-xs">No activity yet.</p>
          ) : (
            <ActivityChart days={stats.dailyActivity} />
          )}
        </div>

        {/* Prospect category breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Prospects by category</h2>
          {stats.prospectsByCategory.length === 0 ? (
            <p className="text-slate-400 text-xs">No prospects yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.prospectsByCategory.map((r) => (
                <div key={r.category}>
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span>{CATEGORY_LABEL[r.category] ?? r.category}</span>
                    <span className="font-medium">{r.count} <span className="text-slate-400">({categoryTotal > 0 ? Math.round((r.count / categoryTotal) * 100) : 0}%)</span></span>
                  </div>
                  <MiniBar value={r.count} max={categoryTotal} color={CATEGORY_COLOR[r.category] ?? 'bg-slate-400'} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top companies */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Top companies</h2>
          {stats.topCompanies.length === 0 ? (
            <p className="text-slate-400 text-xs">No companies yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.topCompanies.map((c) => (
                <div key={c.name}>
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span className="truncate pr-2">{c.name}</span>
                    <span className="font-medium shrink-0">{c.count} prospect{c.count !== 1 ? 's' : ''}</span>
                  </div>
                  <MiniBar value={c.count} max={companyMax} color="bg-indigo-400" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: recent sends + upcoming schedules */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Recent sends */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Recent sends</h2>
            <Link href="/history" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">View all →</Link>
          </div>
          {stats.recentSends.length === 0 ? (
            <p className="px-5 py-6 text-slate-400 text-sm">No emails sent yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="text-left px-5 py-2.5 text-slate-400 font-medium text-xs">Prospect</th>
                  <th className="text-left px-4 py-2.5 text-slate-400 font-medium text-xs">Template</th>
                  <th className="text-left px-4 py-2.5 text-slate-400 font-medium text-xs">Status</th>
                  <th className="text-left px-4 py-2.5 text-slate-400 font-medium text-xs">Date</th>
                </tr>
              </thead>
              <tbody>
                {(stats.recentSends as EmailSend[]).map((send) => (
                  <tr key={send.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800 max-w-[160px] truncate">
                      {send.prospect ? prospectFullName(send.prospect) : '—'}
                      {send.company?.name && <div className="text-slate-400 text-xs font-normal truncate">{send.company.name}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[120px] truncate">{send.template?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[send.status] ?? ''}`}>
                        {send.status}
                      </span>
                      {send.open_count > 0 && (
                        <span className="ml-1 text-sky-500 text-xs">👁 {send.open_count}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {new Date(send.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Upcoming schedules */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Upcoming schedules</h2>
            <Link href="/scheduled" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">View all →</Link>
          </div>
          {stats.upcomingSchedules.length === 0 ? (
            <p className="px-5 py-6 text-slate-400 text-sm">No upcoming sends.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {(stats.upcomingSchedules as EmailSchedule[]).map((s) => (
                <div key={s.id} className="px-5 py-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{s.company?.name ?? '—'}</p>
                      <p className="text-xs text-slate-400 truncate">{s.template?.name ?? '—'}</p>
                    </div>
                    <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[s.status] ?? ''}`}>
                      {s.total_prospects} contact{s.total_prospects !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
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
