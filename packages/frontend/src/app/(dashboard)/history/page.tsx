'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { prospectFullName } from '@/lib/types';
import type { EmailSend } from '@/lib/types';

const STATUS_STYLES: Record<string, string> = {
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
};

export default function HistoryPage() {
  const [sends, setSends] = useState<EmailSend[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 25;

  async function load(p: number) {
    setLoading(true);
    try {
      const res = await api.email.history(limit, p * limit);
      setSends(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(page); }, [page]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Send History</h1>
        <p className="text-slate-500 text-sm mt-1">{total} emails sent in total</p>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : sends.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg font-medium mb-1">No emails sent yet</p>
          <p className="text-sm">Go to Send Emails to get started</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Prospect</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Company</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Template</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Subject</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Sent at</th>
                </tr>
              </thead>
              <tbody>
                {sends.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">
                        {s.prospect ? prospectFullName(s.prospect) : '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.company?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{s.template?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{s.subject ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[s.status] ?? ''}`}>
                        {s.status}
                      </span>
                      {s.error_message && (
                        <p className="text-red-500 text-xs mt-0.5 max-w-[200px] truncate" title={s.error_message}>
                          {s.error_message}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {s.sent_at
                        ? new Date(s.sent_at).toLocaleString()
                        : new Date(s.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <p className="text-slate-500">
              Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * limit >= total}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
