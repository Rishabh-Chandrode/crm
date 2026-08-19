'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { EmailSchedule, EmailScheduleDetail } from '@/lib/types';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
  sending: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60',
  sent: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
  cancelled: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  failed: 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60',
};

export default function ScheduledPage() {
  const [schedules, setSchedules] = useState<EmailSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  async function load() {
    const res = await api.schedules.list();
    setSchedules(res.data);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function handleCancel(id: string) {
    if (!confirm('Cancel this scheduled send?')) return;
    setCancelling(id);
    try {
      await api.schedules.cancel(id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setCancelling(null);
    }
  }

  async function handleRetry(id: string) {
    if (!confirm('Retry this failed schedule? It will be processed again.')) return;
    setRetrying(id);
    try {
      await api.schedules.retry(id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to retry');
    } finally {
      setRetrying(null);
    }
  }

  const pending = schedules.filter((s) => s.status === 'pending');
  const past = schedules.filter((s) => s.status !== 'pending');

  return (
    <div className="p-4 md:p-8 max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Scheduled Emails</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Upcoming automated outreach and dispatch history</p>
        </div>
        <Link
          href="/send"
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-xs shadow-indigo-500/20"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Schedule Send
        </Link>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading queue…</p>
      ) : schedules.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-8 shadow-xs">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">No scheduled emails</p>
          <p className="text-xs text-slate-400 mb-4">You can schedule personalized batches to send automatically</p>
          <Link href="/send" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
            Go to Send Emails →
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {pending.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Upcoming Queue ({pending.length})</h2>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 shadow-xs overflow-hidden">
                {pending.map((s) => (
                  <ScheduleRow key={s.id} schedule={s} onCancel={handleCancel} cancelling={cancelling} onRetry={handleRetry} retrying={retrying} />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Past Activity ({past.length})</h2>
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 shadow-xs overflow-hidden">
                {past.map((s) => (
                  <ScheduleRow key={s.id} schedule={s} onCancel={handleCancel} cancelling={cancelling} onRetry={handleRetry} retrying={retrying} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ScheduleRow({
  schedule,
  onCancel,
  cancelling,
  onRetry,
  retrying,
}: {
  schedule: EmailSchedule;
  onCancel: (id: string) => void;
  cancelling: string | null;
  onRetry: (id: string) => void;
  retrying: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<EmailScheduleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const scheduledDate = new Date(schedule.scheduled_for);
  const isPast = scheduledDate < new Date();
  const statusStyle = STATUS_STYLES[schedule.status] ?? STATUS_STYLES['pending'];

  async function handleToggle() {
    if (!expanded && !detail) {
      setDetailLoading(true);
      try {
        const res = await api.schedules.get(schedule.id);
        setDetail(res.data);
      } catch {
        // silently ignore
      } finally {
        setDetailLoading(false);
      }
    }
    setExpanded((v) => !v);
  }

  return (
    <div>
      {/* Summary row — always visible */}
      <div
        className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors"
        onClick={handleToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusStyle}`}>
              {schedule.status}
            </span>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
              {schedule.template?.name ?? 'Quick Email / Template'}
            </span>
            {schedule.company?.name && (
              <>
                <span className="text-slate-400 text-xs">→</span>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate">
                  {schedule.company.name}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 flex-wrap">
            <span>
              {schedule.status === 'pending'
                ? isPast ? 'Processing send…' : `Sends ${scheduledDate.toLocaleString()}`
                : schedule.status === 'sent' || schedule.status === 'failed'
                  ? `Attempted ${schedule.sent_at ? new Date(schedule.sent_at).toLocaleString() : scheduledDate.toLocaleString()}`
                  : scheduledDate.toLocaleString()}
            </span>
            {(schedule.status === 'sent' || schedule.status === 'failed') && schedule.total_prospects > 0 && (
              <span>{schedule.sent_count} sent · {schedule.failed_count} failed · {schedule.total_prospects} total</span>
            )}
            {schedule.prospect_ids.length > 0 && (
              <span>{schedule.prospect_ids.length} selected contacts</span>
            )}
            {schedule.error_message && (
              <span className="text-red-500 dark:text-red-400 font-medium" title={schedule.error_message}>
                {schedule.error_message.length > 60 ? schedule.error_message.slice(0, 60) + '…' : schedule.error_message}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {schedule.status === 'pending' && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(schedule.id); }}
              disabled={cancelling === schedule.id}
              className="text-xs font-semibold text-red-500 hover:text-red-700 dark:text-red-400 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {cancelling === schedule.id ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
          {(schedule.status === 'failed' || schedule.failed_count > 0) && (
            <button
              onClick={(e) => { e.stopPropagation(); onRetry(schedule.id); }}
              disabled={retrying === schedule.id}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {retrying === schedule.id ? 'Retrying…' : 'Retry'}
            </button>
          )}
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20" fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 px-5 py-5">
          {detailLoading ? (
            <p className="text-xs text-slate-400">Loading details…</p>
          ) : detail ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: template + schedule info */}
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Template</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{detail.template?.name ?? '—'}</p>
                  {detail.template?.subject && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Subject: {detail.template.subject}</p>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target Company</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">{detail.company?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Scheduled for</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{new Date(detail.scheduled_for).toLocaleString()}</p>
                </div>
                {detail.sent_at && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Dispatched at</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{new Date(detail.sent_at).toLocaleString()}</p>
                  </div>
                )}
                {Object.keys(detail.custom_values).length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Custom Variables</p>
                    <div className="space-y-1">
                      {Object.entries(detail.custom_values).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-xs">
                          <span className="font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/50 dark:border-indigo-900/50 px-2 py-0.5 rounded-md">{k}</span>
                          <span className="text-slate-700 dark:text-slate-300 font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: prospects list */}
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Recipients ({detail.prospects.length})
                </p>
                {detail.prospects.length === 0 ? (
                  <p className="text-xs text-slate-400">No prospects attached</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {detail.prospects.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 text-xs">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold flex-shrink-0">
                          {p.first_name[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {[p.first_name, p.last_name].filter(Boolean).join(' ')}
                          </p>
                          <p className="text-slate-400 truncate font-mono text-[11px]">
                            {p.email}{p.job_title ? ` · ${p.job_title}` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Could not load details.</p>
          )}
        </div>
      )}
    </div>
  );
}
