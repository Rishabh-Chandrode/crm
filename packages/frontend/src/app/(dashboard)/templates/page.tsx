'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Document, EmailTemplate, TemplateVariable, VariablePreset, VariableSource } from '@/lib/types';
import { PROSPECT_FIELDS, COMPANY_FIELDS, SENDER_FIELDS, buildVariableFromKey } from '@/lib/types';

interface TemplateForm {
  name: string;
  description: string;
  job_description: string;
  subject: string;
  body: string;
  variables: TemplateVariable[];
  document_ids: string[];
}

const EMPTY_FORM: TemplateForm = {
  name: '',
  description: '',
  job_description: '',
  subject: '',
  body: '',
  variables: [],
  document_ids: [],
};

const SOURCE_LABELS: Record<VariableSource, string> = {
  prospect: 'Prospect field',
  company: 'Company field',
  sender: 'Sender profile',
  static: 'Static value',
  custom: 'Custom (per send)',
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [presets, setPresets] = useState<VariablePreset[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [detecting, setDetecting] = useState(false);

  async function load() {
    const [tRes, pRes, dRes] = await Promise.all([
      api.templates.list(),
      api.variablePresets.list(),
      api.documents.list(),
    ]);
    setTemplates(tRes.data as EmailTemplate[]);
    setPresets(pRes.data);
    setDocuments(dRes.data);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowEditor(true);
  }

  function openEdit(t: EmailTemplate) {
    setEditing(t);
    setForm({
      name: t.name,
      description: t.description ?? '',
      job_description: t.job_description ?? '',
      subject: t.subject,
      body: t.body,
      variables: t.variables,
      document_ids: t.document_ids ?? [],
    });
    setError('');
    setShowEditor(true);
  }

  async function detectVariables() {
    if (!editing) {
      const text = `${form.subject} ${form.body}`;
      const matches = [...text.matchAll(/\{\{([^}]+)\}\}/g)];
      const keys = [...new Set(matches.map((m) => m[1] ?? '').filter(Boolean))];
      const existingKeys = new Set(form.variables.map((v) => v.key));
      const newVars: TemplateVariable[] = keys
        .filter((k) => !existingKeys.has(k))
        .map((k) => buildVariableFromKey(k, presets));
      setForm((prev) => ({ ...prev, variables: [...prev.variables, ...newVars] }));
      return;
    }

    setDetecting(true);
    try {
      const res = await api.templates.detectVariables(editing.id, form.variables);
      setForm((prev) => ({
        ...prev,
        variables: [...prev.variables, ...res.data.newVariables],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to detect variables');
    } finally {
      setDetecting(false);
    }
  }

  function updateVariable(index: number, patch: Partial<TemplateVariable>) {
    setForm((prev) => {
      const vars = [...prev.variables];
      vars[index] = { ...vars[index]!, ...patch };
      return { ...prev, variables: vars };
    });
  }

  function removeVariable(index: number) {
    setForm((prev) => ({
      ...prev,
      variables: prev.variables.filter((_, i) => i !== index),
    }));
  }

  function toggleDocument(id: string) {
    setForm((prev) => ({
      ...prev,
      document_ids: prev.document_ids.includes(id)
        ? prev.document_ids.filter((d) => d !== id)
        : [...prev.document_ids, id],
    }));
  }

  function addVariable() {
    const key = `var_${Date.now()}`;
    setForm((prev) => ({
      ...prev,
      variables: [
        ...prev.variables,
        { key, label: '', source: 'custom', field: undefined, defaultValue: '' },
      ],
    }));
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      const payload: Partial<EmailTemplate> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        job_description: form.job_description.trim() || null,
        subject: form.subject.trim(),
        body: form.body,
        variables: form.variables,
        document_ids: form.document_ids,
      };
      if (editing) {
        await api.templates.update(editing.id, payload);
      } else {
        await api.templates.create(payload);
      }
      setShowEditor(false);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template?')) return;
    await api.templates.delete(id);
    void load();
  }

  function getFieldOptions(source: VariableSource) {
    if (source === 'prospect') return PROSPECT_FIELDS;
    if (source === 'company') return COMPANY_FIELDS;
    if (source === 'sender') return SENDER_FIELDS;
    return [];
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-1 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Email Templates</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">Create reusable templates with smart placeholders</p>
        </div>
        <button
          onClick={openCreate}
          className="btn-primary"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Template
        </button>
      </div>

      {loading ? (
        <p className="text-zinc-400 text-xs py-12 text-center">Loading templates…</p>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 card p-8">
          <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-0.5">No templates yet</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Create your first outreach template with variable placeholders</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {templates.map((t) => (
            <div key={t.id} className="card p-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">{t.name}</h3>
                    {t.description && <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">{t.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => openEdit(t)} className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:underline">Edit</button>
                    <button onClick={() => void handleDelete(t.id)} className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline">Delete</button>
                  </div>
                </div>

                {t.job_description && (
                  <p className="text-zinc-500 dark:text-zinc-400 text-xs italic mb-2">Role: {t.job_description.slice(0, 80)}{t.job_description.length > 80 ? '…' : ''}</p>
                )}

                <div className="bg-zinc-50 dark:bg-zinc-950/50 rounded-lg p-2.5 border border-zinc-200/80 dark:border-zinc-800 mb-3">
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium truncate">
                    <span className="text-zinc-400 font-normal">Subject: </span>
                    {t.subject}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {t.variables.map((v) => (
                    <span key={v.key} className="inline-flex px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] rounded font-mono border border-zinc-200/60 dark:border-zinc-700/60">
                      {`{{${v.key}}}`}
                    </span>
                  ))}
                  {(t.document_ids ?? []).length > 0 && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-[10px] rounded font-medium">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      {t.document_ids.length} attachment{t.document_ids.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Template Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-3xl my-8 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{editing ? 'Edit Template' : 'New Template'}</h2>
              <button onClick={() => setShowEditor(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label text-xs">Template Name *</label>
                  <input className="form-input text-xs" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Software Engineer Outreach" />
                </div>
                <div>
                  <label className="form-label text-xs">Description</label>
                  <input className="form-input text-xs" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
                </div>
              </div>

              <div>
                <label className="form-label text-xs">Target Role / Context</label>
                <input className="form-input text-xs" value={form.job_description} onChange={(e) => setForm({ ...form, job_description: e.target.value })} placeholder="Senior Fullstack Engineer" />
              </div>

              <div>
                <label className="form-label text-xs">Subject Line *</label>
                <input className="form-input font-mono text-xs" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Interested in {{job_title}} role at {{company_name}}" />
              </div>

              <div>
                <label className="form-label text-xs">Email Body *</label>
                <p className="text-[11px] text-zinc-400 mb-1.5">Use {'{{variable_name}}'} for dynamic substitutions.</p>
                <textarea
                  className="form-textarea font-mono text-xs leading-relaxed"
                  rows={8}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder={`Hi {{firstName}},\n\nI came across the {{job_title}} opening at {{company_name}} and wanted to connect…\n\nBest,\n{{sender_name}}`}
                />
              </div>

              {/* Variable Manager */}
              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="form-label mb-0 text-xs">Template Variables</label>
                    <p className="text-[11px] text-zinc-400">Map each placeholder to a data source</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void detectVariables()}
                      disabled={detecting}
                      className="btn-secondary text-xs py-1 px-2.5"
                    >
                      {detecting ? 'Scanning…' : '⚡ Auto-detect'}
                    </button>
                    <button
                      onClick={addVariable}
                      className="btn-ghost text-xs py-1 px-2.5"
                    >
                      + Add variable
                    </button>
                  </div>
                </div>

                {form.variables.length === 0 ? (
                  <p className="text-zinc-400 text-xs text-center py-5 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                    No variables yet. Type placeholders like <code className="font-mono text-zinc-800 dark:text-zinc-200">{'{{firstName}}'}</code> then click Auto-detect.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {form.variables.map((v, i) => (
                      <div key={i} className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 bg-zinc-50/50 dark:bg-zinc-950/40">
                        <div className="flex items-start gap-2.5">
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                            <div>
                              <label className="form-label text-[11px]">Placeholder</label>
                              <input
                                className="form-input text-xs font-mono"
                                value={v.key}
                                onChange={(e) => updateVariable(i, { key: e.target.value })}
                                placeholder="firstName"
                              />
                            </div>
                            <div>
                              <label className="form-label text-[11px]">Label</label>
                              <input
                                className="form-input text-xs"
                                value={v.label}
                                onChange={(e) => updateVariable(i, { label: e.target.value })}
                                placeholder="First Name"
                              />
                            </div>
                            <div>
                              <label className="form-label text-[11px]">Source</label>
                              <select
                                className="form-select text-xs"
                                value={v.source}
                                onChange={(e) => updateVariable(i, { source: e.target.value as VariableSource, field: undefined })}
                              >
                                {(Object.keys(SOURCE_LABELS) as VariableSource[]).map((s) => (
                                  <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              {(v.source === 'prospect' || v.source === 'company' || v.source === 'sender') ? (
                                <>
                                  <label className="form-label text-[11px]">Database field</label>
                                  <select
                                    className="form-select text-xs"
                                    value={v.field ?? ''}
                                    onChange={(e) => updateVariable(i, { field: e.target.value })}
                                  >
                                    <option value="">Select field…</option>
                                    {getFieldOptions(v.source).map((f) => (
                                      <option key={f.value} value={f.value}>{f.label}</option>
                                    ))}
                                  </select>
                                </>
                              ) : (
                                <>
                                  <label className="form-label text-[11px]">
                                    {v.source === 'static' ? 'Static value' : 'Default fallback'}
                                  </label>
                                  <input
                                    className="form-input text-xs"
                                    value={v.defaultValue ?? ''}
                                    onChange={(e) => updateVariable(i, { defaultValue: e.target.value })}
                                    placeholder="Fallback value"
                                  />
                                </>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => removeVariable(i)}
                            className="text-zinc-400 hover:text-rose-500 transition-colors mt-5 flex-shrink-0 p-1"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Default Attachments */}
              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
                <div className="mb-2">
                  <label className="form-label mb-0 text-xs">Default Attachments</label>
                  <p className="text-[11px] text-zinc-400">Attached automatically whenever this template is selected.</p>
                </div>
                {documents.length > 0 ? (
                  <div className="space-y-1 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 max-h-40 overflow-y-auto bg-zinc-50/50 dark:bg-zinc-950/40">
                    {documents.map((doc) => (
                      <label key={doc.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-zinc-100/60 dark:hover:bg-zinc-850/60 rounded-lg px-2.5 py-1.5 transition-colors">
                        <input
                          type="checkbox"
                          checked={form.document_ids.includes(doc.id)}
                          onChange={() => toggleDocument(doc.id)}
                          className="rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 w-3.5 h-3.5 flex-shrink-0"
                        />
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{doc.name}</span>
                          <span className="text-[11px] text-zinc-400 font-mono truncate">{doc.filename}</span>
                          {doc.drive_url && (
                            <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded flex-shrink-0">Drive</span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 text-center py-3 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                    No documents uploaded. Add resume files in Settings → Documents.
                  </p>
                )}
              </div>
            </div>

            {error && <p className="text-rose-600 dark:text-rose-400 text-xs px-5 pb-3">{error}</p>}

            <div className="px-5 py-3.5 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2 bg-zinc-50/50 dark:bg-zinc-950/30">
              <button onClick={() => setShowEditor(false)} className="btn-ghost">Cancel</button>
              <button onClick={() => void handleSave()} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : editing ? 'Update Template' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

