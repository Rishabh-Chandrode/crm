'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { prospectFullName } from '@/lib/types';
import type { Prospect, Company, EmailSend } from '@/lib/types';

interface ProspectFormData {
  company_id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string;
  role_category: string;
  phone: string;
  linkedin_url: string;
  notes: string;
}

const HR_RE =
  /\b(hr|human\s+resource|recruit|talent(\s+(acquisition|partner|lead|manager|sourcer|ops))?|people\s+(ops|operations|partner)|staffing|headhunter)\b/i;
const ENGINEER_RE =
  /\b(sde|swe|software|developer|programmer|engineer|architect|backend|front[\s-]?end|full[\s-]?stack|devops|sre|platform|infrastructure|ios|android|mobile|data\s+scientist|data\s+engineer|machine\s+learning|ml\s+engineer|ai\s+engineer|tech\s+lead|technical\s+lead|engineering\s+manager|cto|vp\s+(of\s+)?engineering)\b/i;

function inferCategory(title: string): string {
  if (!title.trim()) return '';
  if (HR_RE.test(title)) return 'hr';
  if (ENGINEER_RE.test(title)) return 'engineer';
  return 'other';
}

const CATEGORY_LABELS: Record<string, string> = { engineer: 'Engineer', hr: 'HR', other: 'Other' };
const CATEGORY_STYLES: Record<string, string> = {
  engineer: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60',
  hr: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60',
  other: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700',
};

const STATUS_STYLES: Record<string, string> = {
  sent: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
  failed: 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60',
  pending: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
};

