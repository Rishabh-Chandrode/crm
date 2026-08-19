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
    <div className="p-4 md:p-8 max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Companies</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Target companies for your job outreach</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies…"
              className="pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-48 sm:w-64"
            />
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-xs shadow-indigo-500/20"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Company
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading companies…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-8 shadow-xs">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
            {search ? 'No matching companies' : 'No companies yet'}
          </p>
          <p className="text-xs text-slate-400">
            {search ? 'Try adjusting your search filter' : 'Add your first target company to organize prospects'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                  <th className="text-left px-5 py-3 text-slate-400 dark:text-slate-500 font-semibold text-xs uppercase tracking-wider">Company</th>
                  <th className="text-left px-4 py-3 text-slate-400 dark:text-slate-500 font-semibold text-xs uppercase tracking-wider">Industry</th>
                  <th className="text-left px-4 py-3 text-slate-400 dark:text-slate-500 font-semibold text-xs uppercase tracking-wider">Website</th>
                  <th className="text-left px-4 py-3 text-slate-400 dark:text-slate-500 font-semibold text-xs uppercase tracking-wider">Prospects</th>
                  <th className="px-5 py-3 text-right text-slate-400 dark:text-slate-500 font-semibold text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-50 to-violet-100 dark:from-slate-800 dark:to-slate-700 border border-slate-200/60 dark:border-slate-700 flex items-center justify-center font-bold text-xs text-indigo-600 dark:text-indigo-400 uppercase">
                          {c.name.slice(0, 2)}
                        </div>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400 text-xs">
                      {c.industry ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          {c.industry}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400 text-xs">
                      {c.website ? (
                        <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-[180px] inline-block font-medium">
                          {c.website.replace(/^https?:\/\//, '')}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-md">
                        {(c as Company & { prospect_count?: number }).prospect_count ?? 0}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3 justify-end text-xs font-medium">
                        <button onClick={() => openEdit(c)} className="text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors">Edit</button>
                        <button onClick={() => openMerge(c)} className="text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 transition-colors">Merge</button>
                        <button onClick={() => void handleDelete(c.id)} className="text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 transition-colors">Delete</button>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-5">{editing ? 'Edit Company' : 'Add Company'}</h2>
            <div className="space-y-4">
              <div>
                <label className="form-label">Company Name *</label>
                <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp" />
              </div>
              <div>
                <label className="form-label">Industry</label>
                <input className="form-input" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Software, Finance, Healthcare…" />
              </div>
              <div>
                <label className="form-label">Website</label>
                <input className="form-input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://acme.com" />
              </div>
            </div>
            {error && <p className="text-red-500 dark:text-red-400 text-sm mt-3">{error}</p>}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="text-slate-600 dark:text-slate-400 text-sm font-medium px-4 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancel</button>
              <button onClick={() => void handleSave()} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-xs">
                {saving ? 'Saving…' : editing ? 'Update Company' : 'Create Company'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge modal */}
      {mergeSource && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Merge Company</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              All prospects and email history from <span className="font-semibold text-slate-800 dark:text-slate-200">{mergeSource.name}</span> will be transferred into the target company, then <span className="font-semibold text-slate-800 dark:text-slate-200">{mergeSource.name}</span> will be deleted.
            </p>

            <div className="space-y-4">
              <div>
                <label className="form-label">Merge <span className="font-semibold text-slate-800 dark:text-slate-200">{mergeSource.name}</span> into…</label>
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
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-4 text-xs text-amber-800 dark:text-amber-200">
                  <p className="font-bold mb-1">This operation will:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-700 dark:text-amber-300">
                    {sourceProspectCount > 0 && (
                      <li>Move {sourceProspectCount} prospect{sourceProspectCount !== 1 ? 's' : ''} to <span className="font-semibold">{mergeTarget.name}</span></li>
                    )}
                    <li>Reassign all email outreach and schedules</li>
                    <li>Permanently remove <span className="font-semibold">{mergeSource.name}</span></li>
                  </ul>
                </div>
              )}
            </div>

            {mergeError && <p className="text-red-500 dark:text-red-400 text-sm mt-3">{mergeError}</p>}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setMergeSource(null)} className="text-slate-600 dark:text-slate-400 text-sm font-medium px-4 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancel</button>
              <button
                onClick={() => void handleMerge()}
                disabled={!mergeTargetId || merging}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-xs"
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
