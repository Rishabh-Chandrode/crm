'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { EmailSchedule, EmailScheduleDetail } from '@/lib/types';

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  sending:   'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
  sent:      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  cancelled: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800',
  failed:    'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
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
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-1 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Scheduled Emails</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">Upcoming automated outreach and dispatch history</p>
        </div>
        <Link
          href="/send"
          className="btn-primary"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Schedule Send
        </Link>
      </div>

      {loading ? (
        <p className="text-zinc-400 text-xs py-12 text-center">Loading queue…</p>
      ) : schedules.length === 0 ? (
        <div className="text-center py-16 card p-8">
          <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-0.5">No scheduled emails</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">You can schedule personalized batches to send automatically</p>
          <Link href="/send" className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:underline">
            Go to Send Emails →
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Upcoming Queue ({pending.length})</h2>
              </div>
              <div className="card divide-y divide-zinc-100 dark:divide-zinc-800/70 overflow-hidden">
                {pending.map((s) => (
                  <ScheduleRow key={s.id} schedule={s} onCancel={handleCancel} cancelling={cancelling} onRetry={handleRetry} retrying={retrying} />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Past Activity ({past.length})</h2>
              <div className="card divide-y divide-zinc-100 dark:divide-zinc-800/70 overflow-hidden">
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
        className="px-4 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-zinc-50/70 dark:hover:bg-zinc-850/60 transition-colors"
        onClick={handleToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${statusStyle}`}>
              {schedule.status}
            </span>
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {schedule.template?.name ?? 'Quick Email / Template'}
            </span>
            {schedule.company?.name && (
              <>
                <span className="text-zinc-400 text-xs">→</span>
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 truncate">
                  {schedule.company.name}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2.5 text-[11px] text-zinc-400 dark:text-zinc-500 flex-wrap">
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
              <span>{schedule.prospect_ids.length} contacts</span>
            )}
            {schedule.error_message && (
              <span className="text-rose-600 dark:text-rose-400 font-medium" title={schedule.error_message}>
                {schedule.error_message.length > 60 ? schedule.error_message.slice(0, 60) + '…' : schedule.error_message}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {schedule.status === 'pending' && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(schedule.id); }}
              disabled={cancelling === schedule.id}
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {cancelling === schedule.id ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
          {(schedule.status === 'failed' || schedule.failed_count > 0) && (
            <button
              onClick={(e) => { e.stopPropagation(); onRetry(schedule.id); }}
              disabled={retrying === schedule.id}
              className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:underline disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {retrying === schedule.id ? 'Retrying…' : 'Retry'}
            </button>
          )}
          <svg
            className={`w-3.5 h-3.5 text-zinc-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20" fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/60 p-4">
          {detailLoading ? (
            <p className="text-xs text-zinc-400">Loading details…</p>
          ) : detail ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left: template + schedule info */}
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">Template</p>
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{detail.template?.name ?? '—'}</p>
                  {detail.template?.subject && (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Subject: {detail.template.subject}</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">Target Company</p>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">{detail.company?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">Scheduled for</p>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300">{new Date(detail.scheduled_for).toLocaleString()}</p>
                </div>
                {detail.sent_at && (
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">Dispatched at</p>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">{new Date(detail.sent_at).toLocaleString()}</p>
                  </div>
                )}
                {Object.keys(detail.custom_values).length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Custom Variables</p>
                    <div className="space-y-1">
                      {Object.entries(detail.custom_values).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-xs">
                          <span className="font-mono text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded text-[11px]">{k}</span>
                          <span className="text-zinc-700 dark:text-zinc-300 font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: prospects list */}
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                  Recipients ({detail.prospects.length})
                </p>
                {detail.prospects.length === 0 ? (
                  <p className="text-xs text-zinc-400">No prospects attached</p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {detail.prospects.map((p) => (
                      <div key={p.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-xs">
                        <div className="w-6 h-6 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center font-bold text-[11px] flex-shrink-0">
                          {p.first_name[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate text-xs">
                            {[p.first_name, p.last_name].filter(Boolean).join(' ')}
                          </p>
                          <p className="text-zinc-400 truncate font-mono text-[10px]">
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
            <p className="text-xs text-zinc-400">Could not load details.</p>
          )}
        </div>
      )}
    </div>
  );
}

