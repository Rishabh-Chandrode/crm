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
  engineer: 'bg-blue-100 text-blue-700',
  hr: 'bg-purple-100 text-purple-700',
  other: 'bg-slate-100 text-slate-500',
};

const STATUS_STYLES: Record<string, string> = {
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
};

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
          <div className="h-6 bg-slate-200 rounded w-48" />
          <div className="h-40 bg-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (notFound || !prospect) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500 mb-4">Prospect not found.</p>
        <Link href="/prospects" className="text-indigo-600 hover:underline text-sm">← Back to Prospects</Link>
      </div>
    );
  }

  const fullName = prospectFullName(prospect);
  const initials = [prospect.first_name[0], prospect.last_name?.[0]].filter(Boolean).join('').toUpperCase();
  const companyName = (prospect.company as Company | null | undefined)?.name ?? prospect.company_name ?? null;

  return (
    <div className="p-4 md:p-8 max-w-3xl">

      {/* Back */}
      <Link href="/prospects" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-5 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Prospects
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
          {initials || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">{fullName}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {prospect.job_title && <span className="text-slate-600 text-sm">{prospect.job_title}</span>}
            {companyName && (
              <>
                {prospect.job_title && <span className="text-slate-300">·</span>}
                <span className="text-slate-600 text-sm">{companyName}</span>
              </>
            )}
            {prospect.role_category && (
              <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_STYLES[prospect.role_category] ?? 'bg-slate-100 text-slate-500'}`}>
                {CATEGORY_LABELS[prospect.role_category] ?? prospect.role_category}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={openEdit}
            className="border border-slate-300 hover:border-indigo-400 text-slate-600 hover:text-indigo-600 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => void handleDelete()}
            className="border border-slate-300 hover:border-red-400 text-slate-400 hover:text-red-600 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-6">
        {[
          { label: 'Email', value: prospect.email, href: `mailto:${prospect.email}` },
          { label: 'Phone', value: prospect.phone },
          { label: 'LinkedIn', value: prospect.linkedin_url, href: prospect.linkedin_url ?? undefined },
          { label: 'Company', value: companyName },
        ].map(({ label, value, href }) =>
          value ? (
            <div key={label} className="flex items-center gap-4 px-5 py-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide w-20 flex-shrink-0">{label}</span>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:underline truncate">
                  {value}
                </a>
              ) : (
                <span className="text-sm text-slate-700 truncate">{value}</span>
              )}
            </div>
          ) : null
        )}
        {prospect.notes && (
          <div className="px-5 py-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">Notes</span>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{prospect.notes}</p>
          </div>
        )}
      </div>

      {/* Email history */}
      <h2 className="text-base font-semibold text-slate-800 mb-3">Email History</h2>
      {emailsLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : emails.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-8 text-center text-slate-400 text-sm">
          No emails sent to this prospect yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {emails.map((e) => (
            <div key={e.id} className="px-5 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{e.subject ?? '(no subject)'}</div>
                <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                  {e.template?.name && <span>{e.template.name}</span>}
                  <span>·</span>
                  <span>{formatDate(e.created_at)}</span>
                  {e.open_count > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-emerald-600">{e.open_count} open{e.open_count > 1 ? 's' : ''}</span>
                    </>
                  )}
                </div>
              </div>
              <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${STATUS_STYLES[e.status] ?? 'bg-slate-100 text-slate-500'}`}>
                {e.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {showEdit && form && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-5">Edit Prospect</h2>
            <div className="space-y-4">
              <div>
                <label className="form-label">Company</label>
                <select className="form-input" value={form.company_id} onChange={(e) => f('company_id', e.target.value)}>
                  <option value="">No company</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">First Name *</label>
                  <input className="form-input" value={form.first_name} onChange={(e) => f('first_name', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Last Name</label>
                  <input className="form-input" value={form.last_name} onChange={(e) => f('last_name', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Email *</label>
                  <input type="email" className="form-input" value={form.email} onChange={(e) => f('email', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Job Title</label>
                  <input className="form-input" value={form.job_title} onChange={(e) => f('job_title', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="form-label">Role Category</label>
                <select className="form-input" value={form.role_category} onChange={(e) => f('role_category', e.target.value)}>
                  <option value="">— not set —</option>
                  <option value="engineer">Engineer</option>
                  <option value="hr">HR / Recruiter</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={form.phone} onChange={(e) => f('phone', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">LinkedIn URL</label>
                  <input className="form-input" value={form.linkedin_url} onChange={(e) => f('linkedin_url', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" value={form.notes} onChange={(e) => f('notes', e.target.value)} />
              </div>
            </div>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowEdit(false)} className="text-slate-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-100">Cancel</button>
              <button onClick={() => void handleSave()} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg">
                {saving ? 'Saving…' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