function formatDate(s: string) {
  return new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ProspectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [prospect, setProspect] = useState<Prospect & { company?: Company } | null>(null);
  const [emails, setEmails] = useState<EmailSend[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailsLoading, setEmailsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState<ProspectFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void load();
  }, [id]);

  async function load() {
    setLoading(true);
    setEmailsLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        api.prospects.get(id),
        api.companies.list(),
      ]);
      setProspect(pRes.data as Prospect & { company?: Company });
      setCompanies(cRes.data as Company[]);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }

    try {
      const eRes = await api.email.history(50, 0, { prospect_id: id });
      setEmails(eRes.data);
    } finally {
      setEmailsLoading(false);
    }
  }

  function openEdit() {
    if (!prospect) return;
    setForm({
      company_id: prospect.company_id ?? '',
      first_name: prospect.first_name,
      last_name: prospect.last_name ?? '',
      email: prospect.email,
      job_title: prospect.job_title ?? '',
      role_category: prospect.role_category ?? '',
      phone: prospect.phone ?? '',
      linkedin_url: prospect.linkedin_url ?? '',
      notes: prospect.notes ?? '',
    });
    setError('');
    setShowEdit(true);
  }

  async function handleSave() {
    if (!form || !prospect) return;
    setError('');
    setSaving(true);
    try {
      await api.prospects.update(prospect.id, {
        company_id: form.company_id || null,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim() || null,
        email: form.email.trim(),
        job_title: form.job_title.trim() || null,
        role_category: form.role_category || null,
        phone: form.phone.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
        notes: form.notes.trim() || null,
      });
      setShowEdit(false);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!prospect || !confirm(`Delete ${prospectFullName(prospect)}?`)) return;
    await api.prospects.delete(prospect.id);
    router.push('/prospects');
  }

  const f = (key: keyof ProspectFormData, value: string) =>
    setForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      if (key === 'job_title') next.role_category = inferCategory(value);
      return next;
    });

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4 max-w-3xl">
          <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-48" />
          <div className="h-40 bg-slate-100 dark:bg-slate-900 rounded-3xl" />
        </div>
      </div>
    );
  }

  if (notFound || !prospect) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500 dark:text-slate-400 mb-4">Prospect not found.</p>
        <Link href="/prospects" className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm font-semibold">← Back to Prospects</Link>
      </div>
    );
  }

  const fullName = prospectFullName(prospect);
  const initials = [prospect.first_name[0], prospect.last_name?.[0]].filter(Boolean).join('').toUpperCase();
  const companyName = (prospect.company as Company | null | undefined)?.name ?? prospect.company_name ?? null;

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      {/* Back link */}
      <Link href="/prospects" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 mb-6 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Prospects
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center text-white text-lg font-bold shadow-md shadow-indigo-500/20 flex-shrink-0">
            {initials || '?'}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{fullName}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {prospect.job_title && <span className="text-slate-600 dark:text-slate-300 text-xs font-medium">{prospect.job_title}</span>}
              {companyName && (
                <>
                  {prospect.job_title && <span className="text-slate-300 dark:text-slate-700">·</span>}
                  <span className="text-slate-600 dark:text-slate-300 text-xs font-medium">{companyName}</span>
                </>
              )}
              {prospect.role_category && (
                <span className={`inline-flex text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${CATEGORY_STYLES[prospect.role_category] ?? 'bg-slate-100 text-slate-500'}`}>
                  {CATEGORY_LABELS[prospect.role_category] ?? prospect.role_category}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={openEdit}
            className="border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors shadow-xs"
          >
            Edit
          </button>
          <button
            onClick={() => void handleDelete()}
            className="border border-slate-200 dark:border-slate-800 hover:border-red-500/50 text-slate-400 hover:text-red-500 text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors shadow-xs"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 shadow-xs mb-8 overflow-hidden">
        {[
          { label: 'Email', value: prospect.email, href: `mailto:${prospect.email}` },
          { label: 'Phone', value: prospect.phone },
          { label: 'LinkedIn', value: prospect.linkedin_url, href: prospect.linkedin_url ?? undefined },
          { label: 'Company', value: companyName },
        ].map(({ label, value, href }) =>
          value ? (
            <div key={label} className="flex items-center gap-4 px-6 py-3.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider w-24 flex-shrink-0">{label}</span>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline truncate">
                  {value}
                </a>
              ) : (
                <span className="text-xs text-slate-700 dark:text-slate-300 truncate font-medium">{value}</span>
              )}
            </div>
          ) : null
        )}
        {prospect.notes && (
          <div className="px-6 py-4">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Notes</span>
            <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{prospect.notes}</p>
          </div>
        )}
      </div>

      {/* Email history */}
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Outreach &amp; Email History</h2>
      {emailsLoading ? (
        <p className="text-xs text-slate-400">Loading history…</p>
      ) : emails.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 px-6 py-8 text-center text-slate-400 text-xs shadow-xs">
          No emails dispatched to this prospect yet.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 shadow-xs overflow-hidden">
          {emails.map((e) => (
            <div key={e.id} className="px-6 py-4 flex items-start gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/60 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{e.subject ?? '(no subject)'}</div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                  {e.template?.name && <span className="font-semibold text-slate-600 dark:text-slate-300">{e.template.name}</span>}
                  <span>·</span>
                  <span>{formatDate(e.created_at)}</span>
                  {e.open_count > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{e.open_count} open{e.open_count > 1 ? 's' : ''}</span>
                    </>
                  )}
                </div>
              </div>
              <span className={`inline-flex text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 border ${STATUS_STYLES[e.status] ?? 'bg-slate-100 text-slate-500'}`}>
                {e.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {showEdit && form && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-5">Edit Prospect</h2>
            <div className="space-y-4">
              <div>
                <label className="form-label text-xs">Company</label>
                <select className="form-select text-xs" value={form.company_id} onChange={(e) => f('company_id', e.target.value)}>
                  <option value="">No company</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label text-xs">First Name *</label>
                  <input className="form-input text-xs" value={form.first_name} onChange={(e) => f('first_name', e.target.value)} />
                </div>
                <div>
                  <label className="form-label text-xs">Last Name</label>
                  <input className="form-input text-xs" value={form.last_name} onChange={(e) => f('last_name', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label text-xs">Email *</label>
                  <input type="email" className="form-input text-xs font-mono" value={form.email} onChange={(e) => f('email', e.target.value)} />
                </div>
                <div>
                  <label className="form-label text-xs">Job Title</label>
                  <input className="form-input text-xs" value={form.job_title} onChange={(e) => f('job_title', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="form-label text-xs">Role Category</label>
                <select className="form-select text-xs" value={form.role_category} onChange={(e) => f('role_category', e.target.value)}>
                  <option value="">— not set —</option>
                  <option value="engineer">Engineer</option>
                  <option value="hr">HR / Recruiter</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label text-xs">Phone</label>
                  <input className="form-input text-xs" value={form.phone} onChange={(e) => f('phone', e.target.value)} />
                </div>
                <div>
                  <label className="form-label text-xs">LinkedIn URL</label>
                  <input className="form-input text-xs" value={form.linkedin_url} onChange={(e) => f('linkedin_url', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="form-label text-xs">Notes</label>
                <textarea className="form-textarea text-xs" value={form.notes} onChange={(e) => f('notes', e.target.value)} />
              </div>
            </div>
            {error && <p className="text-red-500 text-xs mt-3">{error}</p>}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowEdit(false)} className="text-slate-600 dark:text-slate-400 text-xs font-semibold px-4 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancel</button>
              <button onClick={() => void handleSave()} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-xs">
                {saving ? 'Saving…' : 'Update Prospect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
