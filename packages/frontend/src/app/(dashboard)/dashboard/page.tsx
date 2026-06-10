'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { prospectFullName } from '@/lib/types';
import type { Company, Prospect, EmailTemplate, EmailSend } from '@/lib/types';

interface Stats {
  companies: number;
  prospects: number;
  templates: number;
  emailsSent: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentSends, setRecentSends] = useState<EmailSend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [companiesRes, prospectsRes, templatesRes, historyRes] = await Promise.all([
          api.companies.list(),
          api.prospects.list(),
          api.templates.list(),
          api.email.history(5),
        ]);
        setStats({
          companies: (companiesRes.data as Company[]).length,
          prospects: (prospectsRes.data as Prospect[]).length,
          templates: (templatesRes.data as EmailTemplate[]).length,
          emailsSent: historyRes.total,
        });
        setRecentSends(historyRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const statusColor: Record<string, string> = {
    sent: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Dashboard</h1>
      <p className="text-slate-500 text-sm mb-8">Overview of your outreach activity</p>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {[
              { label: 'Companies', value: stats?.companies ?? 0, color: 'bg-blue-50 text-blue-600' },
              { label: 'Prospects', value: stats?.prospects ?? 0, color: 'bg-violet-50 text-violet-600' },
              { label: 'Templates', value: stats?.templates ?? 0, color: 'bg-amber-50 text-amber-600' },
              { label: 'Emails Sent', value: stats?.emailsSent ?? 0, color: 'bg-green-50 text-green-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm text-slate-500 mb-1">{label}</p>
                <p className={`text-3xl font-bold ${color.split(' ')[1]}`}>{value}</p>
              </div>
            ))}
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-800 mb-4">Recent Sends</h2>
            {recentSends.length === 0 ? (
              <p className="text-slate-400 text-sm">No emails sent yet.</p>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-4 py-3 text-slate-500 font-medium">Prospect</th>
                      <th className="text-left px-4 py-3 text-slate-500 font-medium">Company</th>
                      <th className="text-left px-4 py-3 text-slate-500 font-medium">Template</th>
                      <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                      <th className="text-left px-4 py-3 text-slate-500 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSends.map((send) => (
                      <tr key={send.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {send.prospect ? prospectFullName(send.prospect) : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{send.company?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{send.template?.name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[send.status] ?? ''}`}>
                            {send.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {new Date(send.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
