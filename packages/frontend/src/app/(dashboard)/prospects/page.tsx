'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { prospectFullName } from '@/lib/types';
import type { Prospect, Company } from '@/lib/types';
import ImportModal from '@/components/ImportModal';
import Combobox from '@/components/Combobox';

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
  engineer: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20',
  hr: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20',
  other: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700',
};

type SortCol = 'first_name' | 'last_name' | 'email' | 'job_title' | 'company_name' | 'created_at';

const PAGE_SIZE = 25;

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) {
    return (
      <svg className="w-3 h-3 text-zinc-300 dark:text-zinc-600 inline ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  return dir === 'asc' ? (
    <svg className="w-3 h-3 text-zinc-900 dark:text-zinc-100 inline ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  ) : (
    <svg className="w-3 h-3 text-zinc-900 dark:text-zinc-100 inline ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [form, setForm] = useState<ProspectFormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showImport, setShowImport] = useState(false);

  // Filters & sort
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [sortBy, setSortBy] = useState<SortCol>('first_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  async function load() {
    setLoading(true);
    const [pRes, cRes] = await Promise.all([
      api.prospects.list({
        companyId: filterCompany || undefined,
        roleCategory: filterCategory || undefined,
        search: debouncedSearch || undefined,
        sortBy,
        sortDir,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
      api.companies.list(),
    ]);
    setProspects(pRes.data as Prospect[]);
    setTotal(pRes.total ?? 0);
    setCompanies(cRes.data as Company[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [filterCompany, filterCategory, debouncedSearch, sortBy, sortDir, page]);

  function handleSort(col: SortCol) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
    setPage(0);
  }

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

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function ThCol({
    col,
    label,
  }: {
    col: SortCol;
    label: string;
  }) {
    return (
      <th
        className="text-left px-4 py-3 text-zinc-500 dark:text-zinc-400 font-semibold text-[11px] uppercase tracking-wider cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap"
        onClick={() => handleSort(col)}
      >
        {label}
        <SortIcon active={sortBy === col} dir={sortDir} />
      </th>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-1 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Prospects</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">HR contacts, recruiters, and hiring managers</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowImport(true)}
            className="btn-secondary"
          >
            <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import CSV
          </button>
          <button
            onClick={openCreate}
            className="btn-primary"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Prospect
          </button>
        </div>
      </div>

      {/* Filters toolbar */}
      <div className="flex flex-wrap items-center gap-2 card p-2.5">
        <div className="relative min-w-[200px] flex-1 sm:flex-initial">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, title…"
            className="form-input pl-8 py-1.5 text-xs"
          />
        </div>
        <div className="w-44">
          <Combobox
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            value={filterCompany}
            onChange={(v) => { setFilterCompany(v); setPage(0); }}
            placeholder="All companies"
            clearLabel="All companies"
          />
        </div>
        <div className="w-44">
          <Combobox
            options={[
              { value: 'engineer', label: 'Engineer' },
              { value: 'hr', label: 'HR / Recruiter' },
              { value: 'other', label: 'Other' },
            ]}
            value={filterCategory}
            onChange={(v) => { setFilterCategory(v); setPage(0); }}
            placeholder="All categories"
            clearLabel="All categories"
          />
        </div>
        {(search || filterCompany || filterCategory) && (
          <button
            onClick={() => { setSearch(''); setFilterCompany(''); setFilterCategory(''); setPage(0); }}
            className="btn-ghost text-xs py-1"
          >
            Reset
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-zinc-400 text-xs py-8 text-center">Loading prospects…</p>
      ) : prospects.length === 0 ? (
        <div className="text-center py-16 card p-8">
          <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-0.5">No prospects found</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {search || filterCompany || filterCategory
              ? 'Try adjusting your filters'
              : 'Add your first prospect manually or import from CSV'}
          </p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[680px]">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                    <ThCol col="first_name" label="Name" />
                    <ThCol col="email" label="Email" />
                    <ThCol col="job_title" label="Title" />
                    <th className="text-left px-4 py-3 text-zinc-500 dark:text-zinc-400 font-semibold text-[11px] uppercase tracking-wider">Category</th>
                    <ThCol col="company_name" label="Company" />
                    <th className="px-4 py-3 text-right text-zinc-500 dark:text-zinc-400 font-semibold text-[11px] uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                  {prospects.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-850/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                        <span>{prospectFullName(p)}</span>
                        {p.phone && <div className="text-zinc-400 text-[11px] font-normal mt-0.5">{p.phone}</div>}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 font-mono text-[11px]">{p.email}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{p.job_title ?? '—'}</td>
                      <td className="px-4 py-3">
                        {p.role_category ? (
                          <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded ${CATEGORY_STYLES[p.role_category] ?? 'bg-zinc-100 text-zinc-500'}`}>
                            {CATEGORY_LABELS[p.role_category] ?? p.role_category}
                          </span>
                        ) : (
                          <span className="text-zinc-300 dark:text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 font-medium">{p.company_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 justify-end font-medium">
                          {p.linkedin_url && (
                            <a
                              href={p.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                            >
                              LinkedIn
                            </a>
                          )}
                          <button
                            onClick={() => openEdit(p)}
                            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void handleDelete(p.id)}
                            className="text-zinc-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 transition-colors"
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
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              {total === 0
                ? 'No results'
                : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total} prospects`}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(0)}
                disabled={page === 0}
                className="btn-ghost px-2 py-1 text-xs"
                title="First page"
              >
                «
              </button>
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
                className="btn-ghost px-2.5 py-1 text-xs"
              >
                ‹ Prev
              </button>
              <span className="px-2.5 py-1 font-semibold text-zinc-900 dark:text-zinc-100">
                {page + 1} / {totalPages || 1}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages - 1}
                className="btn-ghost px-2.5 py-1 text-xs"
              >
                Next ›
              </button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={page >= totalPages - 1}
                className="btn-ghost px-2 py-1 text-xs"
                title="Last page"
              >
                »
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add / Edit Prospect modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              {editing ? 'Edit Prospect' : 'Add Prospect'}
            </h2>
            <div className="space-y-3.5">
              <div>
                <label className="form-label">Company</label>
                <Combobox
                  options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  value={form.company_id}
                  onChange={(v) => f('company_id', v)}
                  placeholder="Select company"
                  clearLabel="No company"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">First Name *</label>
                  <input
                    className="form-input text-xs"
                    value={form.first_name}
                    onChange={(e) => f('first_name', e.target.value)}
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label className="form-label">Last Name</label>
                  <input
                    className="form-input text-xs"
                    value={form.last_name}
                    onChange={(e) => f('last_name', e.target.value)}
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Email *</label>
                  <input
                    type="email"
                    className="form-input font-mono text-xs"
                    value={form.email}
                    onChange={(e) => f('email', e.target.value)}
                    placeholder="jane@company.com"
                  />
                </div>
                <div>
                  <label className="form-label">Job Title</label>
                  <input
                    className="form-input text-xs"
                    value={form.job_title}
                    onChange={(e) => f('job_title', e.target.value)}
                    placeholder="Engineering Lead"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Role Category <span className="text-zinc-400 font-normal">(auto-detected)</span></label>
                <select
                  className="form-select text-xs"
                  value={form.role_category}
                  onChange={(e) => f('role_category', e.target.value)}
                >
                  <option value="">— not set —</option>
                  <option value="engineer">Engineer</option>
                  <option value="hr">HR / Recruiter</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Phone</label>
                  <input
                    className="form-input text-xs"
                    value={form.phone}
                    onChange={(e) => f('phone', e.target.value)}
                    placeholder="+1 555 000 0000"
                  />
                </div>
                <div>
                  <label className="form-label">LinkedIn URL</label>
                  <input
                    className="form-input text-xs"
                    value={form.linkedin_url}
                    onChange={(e) => f('linkedin_url', e.target.value)}
                    placeholder="https://linkedin.com/in/…"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Notes</label>
                <textarea
                  className="form-textarea text-xs"
                  value={form.notes}
                  onChange={(e) => f('notes', e.target.value)}
                  placeholder="Outreach notes, mutual connections, etc…"
                />
              </div>
            </div>

            {error && <p className="text-rose-600 dark:text-rose-400 text-xs mt-3">{error}</p>}

            <div className="flex justify-end gap-2.5 mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => setShowForm(false)}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? 'Saving…' : editing ? 'Update Prospect' : 'Create Prospect'}
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

