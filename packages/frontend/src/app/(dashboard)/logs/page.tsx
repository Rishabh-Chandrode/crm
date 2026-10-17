'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { SystemLog, SystemLogLevel, SystemLogStats } from '@/lib/types';

export default function LogsPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [stats, setStats] = useState<SystemLogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Expanded log view
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Clearing / Pruning state
  const [actionLoading, setActionLoading] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);

  // Check admin role
  useEffect(() => {
    api.auth.me()
      .then((res) => {
        setIsAdmin(res.user?.role === 'admin');
      })
      .catch(() => {
        setIsAdmin(false);
      });
  }, []);

  const loadData = useCallback(async () => {
    if (isAdmin === false) return;
    setLoading(true);
    setError('');
    try {
      const [logsRes, statsRes] = await Promise.all([
        api.logs.list({
          level: (selectedLevel as SystemLogLevel) || undefined,
          source: selectedSource || undefined,
          search: searchQuery || undefined,
          page,
          limit: 20,
        }),
        api.logs.stats(),
      ]);

      setLogs(logsRes.data);
      setTotalPages(logsRes.totalPages);
      setTotalCount(logsRes.total);
      setStats(statsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system logs');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, selectedLevel, selectedSource, searchQuery, page]);

  useEffect(() => {
    if (isAdmin) {
      void loadData();
    }
  }, [isAdmin, loadData]);

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleClearLogs() {
    if (!confirm('Are you sure you want to clear system logs? This cannot be undone.')) return;
    setActionLoading(true);
    try {
      await api.logs.clear();
      setShowClearModal(false);
      setPage(1);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clear logs');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleManualPrune() {
    setActionLoading(true);
    try {
      const res = await api.logs.prune(30);
      alert(`Retention cleanup complete: ${res.deleted} logs older than 30 days were removed.`);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to prune logs');
    } finally {
      setActionLoading(false);
    }
  }

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
          <div className="w-12 h-12 bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Access Restricted</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Viewing system logs and error telemetry requires administrator privileges.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-1 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">System Logs & Observability</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Self-hosted in-database application telemetry with automatic 30-day rolling retention.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            onClick={handleManualPrune}
            disabled={actionLoading}
            title="Purge logs older than 30 days"
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Prune &gt;30d
          </button>
          <button
            onClick={() => setShowClearModal(true)}
            disabled={actionLoading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-700 dark:text-red-400 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear Logs
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xs">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Total Errors</span>
          <span className="text-xl font-bold text-red-600 dark:text-red-400 mt-1 block">
            {stats?.errors ?? 0}
          </span>
        </div>
        <div className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xs">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Warnings</span>
          <span className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1 block">
            {stats?.warnings ?? 0}
          </span>
        </div>
        <div className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xs">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Activity (24h)</span>
          <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 block">
            {stats?.last24Hours ?? 0}
          </span>
        </div>
        <div className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xs">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Retention Window</span>
          <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">
            30 Days
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xs flex flex-wrap items-center gap-2.5">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <svg className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search message, error name, path..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600"
            />
          </div>
        </div>

        {/* Level filter */}
        <select
          value={selectedLevel}
          onChange={(e) => {
            setSelectedLevel(e.target.value);
            setPage(1);
          }}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
        >
          <option value="">All Levels</option>
          <option value="error">Error</option>
          <option value="warn">Warn</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
        </select>

        {/* Source filter */}
        <select
          value={selectedSource}
          onChange={(e) => {
            setSelectedSource(e.target.value);
            setPage(1);
          }}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
        >
          <option value="">All Sources</option>
          <option value="gemini">Gemini LLM</option>
          <option value="backend">Backend</option>
          <option value="scheduler">Scheduler</option>
          <option value="email_sync">Email Sync</option>
          <option value="auth">Auth</option>
        </select>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl text-xs text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xs overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="py-16 text-center text-xs text-zinc-400">
            <div className="w-5 h-5 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading system logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-xs text-zinc-400">
            No system logs match the current filters.
          </div>
        ) : (
          <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
            {logs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const date = new Date(log.created_at);
              const formattedDate = date.toLocaleString();

              const levelColors: Record<string, string> = {
                error: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 border-red-200 dark:border-red-900/50',
                warn: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200 dark:border-amber-900/50',
                info: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border-blue-200 dark:border-blue-900/50',
                debug: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400 border-purple-200 dark:border-purple-900/50',
              };

              return (
                <div key={log.id} className="transition-colors hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20">
                  <div
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="p-3.5 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                      {/* Level Badge */}
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border shrink-0 ${
                          levelColors[log.level] || 'bg-zinc-100 text-zinc-700 border-zinc-200'
                        }`}
                      >
                        {log.level}
                      </span>

                      {/* Source */}
                      <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/60 px-1.5 py-0.5 rounded text-mono shrink-0">
                        {log.source}
                      </span>

                      {/* Method + Path */}
                      {log.path && (
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono truncate shrink-0 max-w-[180px]">
                          {log.method} {log.path}
                        </span>
                      )}

                      {/* Status code */}
                      {log.status_code && (
                        <span
                          className={`text-[11px] font-mono font-medium shrink-0 ${
                            log.status_code >= 500
                              ? 'text-red-500'
                              : log.status_code >= 400
                              ? 'text-amber-500'
                              : 'text-emerald-500'
                          }`}
                        >
                          {log.status_code}
                        </span>
                      )}

                      {/* Message / Error */}
                      <span className="text-xs text-zinc-900 dark:text-zinc-100 font-medium truncate">
                        {log.message}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-zinc-400 text-[11px]">
                      <span>{formattedDate}</span>
                      <svg
                        className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded Detail View */}
                  {isExpanded && (
                    <div className="px-3.5 pb-4 pt-1 bg-zinc-50/70 dark:bg-zinc-950/40 border-t border-zinc-100 dark:border-zinc-800/50 space-y-3">
                      {/* Meta badges */}
                      <div className="flex flex-wrap gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {log.error_name && (
                          <div className="px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded">
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Error:</span> {log.error_name}
                          </div>
                        )}
                        {log.request_id && (
                          <div className="px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded font-mono">
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300 font-sans">Request ID:</span> {log.request_id}
                          </div>
                        )}
                        {typeof log.context?.durationMs === 'number' && (
                          <div className="px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded font-mono">
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300 font-sans">Latency:</span> {log.context.durationMs}ms
                          </div>
                        )}
                        {Boolean(log.context?.query && Object.keys(log.context.query as object).length > 0) && (
                          <div className="px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded font-mono truncate max-w-xs">
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300 font-sans">Query:</span> {JSON.stringify(log.context?.query)}
                          </div>
                        )}
                        {log.user_id && (
                          <div className="px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded font-mono">
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300 font-sans">User ID:</span> {log.user_id}
                          </div>
                        )}
                        {log.ip && (
                          <div className="px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded font-mono">
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300 font-sans">IP:</span> {log.ip}
                          </div>
                        )}
                        {log.github_issue_url && (
                          <a
                            href={log.github_issue_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded font-semibold text-[11px] hover:opacity-90 transition-opacity shadow-2xs"
                          >
                            <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                            </svg>
                            GitHub Issue
                          </a>
                        )}
                      </div>

                      {/* Stack trace */}
                      {log.stack_trace && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">Stack Trace</span>
                            <button
                              onClick={() => copyToClipboard(log.stack_trace || '', `stack-${log.id}`)}
                              className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                            >
                              {copiedId === `stack-${log.id}` ? '✓ Copied' : 'Copy'}
                            </button>
                          </div>
                          <pre className="p-3 text-[11px] font-mono rounded-lg bg-zinc-900 text-zinc-100 overflow-x-auto whitespace-pre leading-relaxed">
                            {log.stack_trace}
                          </pre>
                        </div>
                      )}

                      {/* HTTP Request & Response Payload Display */}
                      {log.context && (log.context.requestBody !== undefined || log.context.responseBody !== undefined) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {log.context.requestBody !== undefined && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                  <span>Request Body</span>
                                </span>
                                <button
                                  onClick={() =>
                                    copyToClipboard(
                                      typeof log.context?.requestBody === 'string'
                                        ? log.context.requestBody
                                        : JSON.stringify(log.context?.requestBody, null, 2),
                                      `req-${log.id}`
                                    )
                                  }
                                  className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                                >
                                  {copiedId === `req-${log.id}` ? '✓ Copied' : 'Copy'}
                                </button>
                              </div>
                              <pre className="p-3 text-[11px] font-mono rounded-lg bg-zinc-900 text-zinc-100 overflow-x-auto whitespace-pre leading-relaxed max-h-64 overflow-y-auto">
                                {typeof log.context.requestBody === 'string'
                                  ? log.context.requestBody
                                  : JSON.stringify(log.context.requestBody, null, 2)}
                              </pre>
                            </div>
                          )}

                          {log.context.responseBody !== undefined && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  <span>Response Body</span>
                                </span>
                                <button
                                  onClick={() =>
                                    copyToClipboard(
                                      typeof log.context?.responseBody === 'string'
                                        ? log.context.responseBody
                                        : JSON.stringify(log.context?.responseBody, null, 2),
                                      `res-${log.id}`
                                    )
                                  }
                                  className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                                >
                                  {copiedId === `res-${log.id}` ? '✓ Copied' : 'Copy'}
                                </button>
                              </div>
                              <pre className="p-3 text-[11px] font-mono rounded-lg bg-zinc-900 text-zinc-100 overflow-x-auto whitespace-pre leading-relaxed max-h-64 overflow-y-auto">
                                {typeof log.context.responseBody === 'string'
                                  ? log.context.responseBody
                                  : JSON.stringify(log.context.responseBody, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Remaining Context JSON */}
                      {(() => {
                        if (!log.context) return null;
                        const otherContext: Record<string, unknown> = {};
                        for (const [k, v] of Object.entries(log.context)) {
                          if (k !== 'requestBody' && k !== 'responseBody') {
                            otherContext[k] = v;
                          }
                        }
                        if (Object.keys(otherContext).length === 0) return null;
                        return (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">Context Data</span>
                              <button
                                onClick={() => copyToClipboard(JSON.stringify(otherContext, null, 2), `context-${log.id}`)}
                                className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                              >
                                {copiedId === `context-${log.id}` ? '✓ Copied' : 'Copy'}
                              </button>
                            </div>
                            <pre className="p-3 text-[11px] font-mono rounded-lg bg-zinc-900 text-zinc-100 overflow-x-auto whitespace-pre leading-relaxed max-h-60 overflow-y-auto">
                              {JSON.stringify(otherContext, null, 2)}
                            </pre>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
            <span>
              Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, totalCount)} of {totalCount} logs
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2 py-1 font-medium text-zinc-700 dark:text-zinc-300">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Clear Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 max-w-sm w-full space-y-4 shadow-lg">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Clear System Logs</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Are you sure you want to permanently delete all recorded system logs? This action cannot be reversed.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowClearModal(false)}
                className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleClearLogs}
                disabled={actionLoading}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? 'Clearing...' : 'Yes, Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
