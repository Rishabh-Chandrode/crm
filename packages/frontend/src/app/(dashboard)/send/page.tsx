'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { prospectFullName } from '@/lib/types';
import type { Document, EmailTemplate, Company, Prospect, TemplateVariable } from '@/lib/types';
import Combobox from '@/components/Combobox';
import DateTimePicker from '@/components/DateTimePicker';

type Step = 'select' | 'customize' | 'preview' | 'result';
type TargetMode = 'company' | 'search';
type SendMode = 'template' | 'quick';

interface SendResult {
  sent: number;
  failed: number;
  total: number;
  results: { email: string; status: string; error?: string }[];
}

function localDatetimeDefault(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

function toLocalDatetimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface QuickOption {
  label: string;
  sublabel: string;
  isoString: string;
}

function getQuickScheduleOptions(): QuickOption[] {
  const now = new Date();
  const options: QuickOption[] = [];
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(9, 30, 0, 0);
  const tomorrowDay = tomorrow.getDay();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (d: Date) => `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()} · 9:30 AM`;
  if (tomorrowDay !== 0 && tomorrowDay !== 6) {
    options.push({ label: 'Tomorrow morning', sublabel: fmt(tomorrow), isoString: tomorrow.toISOString() });
  } else {
    const nextMonday = new Date(now);
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(9, 30, 0, 0);
    options.push({ label: 'Monday morning', sublabel: fmt(nextMonday), isoString: nextMonday.toISOString() });
  }
  if (tomorrowDay !== 0 && tomorrowDay !== 6) {
    const nextMonday = new Date(now);
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(9, 30, 0, 0);
    if (nextMonday.toDateString() !== tomorrow.toDateString()) {
      options.push({ label: 'Next Monday', sublabel: fmt(nextMonday), isoString: nextMonday.toISOString() });
    }
  }
  return options;
}

export default function SendPage() {
  const [sendMode, setSendMode] = useState<SendMode>('template');
  const [step, setStep] = useState<Step>('select');
  const [targetMode, setTargetMode] = useState<TargetMode>('company');

  // Quick email state
  const [quickTo, setQuickTo] = useState('');
  const [quickSubject, setQuickSubject] = useState('');
  const [quickBody, setQuickBody] = useState('');
  const [quickAttachments, setQuickAttachments] = useState<File[]>([]);
  const [quickSelectedDocumentIds, setQuickSelectedDocumentIds] = useState<string[]>([]);
  const [showQuickDocsPicker, setShowQuickDocsPicker] = useState(false);
  const [quickEmailSuggestions, setQuickEmailSuggestions] = useState<Prospect[]>([]);
  const [showQuickEmailSuggestions, setShowQuickEmailSuggestions] = useState(false);
  const quickFileInputRef = useRef<HTMLInputElement>(null);
  const [quickStatus, setQuickStatus] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (quickTo.trim().length < 2) {
      setQuickEmailSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      api.prospects.list({ search: quickTo, limit: 5 })
        .then(res => setQuickEmailSuggestions(res.data))
        .catch(console.error);
    }, 300);
    return () => clearTimeout(t);
  }, [quickTo]);

  // Template + docs
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const hasLoadedDocs = useRef(false);

  // Company mode
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [companyProspects, setCompanyProspects] = useState<Prospect[]>([]);

  // Search mode
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Prospect[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared prospect selection
  const [selectedProspects, setSelectedProspects] = useState<string[]>([]);

  // Step 2 / send
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [previewProspect, setPreviewProspect] = useState('');
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState('');

  // Schedule
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState(localDatetimeDefault);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState(false);

  useEffect(() => {
    async function load() {
      const [tRes, cRes] = await Promise.all([api.templates.list(), api.companies.list()]);
      setTemplates(tRes.data as EmailTemplate[]);
      setCompanies(cRes.data as Company[]);
    }
    void load();
  }, []);

  useEffect(() => {
    if (hasLoadedDocs.current) return;
    hasLoadedDocs.current = true;
    api.documents.list().then((r) => setDocuments(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedCompany) { setCompanyProspects([]); return; }
    api.prospects.list({ companyId: selectedCompany }).then((res) => {
      setCompanyProspects(res.data as Prospect[]);
      setSelectedProspects([]);
    }).catch(console.error);
  }, [selectedCompany]);

  const runSearch = useCallback((q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    api.prospects.list({ search: q, limit: 30 })
      .then((res) => setSearchResults(res.data as Prospect[]))
      .catch(console.error)
      .finally(() => setSearching(false));
  }, []);

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => runSearch(q), 300);
  }

  // Prospects visible in current mode
  const activeProspects = targetMode === 'company' ? companyProspects : searchResults;

  const template = templates.find((t) => t.id === selectedTemplate);
  const customVars = template?.variables.filter((v) => v.source === 'custom') ?? [];
  const templateDocIds = template?.document_ids ?? [];

  // Prospects that will actually be sent to
  const targetProspects = selectedProspects.length > 0
    ? activeProspects.filter((p) => selectedProspects.includes(p.id))
    : activeProspects;

  const canProceed = !!selectedTemplate && (
    targetMode === 'company' ? !!selectedCompany : searchResults.length > 0
  );

  async function handlePreview() {
    if (!selectedTemplate || !previewProspect) return;
    setError('');
    try {
      const res = await api.email.preview(selectedTemplate, previewProspect, customValues);
      setPreview({ subject: res.data.subject, html: res.data.html });
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    }
  }

  async function handleSend() {
    if (!selectedTemplate) return;
    setError('');
    setSending(true);
    try {
      if (targetMode === 'company') {
        const ids = selectedProspects.length > 0 ? selectedProspects : undefined;
        const res = await api.email.sendCompany(selectedTemplate, selectedCompany, ids, customValues, selectedDocumentIds);
        setResult(res.data);
      } else {
        const ids = selectedProspects.length > 0 ? selectedProspects : searchResults.map((p) => p.id);
        const res = await api.email.sendBatch(selectedTemplate, ids, customValues, selectedDocumentIds);
        setResult(res.data);
      }
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  async function handleSchedule(isoOverride?: string) {
    if (!selectedTemplate) return;
    setError('');
    setScheduling(true);
    try {
      const scheduledFor = isoOverride ?? new Date(scheduleDateTime).toISOString();
      if (targetMode === 'company') {
        const ids = selectedProspects.length > 0 ? selectedProspects : undefined;
        await api.schedules.create({ templateId: selectedTemplate, companyId: selectedCompany, prospectIds: ids, customValues, scheduledFor, documentIds: selectedDocumentIds });
      } else {
        const ids = selectedProspects.length > 0 ? selectedProspects : searchResults.map((p) => p.id);
        await api.schedules.create({ templateId: selectedTemplate, prospectIds: ids, customValues, scheduledFor, documentIds: selectedDocumentIds });
      }
      setShowSchedulePicker(false);
      setShowCustomPicker(false);
      setScheduled(true);
      setScheduleDateTime(isoOverride ? toLocalDatetimeInput(new Date(isoOverride)) : scheduleDateTime);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scheduling failed');
    } finally {
      setScheduling(false);
    }
  }

  async function handleQuickSend() {
    if (!quickTo || !quickSubject || !quickBody) {
      setQuickStatus({ msg: 'Email, subject, and body are required', type: 'error' });
      return;
    }
    setSending(true);
    setQuickStatus(null);
    try {
      const documentIds: string[] = [...quickSelectedDocumentIds];
      if (quickAttachments.length > 0) {
        setQuickStatus({ msg: 'Uploading attachments...', type: 'info' });
        for (const file of quickAttachments) {
          const res = await api.documents.upload(file, file.name);
          documentIds.push(res.data.id);
        }
        setQuickStatus({ msg: 'Sending email...', type: 'info' });
      }
      await api.email.quickSend(quickTo, quickSubject, quickBody, documentIds);
      setQuickStatus({ msg: 'Quick Email sent successfully', type: 'success' });
      setQuickTo(''); setQuickSubject(''); setQuickBody(''); setQuickAttachments([]); setQuickSelectedDocumentIds([]);
    } catch (err) {
      setQuickStatus({ msg: err instanceof Error ? err.message : 'Send failed', type: 'error' });
    } finally {
      setSending(false);
    }
  }

  async function handleQuickSchedule(isoOverride?: string) {
    const scheduledFor = isoOverride ?? new Date(scheduleDateTime).toISOString();
    if (!quickTo || !quickSubject || !quickBody || !scheduledFor) {
      setQuickStatus({ msg: 'All fields are required for scheduling', type: 'error' });
      return;
    }
    setScheduling(true);
    setQuickStatus(null);
    try {
      const documentIds: string[] = [...quickSelectedDocumentIds];
      if (quickAttachments.length > 0) {
        setQuickStatus({ msg: 'Uploading attachments...', type: 'info' });
        for (const file of quickAttachments) {
          const res = await api.documents.upload(file, file.name);
          documentIds.push(res.data.id);
        }
        setQuickStatus({ msg: 'Scheduling email...', type: 'info' });
      }
      await api.schedules.quick(quickTo, quickSubject, quickBody, scheduledFor, documentIds);
      setQuickStatus({ msg: 'Quick Email scheduled successfully', type: 'success' });
      setQuickTo(''); setQuickSubject(''); setQuickBody(''); setQuickAttachments([]); setQuickSelectedDocumentIds([]);
      setShowSchedulePicker(false);
      setShowCustomPicker(false);
    } catch (err) {
      setQuickStatus({ msg: err instanceof Error ? err.message : 'Scheduling failed', type: 'error' });
    } finally {
      setScheduling(false);
    }
  }

  function reset() {
    setStep('select');
    setSelectedTemplate('');
    setSelectedCompany('');
    setCompanyProspects([]);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedProspects([]);
    setCustomValues({});
    setPreview(null);
    setPreviewProspect('');
    setResult(null);
    setError('');
    setScheduled(false);
    setShowSchedulePicker(false);
    setShowCustomPicker(false);
    setScheduleDateTime(localDatetimeDefault());
    setSelectedDocumentIds([]);
  }

  function switchMode(mode: TargetMode) {
    setTargetMode(mode);
    setSelectedProspects([]);
    setSelectedCompany('');
    setCompanyProspects([]);
    setSearchQuery('');
    setSearchResults([]);
  }

  function toggleProspect(id: string) {
    setSelectedProspects((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function toggleDocument(id: string) {
    setSelectedDocumentIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  const sendCount = targetProspects.length;

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Send Emails</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Send personalized outreach emails to recruiters and hiring managers</p>
      </div>

      <div className="flex gap-4 mb-8 pb-4 border-b border-slate-200 dark:border-slate-800">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="sendMode" value="template" checked={sendMode === 'template'} onChange={() => setSendMode('template')} className="text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Template Outreach</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="sendMode" value="quick" checked={sendMode === 'quick'} onChange={() => setSendMode('quick')} className="text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Quick Email</span>
        </label>
      </div>

      {sendMode === 'template' ? (
        <>
          {/* Steps indicator */}
          <div className="flex items-center gap-2 mb-8">
            {(['select', 'customize', 'preview', 'result'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold transition-colors ${
                  step === s
                    ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-500/30'
                    : i < (['select', 'customize', 'preview', 'result'] as Step[]).indexOf(step)
                    ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  {i + 1}
                </div>
                {i < 3 && <div className="w-8 h-px bg-slate-200 dark:bg-slate-800" />}
              </div>
            ))}
            <span className="ml-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{step}</span>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-2xl px-4 py-3 mb-6 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Select */}
          {step === 'select' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6 space-y-5 shadow-xs">
              {/* Template */}
              <div>
                <label className="form-label">Email Template *</label>
                <Combobox
                  options={templates.map((t) => ({
                    value: t.id,
                    label: t.name,
                    sublabel: t.job_description ?? undefined,
                  }))}
                  value={selectedTemplate}
                  onChange={(tId) => {
                    setSelectedTemplate(tId);
                    const t = templates.find((t) => t.id === tId);
                    if (t?.document_ids?.length) {
                      setSelectedDocumentIds((prev) => [...new Set([...t.document_ids, ...prev])]);
                    }
                  }}
                  placeholder="Choose a template…"
                  clearLabel="— no template —"
                />
                {template && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">Subject: {template.subject}</p>
                )}
              </div>

              {/* Target mode tabs */}
              <div>
                <label className="form-label">Select prospects *</label>
                <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-4 w-fit">
                  {([
                    { mode: 'company' as TargetMode, label: 'By Company' },
                    { mode: 'search'  as TargetMode, label: 'Search Prospects' },
                  ]).map(({ mode, label }) => (
                    <button
                      key={mode}
                      onClick={() => switchMode(mode)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        targetMode === mode
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* By Company */}
                {targetMode === 'company' && (
                  <div className="space-y-4">
                    <Combobox
                      options={companies.map((c) => ({ value: c.id, label: c.name }))}
                      value={selectedCompany}
                      onChange={setSelectedCompany}
                      placeholder="Choose a company…"
                      clearLabel="— no company —"
                    />

                    {companyProspects.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
                          {selectedProspects.length === 0
                            ? `Sending to all ${companyProspects.length} prospects — or narrow by category below`
                            : `${selectedProspects.length} of ${companyProspects.length} selected`}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          <button
                            onClick={() => setSelectedProspects([])}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              selectedProspects.length === 0
                                ? 'bg-slate-800 dark:bg-slate-700 text-white border-slate-800 dark:border-slate-700 font-semibold'
                                : 'border-slate-300 dark:border-slate-700 text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                          >
                            All ({companyProspects.length})
                          </button>
                          {([
                            { cat: 'engineer', label: 'Engineers', style: 'border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40' },
                            { cat: 'hr',       label: 'HR',        style: 'border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40' },
                            { cat: 'other',    label: 'Other',     style: 'border-slate-300 dark:border-slate-700 text-slate-500 hover:border-slate-400 hover:text-slate-700' },
                          ] as const).map(({ cat, label, style }) => {
                            const group = companyProspects.filter((p) => p.role_category === cat);
                            if (!group.length) return null;
                            return (
                              <button
                                key={cat}
                                onClick={() => setSelectedProspects(group.map((p) => p.id))}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${style}`}
                              >
                                {label} ({group.length})
                              </button>
                            );
                          })}
                        </div>
                        <ProspectList
                          prospects={companyProspects}
                          selected={selectedProspects}
                          onToggle={toggleProspect}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Search Prospects */}
                {targetMode === 'search' && (
                  <div className="space-y-3">
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        className="form-input pl-9"
                        placeholder="Search by name, email, or company…"
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        autoFocus
                      />
                      {searching && (
                        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      )}
                    </div>

                    {searchQuery && !searching && searchResults.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-4">No prospects found for "{searchQuery}"</p>
                    )}

                    {searchResults.length > 0 && (
                      <>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-slate-400">
                            {selectedProspects.length === 0
                              ? `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} — sending to all`
                              : `${selectedProspects.length} of ${searchResults.length} selected`}
                          </p>
                          {selectedProspects.length > 0 && (
                            <button
                              onClick={() => setSelectedProspects([])}
                              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              Select all
                            </button>
                          )}
                        </div>
                        <ProspectList
                          prospects={searchResults}
                          selected={selectedProspects}
                          onToggle={toggleProspect}
                          showCompany
                        />
                      </>
                    )}

                    {!searchQuery && (
                      <p className="text-sm text-slate-400 text-center py-6">
                        Type a name, email, or company to find prospects
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setStep('customize')}
                  disabled={!canProceed}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors shadow-xs"
                >
                  Next: Customize & Attachments →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Customize */}
          {step === 'customize' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6 space-y-5 shadow-xs">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">Customize values</h3>

              {customVars.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400 text-sm">No custom per-send variables required for this template.</p>
              ) : (
                <div className="space-y-4">
                  {customVars.map((v: TemplateVariable) => (
                    <div key={v.key}>
                      <label className="form-label">{v.label || v.key}</label>
                      <p className="text-xs text-slate-400 mb-1">Placeholder: <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400">{`{{${v.key}}}`}</code></p>
                      <input
                        className="form-input"
                        value={customValues[v.key] ?? v.defaultValue ?? ''}
                        onChange={(e) => setCustomValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                        placeholder={v.defaultValue ?? `Enter ${v.label || v.key}…`}
                      />
                    </div>
                  ))}
                </div>
              )}

              {activeProspects.length > 0 && (
                <div>
                  <label className="form-label">Preview for prospect</label>
                  <Combobox
                    options={targetProspects.map((p) => ({
                      value: p.id,
                      label: prospectFullName(p),
                      sublabel: p.email,
                    }))}
                    value={previewProspect}
                    onChange={setPreviewProspect}
                    placeholder="Choose a prospect to preview…"
                    clearLabel="— no preview —"
                  />
                </div>
              )}

              {documents.length > 0 && (
                <div>
                  <label className="form-label">
                    Attach documents
                    {templateDocIds.length > 0 && (
                      <span className="text-amber-600 dark:text-amber-400 font-normal ml-1">({templateDocIds.length} preset from template)</span>
                    )}
                    {templateDocIds.length === 0 && <span className="text-slate-400 font-normal"> (optional)</span>}
                  </label>
                  <div className="space-y-1.5 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 max-h-44 overflow-y-auto bg-slate-50/50 dark:bg-slate-950/40">
                    {documents.map((doc) => {
                      const fromTemplate = templateDocIds.includes(doc.id);
                      return (
                        <label key={doc.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${fromTemplate ? 'cursor-default' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors'}`}>
                          <input
                            type="checkbox"
                            checked={selectedDocumentIds.includes(doc.id)}
                            onChange={() => !fromTemplate && toggleDocument(doc.id)}
                            disabled={fromTemplate}
                            className="rounded-md border-slate-300 dark:border-slate-700 text-indigo-600 w-4 h-4 flex-shrink-0 disabled:opacity-60"
                          />
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{doc.name}</span>
                            <span className="text-xs text-slate-400">{doc.filename}</span>
                            {fromTemplate && (
                              <span className="text-[10px] bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-medium">template</span>
                            )}
                            {doc.drive_url && (
                              <span className="text-[10px] bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-medium">Drive</span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <button onClick={() => setStep('select')} className="text-slate-600 dark:text-slate-400 text-sm font-medium px-4 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">← Back</button>
                <div className="flex gap-2.5">
                  {previewProspect && (
                    <button
                      onClick={() => void handlePreview()}
                      className="border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                    >
                      Preview Email
                    </button>
                  )}
                  <button
                    onClick={() => setShowSchedulePicker(true)}
                    className="border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Schedule
                  </button>
                  <button
                    onClick={() => void handleSend()}
                    disabled={sending}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors shadow-xs"
                  >
                    {sending ? 'Sending…' : `Send to ${sendCount} prospect${sendCount !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Schedule picker modal */}
          {showSchedulePicker && (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setShowSchedulePicker(false);
                  setShowCustomPicker(false);
                  setError('');
                }
              }}
            >
              <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-sm max-h-[90vh] flex flex-col my-auto overflow-hidden">
                <div className="px-5 pt-5 pb-2.5 shrink-0 border-b border-slate-100 dark:border-slate-800/60">
                  <div className="flex items-center justify-between mb-0.5">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Schedule send</h3>
                    <button
                      onClick={() => {
                        setShowSchedulePicker(false);
                        setShowCustomPicker(false);
                        setError('');
                      }}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">{sendCount} prospect{sendCount !== 1 ? 's' : ''} will receive this email</p>
                </div>

                <div className="p-3 space-y-1.5 overflow-y-auto">
                  {getQuickScheduleOptions().map((opt) => (
                    <button
                      key={opt.isoString}
                      onClick={() => void handleSchedule(opt.isoString)}
                      disabled={scheduling}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left group disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{opt.label}</p>
                        <p className="text-[11px] text-slate-400">{opt.sublabel}</p>
                      </div>
                    </button>
                  ))}

                  <button
                    onClick={() => setShowCustomPicker((v) => !v)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-600 dark:text-slate-300">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Pick specific date &amp; time</p>
                      {showCustomPicker && scheduleDateTime && (
                        <p className="text-[11px] text-slate-400">
                          {new Date(scheduleDateTime).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                    <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${showCustomPicker ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showCustomPicker && (
                    <div className="mx-0.5 space-y-2.5 pt-1 pb-1">
                      <DateTimePicker
                        inline
                        value={scheduleDateTime}
                        min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                        onChange={setScheduleDateTime}
                      />
                      {error && <p className="text-red-500 text-xs px-2">{error}</p>}
                      <button
                        onClick={() => void handleSchedule()}
                        disabled={scheduling || !scheduleDateTime}
                        className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60 text-white text-xs font-bold py-2.5 rounded-2xl transition-all duration-200 shadow-md shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                      >
                        {scheduling ? 'Scheduling…' : 'Confirm & Schedule Send'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && preview && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6 space-y-5 shadow-xs">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">Email Preview</h3>
              <div className="bg-slate-50 dark:bg-slate-950/50 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1">Subject</p>
                <p className="text-slate-900 dark:text-slate-100 font-semibold text-sm">{preview.subject}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950/50 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-3">Rendered HTML</p>
                <iframe
                  srcDoc={preview.html}
                  sandbox="allow-same-origin allow-popups"
                  title="Email preview"
                  className="w-full rounded-xl bg-white border border-slate-200/50"
                  style={{ minHeight: '200px' }}
                  onLoad={(e) => {
                    const doc = e.currentTarget.contentDocument;
                    if (doc) e.currentTarget.style.height = `${doc.body.scrollHeight + 32}px`;
                  }}
                />
              </div>
              {selectedDocumentIds.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-950/50 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80">
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">Attachments</p>
                  <div className="space-y-1.5">
                    {documents.filter((d) => selectedDocumentIds.includes(d.id)).map((d) => (
                      <div key={d.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        <span className="font-semibold">{d.name}</span>
                        <span className="text-slate-400">({d.filename})</span>
                        {templateDocIds.includes(d.id) && (
                          <span className="text-[10px] bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-medium">template</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <button onClick={() => setStep('customize')} className="text-slate-600 dark:text-slate-400 text-sm font-medium px-4 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">← Back</button>
                <div className="flex gap-2.5">
                  <button
                    onClick={() => setShowSchedulePicker(true)}
                    className="border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Schedule
                  </button>
                  <button
                    onClick={() => void handleSend()}
                    disabled={sending}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors shadow-xs"
                  >
                    {sending ? 'Sending…' : 'Confirm & Send'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Result */}
          {step === 'result' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6 space-y-5 shadow-xs">
              {scheduled ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">Emails scheduled</h3>
                      <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                        Will send on {new Date(scheduleDateTime).toLocaleString()} · view or manage in <a href="/scheduled" className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold">Scheduled Queue</a>
                      </p>
                    </div>
                  </div>
                  <button onClick={reset} className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-sm font-semibold py-2.5 rounded-xl transition-colors">
                    Schedule another batch
                  </button>
                </>
              ) : result ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">Send complete</h3>
                      <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{result.sent} sent · {result.failed} failed · {result.total} total</p>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {result.results.map((r, i) => (
                      <div key={i} className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs ${
                        r.status === 'sent'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300'
                          : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300'
                      }`}>
                        <span className="font-medium font-mono">{r.email}</span>
                        <div className="text-right">
                          <span className="font-bold uppercase tracking-wider">{r.status}</span>
                          {r.error && <p className="text-[11px] text-red-500 dark:text-red-400">{r.error}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={reset} className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-sm font-semibold py-2.5 rounded-xl transition-colors">
                    Send another batch
                  </button>
                </>
              ) : null}
            </div>
          )}
        </>
      ) : (
        /* Quick Email Section */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs flex flex-col">
          <div className="bg-slate-50/80 dark:bg-slate-950/60 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Compose Quick Message
            </h2>
          </div>
          {quickStatus && (
            <div className={`mx-5 mt-4 px-4 py-3 rounded-xl text-xs font-medium ${
              quickStatus.type === 'error'
                ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
            }`}>
              {quickStatus.msg}
            </div>
          )}
          <div className="flex flex-col flex-1">
            <div className="flex items-center px-5 py-3 border-b border-slate-100 dark:border-slate-800 relative">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider w-16">To:</span>
              <input
                type="email"
                value={quickTo}
                onChange={e => {
                  setQuickTo(e.target.value);
                  setShowQuickEmailSuggestions(true);
                }}
                onFocus={() => { if (quickTo.length >= 2) setShowQuickEmailSuggestions(true); }}
                onBlur={() => setTimeout(() => setShowQuickEmailSuggestions(false), 200)}
                className="flex-1 bg-transparent border-none outline-none text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:ring-0 p-0 font-mono"
                placeholder="recipient@example.com"
              />
              {showQuickEmailSuggestions && quickEmailSuggestions.length > 0 && (
                <div className="absolute top-full left-16 mt-1 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-20 overflow-hidden">
                  {quickEmailSuggestions.map(p => (
                    <div
                      key={p.id}
                      className="px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setQuickTo(p.email);
                        setShowQuickEmailSuggestions(false);
                      }}
                    >
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{p.first_name} {p.last_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{p.email}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center px-5 py-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider w-16">Subject:</span>
              <input
                type="text"
                value={quickSubject}
                onChange={e => setQuickSubject(e.target.value)}
                className="flex-1 bg-transparent border-none outline-none text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:ring-0 p-0 font-medium"
                placeholder="Email subject line…"
              />
            </div>
            <div className="p-5 flex-1">
              <textarea
                value={quickBody}
                onChange={e => setQuickBody(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:ring-0 p-0 resize-none min-h-[220px] font-mono leading-relaxed"
                placeholder="Type your message here..."
              />
            </div>
            {(quickAttachments.length > 0 || quickSelectedDocumentIds.length > 0) && (
              <div className="px-5 pb-4 flex flex-wrap gap-2">
                {quickAttachments.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs px-2.5 py-1 rounded-xl">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    <span className="max-w-[150px] truncate" title={f.name}>{f.name}</span>
                    <button onClick={() => setQuickAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500 ml-1 transition-colors">
                      ✕
                    </button>
                  </div>
                ))}
                {documents.filter(d => quickSelectedDocumentIds.includes(d.id)).map(doc => (
                  <div key={doc.id} className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs px-2.5 py-1 rounded-xl">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    <span className="max-w-[150px] truncate" title={doc.name}>{doc.name}</span>
                    <button onClick={() => setQuickSelectedDocumentIds(prev => prev.filter(id => id !== doc.id))} className="text-indigo-400 hover:text-indigo-600 ml-1 transition-colors">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-50/80 dark:bg-slate-950/60 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 relative">
              <button
                onClick={() => quickFileInputRef.current?.click()}
                className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1 flex items-center gap-1.5 text-xs font-semibold"
                title="Upload Files"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                <span>Upload</span>
              </button>
              <input
                type="file"
                multiple
                className="hidden"
                ref={quickFileInputRef}
                onChange={e => {
                  if (e.target.files && e.target.files.length > 0) {
                    const newFiles = Array.from(e.target.files);
                    setQuickAttachments(prev => [...prev, ...newFiles]);
                  }
                  e.target.value = '';
                }}
              />

              <button
                onClick={() => setShowQuickDocsPicker(!showQuickDocsPicker)}
                className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1 flex items-center gap-1.5 text-xs font-semibold"
                title="Attach saved files"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                <span>Saved Files</span>
              </button>

              {showQuickDocsPicker && (
                <div className="absolute bottom-full left-0 mb-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-20">
                  <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs">Select Saved Documents</h3>
                    <button onClick={() => setShowQuickDocsPicker(false)} className="text-slate-400 hover:text-slate-600 p-1">
                      ✕
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                    {documents.length === 0 ? (
                      <div className="p-3 text-xs text-slate-400 text-center">No documents uploaded</div>
                    ) : (
                      documents.map(doc => (
                        <label key={doc.id} className="flex items-center gap-3 rounded-xl px-2.5 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                          <input
                            type="checkbox"
                            checked={quickSelectedDocumentIds.includes(doc.id)}
                            onChange={(e) => {
                              if (e.target.checked) setQuickSelectedDocumentIds(p => [...p, doc.id]);
                              else setQuickSelectedDocumentIds(p => p.filter(id => id !== doc.id));
                            }}
                            className="rounded-md border-slate-300 dark:border-slate-700 text-indigo-600 w-4 h-4 flex-shrink-0"
                          />
                          <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{doc.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 relative">
              <button
                onClick={() => setShowSchedulePicker(!showSchedulePicker)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
              >
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Schedule
              </button>
              <button
                onClick={() => void handleQuickSend()}
                disabled={sending}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold px-5 py-2 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
              >
                {sending ? 'Sending…' : 'Send Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Shared prospect list component used in both modes
function ProspectList({
  prospects,
  selected,
  onToggle,
  showCompany = false,
}: {
  prospects: Prospect[];
  selected: string[];
  onToggle: (id: string) => void;
  showCompany?: boolean;
}) {
  return (
    <div className="space-y-1.5 max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl p-3 bg-slate-50/50 dark:bg-slate-950/40">
      {prospects.map((p) => (
        <label key={p.id} className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl px-2.5 py-1.5 transition-colors">
          <input
            type="checkbox"
            checked={selected.includes(p.id)}
            onChange={() => onToggle(p.id)}
            className="rounded-md border-slate-300 dark:border-slate-700 text-indigo-600"
          />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex-1 min-w-0 truncate">
            {prospectFullName(p)}
            {showCompany && (p as unknown as { company?: { name: string } }).company?.name && (
              <span className="text-slate-400 font-normal ml-1">· {(p as unknown as { company: { name: string } }).company.name}</span>
            )}
          </span>
          <span className="text-xs text-slate-400 hidden sm:inline truncate max-w-[140px] font-mono">{p.email}</span>
          {p.role_category && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
              p.role_category === 'engineer' ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300' :
              p.role_category === 'hr'       ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300' :
                                               'bg-slate-100 dark:bg-slate-800 text-slate-500'
            }`}>
              {p.role_category === 'engineer' ? 'Eng' : p.role_category === 'hr' ? 'HR' : 'Other'}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}
