'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { EmailSchedule, EmailScheduleDetail } from '@/lib/types';

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  sending:   'bg-blue-50 text-blue-700 border-blue-200',
  sent:      'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
  failed:    'bg-red-50 text-red-700 border-red-200',
};

export default function ScheduledPage() {
  const [schedules, setSchedules] = useState<EmailSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

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

  const pending = schedules.filter((s) => s.status === 'pending');
  const past = schedules.filter((s) => s.status !== 'pending');

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Scheduled Emails</h1>
        <p className="text-slate-500 text-sm mt-1">Upcoming and past scheduled sends</p>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : schedules.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg font-medium mb-1">No scheduled emails</p>
          <p className="text-sm">Schedule a send from the <a href="/send" className="text-indigo-500 hover:underline">Send</a> page</p>
        </div>
      ) : (
        <div className="space-y-8">
          {pending.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Upcoming</h2>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {pending.map((s) => (
                  <ScheduleRow key={s.id} schedule={s} onCancel={handleCancel} cancelling={cancelling} />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">History</h2>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {past.map((s) => (
                  <ScheduleRow key={s.id} schedule={s} onCancel={handleCancel} cancelling={cancelling} />
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
}: {
  schedule: EmailSchedule;
  onCancel: (id: string) => void;
  cancelling: string | null;
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
        // silently ignore; detail stays null
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
        className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={handleToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusStyle}`}>
              {schedule.status}
            </span>
            <span className="text-sm font-medium text-slate-800 truncate">
              {schedule.template?.name ?? 'Unknown template'}
            </span>
            <span className="text-slate-400 text-sm">→</span>
            <span className="text-sm text-slate-600 truncate">
              {schedule.company?.name ?? 'Unknown company'}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>
              {schedule.status === 'pending'
                ? isPast ? 'Sending soon…' : `Sends ${scheduledDate.toLocaleString()}`
                : schedule.status === 'sent' || schedule.status === 'failed'
                ? `Attempted ${schedule.sent_at ? new Date(schedule.sent_at).toLocaleString() : scheduledDate.toLocaleString()}`
                : scheduledDate.toLocaleString()}
            </span>
            {(schedule.status === 'sent' || schedule.status === 'failed') && schedule.total_prospects > 0 && (
              <span>{schedule.sent_count} sent · {schedule.failed_count} failed · {schedule.total_prospects} total</span>
            )}
            {schedule.prospect_ids.length > 0 && (
              <span>{schedule.prospect_ids.length} selected prospects</span>
            )}
            {schedule.prospect_ids.length === 0 && schedule.total_prospects > 0 && (
              <span>All {schedule.total_prospects} prospects</span>
            )}
            {schedule.error_message && (
              <span className="text-red-500" title={schedule.error_message}>
                {schedule.error_message.length > 80 ? schedule.error_message.slice(0, 80) + '…' : schedule.error_message}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {schedule.status === 'pending' && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(schedule.id); }}
              disabled={cancelling === schedule.id}
              className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {cancelling === schedule.id ? 'Cancelling…' : 'Cancel'}
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
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
          {detailLoading ? (
            <p className="text-xs text-slate-400">Loading details…</p>
          ) : detail ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: template + schedule info */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Template</p>
                  <p className="text-sm font-medium text-slate-800">{detail.template?.name ?? '—'}</p>
                  {detail.template?.subject && (
                    <p className="text-xs text-slate-500 mt-0.5">Subject: {detail.template.subject}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Company</p>
                  <p className="text-sm text-slate-700">{detail.company?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Scheduled for</p>
                  <p className="text-sm text-slate-700">{new Date(detail.scheduled_for).toLocaleString()}</p>
                </div>
                {detail.sent_at && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Sent at</p>
                    <p className="text-sm text-slate-700">{new Date(detail.sent_at).toLocaleString()}</p>
                  </div>
                )}
                {Object.keys(detail.custom_values).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Custom values</p>
                    <div className="space-y-1">
                      {Object.entries(detail.custom_values).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-xs">
                          <span className="font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{k}</span>
                          <span className="text-slate-700">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: prospects list */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Prospects ({detail.prospects.length})
                </p>
                {detail.prospects.length === 0 ? (
                  <p className="text-xs text-slate-400">No prospects found</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {detail.prospects.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-sm">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {p.first_name[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">
                            {[p.first_name, p.last_name].filter(Boolean).join(' ')}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
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
