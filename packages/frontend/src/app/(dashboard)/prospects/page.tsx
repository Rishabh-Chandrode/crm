'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { prospectFullName } from '@/lib/types';
import type { Prospect, Company } from '@/lib/types';
import ImportModal from '@/components/ImportModal';

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

const EMPTY: ProspectFormData = {
  company_id: '',
  first_name: '',
  last_name: '',
  email: '',
  job_title: '',
  role_category: '',
  phone: '',
  linkedin_url: '',
  notes: '',
};

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

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [form, setForm] = useState<ProspectFormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [showImport, setShowImport] = useState(false);

  async function load() {
    const [pRes, cRes] = await Promise.all([
      api.prospects.list(filterCompany || undefined),
      api.companies.list(),
    ]);
    setProspects(pRes.data as Prospect[]);
    setCompanies(cRes.data as Company[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [filterCompany]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError('');
    setShowForm(true);
  }

  function openEdit(p: Prospect) {
    setEditing(p);
    setForm({
      company_id: p.company_id ?? '',
      first_name: p.first_name,
      last_name: p.last_name ?? '',
      email: p.email,
      job_title: p.job_title ?? '',
      role_category: p.role_category ?? '',
      phone: p.phone ?? '',
      linkedin_url: p.linkedin_url ?? '',
      notes: p.notes ?? '',
    });
    setError('');
    setShowForm(true);
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      const payload: Partial<Prospect> = {
        company_id: form.company_id || null,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim() || null,
        email: form.email.trim(),
        job_title: form.job_title.trim() || null,
        role_category: form.role_category || null,
        phone: form.phone.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await api.prospects.update(editing.id, payload);
      } else {
        await api.prospects.create(payload);
      }
      setShowForm(false);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this prospect?')) return;
    await api.prospects.delete(id);
    void load();
  }

  const f = (key: keyof ProspectFormData, value: string) =>
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'job_title') next.role_category = inferCategory(value);
      return next;
    });

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Prospects</h1>
          <p className="text-slate-500 text-sm mt-1">HR contacts and hiring managers</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowImport(true)}
            className="border border-slate-300 hover:border-slate-400 text-slate-600 hover:text-slate-800 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import Excel / CSV
          </button>
          <button
            onClick={openCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Add Prospect
          </button>
        </div>
      </div>

      <div className="mb-4">
        <select
          value={filterCompany}
          onChange={(e) => setFilterCompany(e.target.value)}
          className="form-input max-w-xs"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : prospects.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg font-medium mb-1">No prospects found</p>
          <p className="text-sm">Add your first prospect to get started</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Title</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Category</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Company</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {prospects.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <div>{prospectFullName(p)}</div>
                    {p.phone && <div className="text-slate-400 text-xs">{p.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.email}</td>
                  <td className="px-4 py-3 text-slate-600">{p.job_title ?? '—'}</td>
                  <td className="px-4 py-3">
                    {p.role_category ? (
                      <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_STYLES[p.role_category] ?? 'bg-slate-100 text-slate-500'}`}>
                        {CATEGORY_LABELS[p.role_category] ?? p.role_category}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.company_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      {p.linkedin_url && (
                        <a
                          href={p.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-indigo-600 text-xs font-medium transition-colors"
                        >
                          LinkedIn
                        </a>
                      )}
                      <button
                        onClick={() => openEdit(p)}
                        className="text-slate-400 hover:text-indigo-600 text-xs font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDelete(p.id)}
                        className="text-slate-400 hover:text-red-600 text-xs font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-5">
              {editing ? 'Edit Prospect' : 'Add Prospect'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="form-label">Company</label>
                <select
                  className="form-input"
                  value={form.company_id}
                  onChange={(e) => f('company_id', e.target.value)}
                >
                  <option value="">No company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">First Name *</label>
                  <input
                    className="form-input"
                    value={form.first_name}
                    onChange={(e) => f('first_name', e.target.value)}
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label className="form-label">Last Name</label>
                  <input
                    className="form-input"
                    value={form.last_name}
                    onChange={(e) => f('last_name', e.target.value)}
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Email *</label>
                  <input
                    type="email"
                    className="form-input"
                    value={form.email}
                    onChange={(e) => f('email', e.target.value)}
                    placeholder="jane@company.com"
                  />
                </div>
                <div>
                  <label className="form-label">Job Title</label>
                  <input
                    className="form-input"
                    value={form.job_title}
                    onChange={(e) => f('job_title', e.target.value)}
                    placeholder="HR Manager"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Role Category <span className="text-slate-400 font-normal">(auto-detected from title)</span></label>
                <select
                  className="form-input"
                  value={form.role_category}
                  onChange={(e) => f('role_category', e.target.value)}
                >
                  <option value="">— not set —</option>
                  <option value="engineer">Engineer</option>
                  <option value="hr">HR / Recruiter</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Phone</label>
                  <input
                    className="form-input"
                    value={form.phone}
                    onChange={(e) => f('phone', e.target.value)}
                    placeholder="+1 555 000 0000"
                  />
                </div>
                <div>
                  <label className="form-label">LinkedIn URL</label>
                  <input
                    className="form-input"
                    value={form.linkedin_url}
                    onChange={(e) => f('linkedin_url', e.target.value)}
                    placeholder="https://linkedin.com/in/…"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Notes</label>
                <textarea
                  className="form-textarea"
                  value={form.notes}
                  onChange={(e) => f('notes', e.target.value)}
                  placeholder="Any relevant notes…"
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="text-slate-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportModal
          companies={companies}
          onClose={() => setShowImport(false)}
          onDone={() => void load()}
        />
      )}
    </div>
  );
}
