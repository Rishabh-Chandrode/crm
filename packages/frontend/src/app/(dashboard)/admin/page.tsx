'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { AdminMonitoringOverview } from '@/lib/types';

export default function AdminMonitoringPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [data, setData] = useState<AdminMonitoringOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.auth
      .me()
      .then((res) => setIsAdmin(res.user?.role === 'admin'))
      .catch(() => setIsAdmin(false));
  }, []);

  const loadMonitoring = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.admin.monitoring();
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      void loadMonitoring();
    }
  }, [isAdmin, loadMonitoring]);

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-6 h-6 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <div className="max-w-md mx-auto mt-16 p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-center shadow-xs">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Access Restricted</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            System monitoring is restricted to administrator accounts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Admin System Monitoring
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Real-time overview of application usage, cron jobs, third-party APIs, AI requests, and error telemetry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/logs"
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            View All Logs
          </Link>
          <button
            onClick={() => void loadMonitoring()}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl text-xs text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* User & Application Adoption Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Users (Active / Total)</span>
              <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mt-1 block">
                {data.users.active} / {data.users.total}
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 block">
                {data.users.gmailConnected} Gmail connected · {data.users.jobSyncEnabled} Email sync
              </span>
            </div>
            <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Emails Sent</span>
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">
                {data.applicationTotals.emailsSent}
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 block">
                {data.applicationTotals.emailsFailed} failed · {data.applicationTotals.emailsPending} pending
              </span>
            </div>
            <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">CRM Entities</span>
              <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mt-1 block">
                {data.applicationTotals.prospects}
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 block">
                {data.applicationTotals.companies} companies · {data.applicationTotals.templates} templates
              </span>
            </div>
            <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Jobs & Applications</span>
              <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mt-1 block">
                {data.applicationTotals.applications}
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 block">
                {data.applicationTotals.jobs} tracked jobs
              </span>
            </div>
          </div>

          {/* Cron Jobs Health */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Cron Jobs & Schedulers</h2>
              <Link href="/logs?source=cron" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                View Cron Logs →
              </Link>
            </div>
            {data.cronJobs.length === 0 ? (
              <p className="p-4 text-xs text-zinc-500 dark:text-zinc-400">No cron executions recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-950/60 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Job Name</th>
                      <th className="px-4 py-2.5 font-medium">Last Status</th>
                      <th className="px-4 py-2.5 font-medium">Duration</th>
                      <th className="px-4 py-2.5 font-medium">Last Run</th>
                      <th className="px-4 py-2.5 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {data.cronJobs.map((cron) => (
                      <tr key={cron.jobName}>
                        <td className="px-4 py-2.5 font-mono font-medium text-zinc-900 dark:text-zinc-100">{cron.jobName}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                              cron.lastPhase === 'completed'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                                : cron.lastPhase === 'failed'
                                ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
                            }`}
                          >
                            {cron.lastPhase}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                          {cron.durationMs !== null ? `${cron.durationMs}ms` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                          {new Date(cron.lastRunAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400 truncate max-w-xs">
                          {cron.lastMessage}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 24h Telemetry by Source (Third-party APIs, AI, HTTP) */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                24-Hour Telemetry by Source (Third-Party APIs, AI & HTTP)
              </h2>
            </div>
            {data.sourceTelemetry.length === 0 ? (
              <p className="p-4 text-xs text-zinc-500 dark:text-zinc-400">No telemetry events recorded in the last 24 hours.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-950/60 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Source</th>
                      <th className="px-4 py-2.5 font-medium">24h Calls</th>
                      <th className="px-4 py-2.5 font-medium">Warnings</th>
                      <th className="px-4 py-2.5 font-medium">Errors</th>
                      <th className="px-4 py-2.5 font-medium">Avg Latency</th>
                      <th className="px-4 py-2.5 font-medium">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {data.sourceTelemetry.map((row) => (
                      <tr key={row.source}>
                        <td className="px-4 py-2.5 font-mono font-medium text-zinc-900 dark:text-zinc-100">{row.source}</td>
                        <td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{row.total24h}</td>
                        <td className="px-4 py-2.5 text-amber-600 dark:text-amber-400">{row.warnings24h}</td>
                        <td className="px-4 py-2.5 text-red-600 dark:text-red-400 font-semibold">{row.errors24h}</td>
                        <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                          {row.avgDurationMs !== null ? `${row.avgDurationMs}ms` : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/logs?source=${encodeURIComponent(row.source)}`}
                            className="text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            Filter Logs
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Errors */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Recent Errors</h2>
              <Link href="/logs?level=error" className="text-xs text-red-600 dark:text-red-400 hover:underline">
                All Errors →
              </Link>
            </div>
            {data.recentErrors.length === 0 ? (
              <p className="p-4 text-xs text-emerald-600 dark:text-emerald-400">No recent errors recorded.</p>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {data.recentErrors.map((errLog) => (
                  <div key={errLog.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 mr-2">
                        {errLog.source}
                      </span>
                      <span className="text-zinc-900 dark:text-zinc-100 font-medium">{errLog.message}</span>
                    </div>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 shrink-0">
                      {new Date(errLog.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
