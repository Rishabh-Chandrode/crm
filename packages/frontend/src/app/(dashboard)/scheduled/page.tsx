'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { EmailSchedule } from '@/lib/types';

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
  const scheduledDate = new Date(schedule.scheduled_for);
  const isPast = scheduledDate < new Date();
  const statusStyle = STATUS_STYLES[schedule.status] ?? STATUS_STYLES['pending'];

  return (
    <div className="px-5 py-4 flex items-center gap-4">
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
              : schedule.status === 'sent'
              ? `Sent ${schedule.sent_at ? new Date(schedule.sent_at).toLocaleString() : ''}`
              : scheduledDate.toLocaleString()}
          </span>
          {schedule.status === 'sent' && (
            <span>{schedule.sent_count} sent · {schedule.failed_count} failed · {schedule.total_prospects} total</span>
          )}
          {schedule.prospect_ids.length > 0 && (
            <span>{schedule.prospect_ids.length} selected prospects</span>
          )}
          {schedule.prospect_ids.length === 0 && schedule.total_prospects > 0 && (
            <span>All {schedule.total_prospects} prospects</span>
          )}
          {schedule.error_message && (
            <span className="text-red-500">{schedule.error_message}</span>
          )}
        </div>
      </div>

      {schedule.status === 'pending' && (
        <button
          onClick={() => onCancel(schedule.id)}
          disabled={cancelling === schedule.id}
          className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {cancelling === schedule.id ? 'Cancelling…' : 'Cancel'}
        </button>
      )}
    </div>
  );
}
