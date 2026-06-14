'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Company } from '@/lib/types';

interface CompanyFormData {
  name: string;
  website: string;
  industry: string;
}

const EMPTY: CompanyFormData = { name: '', website: '', industry: '' };

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<CompanyFormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
          <p className="text-slate-500 text-sm mt-1">Target companies for your outreach</p>
        </div>
        <button onClick={openCreate} className="self-start sm:self-auto bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + Add Company
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : companies.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg font-medium mb-1">No companies yet</p>
          <p className="text-sm">Add your first company to get started</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Industry</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Website</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Prospects</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600">{c.industry ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.website ? (
                      <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline truncate max-w-[180px] inline-block">
                        {c.website.replace(/^https?:\/\//, '')}
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{(c as Company & { prospect_count?: number }).prospect_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(c)} className="text-slate-400 hover:text-indigo-600 text-xs font-medium transition-colors">Edit</button>
                      <button onClick={() => void handleDelete(c.id)} className="text-slate-400 hover:text-red-600 text-xs font-medium transition-colors">Delete</button>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-5">{editing ? 'Edit Company' : 'Add Company'}</h2>
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
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="text-slate-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
              <button onClick={() => void handleSave()} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
