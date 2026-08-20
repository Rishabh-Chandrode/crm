'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Company } from '@/lib/types';
import Combobox from '@/components/Combobox';

interface CompanyFormData {
  name: string;
  website: string;
  industry: string;
}

const EMPTY: CompanyFormData = { name: '', website: '', industry: '' };

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<CompanyFormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Merge state
  const [mergeSource, setMergeSource] = useState<Company | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState('');

  async function load() {
    const res = await api.companies.list();
    setCompanies(res.data as Company[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError('');
    setShowForm(true);
  }

  function openEdit(c: Company) {
    setEditing(c);
    setForm({ name: c.name, website: c.website ?? '', industry: c.industry ?? '' });
    setError('');
    setShowForm(true);
  }

  function openMerge(c: Company) {
    setMergeSource(c);
    setMergeTargetId('');
    setMergeError('');
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        website: form.website.trim() || null,
        industry: form.industry.trim() || null,
      };
      if (editing) {
        await api.companies.update(editing.id, payload);
      } else {
        await api.companies.create(payload);
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
    if (!confirm('Delete this company? All prospects will be unlinked.')) return;
    await api.companies.delete(id);
    void load();
  }

  async function handleMerge() {
    if (!mergeSource || !mergeTargetId) return;
    setMergeError('');
    setMerging(true);
    try {
      await api.companies.merge(mergeTargetId, mergeSource.id);
      setMergeSource(null);
      void load();
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setMerging(false);
    }
  }

  const filtered = companies.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.industry && c.industry.toLowerCase().includes(q));
  });

  const mergeTarget = companies.find((c) => c.id === mergeTargetId);
  const sourceProspectCount = (mergeSource as (Company & { prospect_count?: number }) | null)?.prospect_count ?? 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-1 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Companies</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">Target companies for your job outreach</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies…"
              className="form-input pl-8 py-1.5 text-xs w-48 sm:w-60"
            />
          </div>
          <button
            onClick={openCreate}
            className="btn-primary"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Company
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-zinc-400 text-xs py-8 text-center">Loading companies…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 card p-8">
          <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-0.5">
            {search ? 'No matching companies' : 'No companies yet'}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {search ? 'Try adjusting your search filter' : 'Add your first target company to organize prospects'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                  <th className="text-left px-4 py-3 text-zinc-500 dark:text-zinc-400 font-semibold text-[11px] uppercase tracking-wider">Company</th>
                  <th className="text-left px-4 py-3 text-zinc-500 dark:text-zinc-400 font-semibold text-[11px] uppercase tracking-wider">Industry</th>
                  <th className="text-left px-4 py-3 text-zinc-500 dark:text-zinc-400 font-semibold text-[11px] uppercase tracking-wider">Website</th>
                  <th className="text-left px-4 py-3 text-zinc-500 dark:text-zinc-400 font-semibold text-[11px] uppercase tracking-wider">Prospects</th>
                  <th className="px-4 py-3 text-right text-zinc-500 dark:text-zinc-400 font-semibold text-[11px] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-850/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 flex items-center justify-center font-bold text-[11px] text-zinc-700 dark:text-zinc-300 uppercase">
                          {c.name.slice(0, 2)}
                        </div>
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {c.industry ? (
                        <span className="inline-flex px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-[11px]">
                          {c.industry}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {c.website ? (
                        <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 hover:underline truncate max-w-[180px] inline-block font-medium">
                          {c.website.replace(/^https?:\/\//, '')}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                        {(c as Company & { prospect_count?: number }).prospect_count ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 justify-end font-medium">
                        <button onClick={() => openEdit(c)} className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors">Edit</button>
                        <button onClick={() => openMerge(c)} className="text-zinc-600 hover:text-amber-600 dark:text-zinc-400 dark:hover:text-amber-400 transition-colors">Merge</button>
                        <button onClick={() => void handleDelete(c.id)} className="text-zinc-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit / Create modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md p-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">{editing ? 'Edit Company' : 'Add Company'}</h2>
            <div className="space-y-3.5">
              <div>
                <label className="form-label">Company Name *</label>
                <input className="form-input text-xs" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp" />
              </div>
              <div>
                <label className="form-label">Industry</label>
                <input className="form-input text-xs" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Software, Finance, Healthcare…" />
              </div>
              <div>
                <label className="form-label">Website</label>
                <input className="form-input text-xs" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://acme.com" />
              </div>
            </div>
            {error && <p className="text-rose-600 dark:text-rose-400 text-xs mt-3">{error}</p>}
            <div className="flex justify-end gap-2.5 mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button onClick={() => setShowForm(false)} className="btn-ghost">Cancel</button>
              <button onClick={() => void handleSave()} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : editing ? 'Update Company' : 'Create Company'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge modal */}
      {mergeSource && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md p-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Merge Company</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              All prospects and email history from <span className="font-semibold text-zinc-800 dark:text-zinc-200">{mergeSource.name}</span> will be transferred into the target company, then <span className="font-semibold text-zinc-800 dark:text-zinc-200">{mergeSource.name}</span> will be deleted.
            </p>

            <div className="space-y-3.5">
              <div>
                <label className="form-label">Merge <span className="font-semibold text-zinc-800 dark:text-zinc-200">{mergeSource.name}</span> into…</label>
                <Combobox
                  options={companies
                    .filter((c) => c.id !== mergeSource.id)
                    .map((c) => ({ value: c.id, label: c.name }))}
                  value={mergeTargetId}
                  onChange={setMergeTargetId}
                  placeholder="Choose target company…"
                  clearLabel="— no target —"
                />
              </div>

              {mergeTarget && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-900 dark:text-amber-200">
                  <p className="font-semibold mb-1">This operation will:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-800 dark:text-amber-300 text-[11px]">
                    {sourceProspectCount > 0 && (
                      <li>Move {sourceProspectCount} prospect{sourceProspectCount !== 1 ? 's' : ''} to <span className="font-semibold">{mergeTarget.name}</span></li>
                    )}
                    <li>Reassign all email outreach and schedules</li>
                    <li>Permanently remove <span className="font-semibold">{mergeSource.name}</span></li>
                  </ul>
                </div>
              )}
            </div>

            {mergeError && <p className="text-rose-600 dark:text-rose-400 text-xs mt-3">{mergeError}</p>}

            <div className="flex justify-end gap-2.5 mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button onClick={() => setMergeSource(null)} className="btn-ghost">Cancel</button>
              <button
                onClick={() => void handleMerge()}
                disabled={!mergeTargetId || merging}
                className="btn-destructive"
              >
                {merging ? 'Merging…' : 'Merge & Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

