'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { prospectFullName } from '@/lib/types';
import type { Document, EmailTemplate, Company, Prospect, TemplateVariable } from '@/lib/types';
import Combobox from '@/components/Combobox';

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
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Send Emails</h1>
        <p className="text-slate-500 text-sm mt-1">Send personalized emails to one or more prospects</p>
      </div>

      <div className="flex gap-4 mb-8 pb-4 border-b border-slate-200">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="sendMode" value="template" checked={sendMode === 'template'} onChange={() => setSendMode('template')} className="text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
          <span className="text-sm font-medium text-slate-700">Use Template</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="sendMode" value="quick" checked={sendMode === 'quick'} onChange={() => setSendMode('quick')} className="text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
          <span className="text-sm font-medium text-slate-700">Quick Email</span>
        </label>
      </div>

      {sendMode === 'template' ? (
        <>
          {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-8">
        {(['select', 'customize', 'preview', 'result'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === s ? 'bg-indigo-600 text-white' : i < (['select', 'customize', 'preview', 'result'] as Step[]).indexOf(step) ? 'bg-indigo-200 text-indigo-700' : 'bg-slate-200 text-slate-500'}`}>
              {i + 1}
            </div>
            {i < 3 && <div className="w-8 h-px bg-slate-200" />}
          </div>
        ))}
        <span className="ml-2 text-sm text-slate-500 capitalize">{step}</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Select */}
      {step === 'select' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">

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
              <p className="text-xs text-slate-400 mt-1">Subject: {template.subject}</p>
            )}
          </div>

          {/* Target mode tabs */}
          <div>
            <label className="form-label">Select prospects *</label>
            <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-4 w-fit">
              {([
                { mode: 'company' as TargetMode, label: 'By Company' },
                { mode: 'search'  as TargetMode, label: 'Search Prospects' },
              ]).map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => switchMode(mode)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    targetMode === mode
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
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
                    <p className="text-xs text-slate-400 mb-2">
                      {selectedProspects.length === 0
                        ? `Sending to all ${companyProspects.length} prospects — or narrow by category below`
                        : `${selectedProspects.length} of ${companyProspects.length} selected`}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <button
                        onClick={() => setSelectedProspects([])}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          selectedProspects.length === 0
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700'
                        }`}
                      >
                        All ({companyProspects.length})
                      </button>
                      {([
                        { cat: 'engineer', label: 'Engineers', style: 'border-blue-300 text-blue-700 hover:bg-blue-50' },
                        { cat: 'hr',       label: 'HR',        style: 'border-purple-300 text-purple-700 hover:bg-purple-50' },
                        { cat: 'other',    label: 'Other',     style: 'border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700' },
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
                          className="text-xs text-indigo-600 hover:text-indigo-800"
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

          <div className="flex justify-end">
            <button
              onClick={() => setStep('customize')}
              disabled={!canProceed}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Customize */}
      {step === 'customize' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <h3 className="font-semibold text-slate-800">Customize values</h3>

          {customVars.length === 0 ? (
            <p className="text-slate-500 text-sm">No custom variables required for this template.</p>
          ) : (
            <div className="space-y-4">
              {customVars.map((v: TemplateVariable) => (
                <div key={v.key}>
                  <label className="form-label">{v.label || v.key}</label>
                  <p className="text-xs text-slate-400 mb-1">Placeholder: <code className="font-mono bg-slate-100 px-1 rounded">{`{{${v.key}}}`}</code></p>
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
                  <span className="text-amber-600 font-normal ml-1">({templateDocIds.length} from template)</span>
                )}
                {templateDocIds.length === 0 && <span className="text-slate-400 font-normal"> (optional)</span>}
              </label>
              <div className="space-y-1.5 border border-slate-200 rounded-lg p-3 max-h-44 overflow-y-auto">
                {documents.map((doc) => {
                  const fromTemplate = templateDocIds.includes(doc.id);
                  return (
                    <label key={doc.id} className={`flex items-center gap-3 rounded px-1 py-1 ${fromTemplate ? 'cursor-default' : 'cursor-pointer hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={selectedDocumentIds.includes(doc.id)}
                        onChange={() => !fromTemplate && toggleDocument(doc.id)}
                        disabled={fromTemplate}
                        className="rounded border-slate-300 text-indigo-600 w-4 h-4 flex-shrink-0 disabled:opacity-60"
                      />
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="text-sm text-slate-700">{doc.name}</span>
                        <span className="text-xs text-slate-400">{doc.filename}</span>
                        {fromTemplate && (
                          <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full flex-shrink-0">template</span>
                        )}
                        {doc.drive_url && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full flex-shrink-0">Drive</span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep('select')} className="text-slate-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">← Back</button>
            <div className="flex gap-3">
              {previewProspect && (
                <button
                  onClick={() => void handlePreview()}
                  className="border border-indigo-300 text-indigo-600 hover:bg-indigo-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  Preview email
                </button>
              )}
              <button
                onClick={() => setShowSchedulePicker(true)}
                className="border border-slate-300 hover:border-slate-400 text-slate-600 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Schedule
              </button>
              <button
                onClick={() => void handleSend()}
                disabled={sending}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
              >
                {sending ? 'Sending…' : `Send to ${sendCount} prospect${sendCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule picker modal */}
      {showSchedulePicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowSchedulePicker(false); setShowCustomPicker(false); setError(''); } }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <div className="flex items-center justify-between mb-0.5">
                <h3 className="text-base font-semibold text-slate-800">Schedule send</h3>
                <button
                  onClick={() => { setShowSchedulePicker(false); setShowCustomPicker(false); setError(''); }}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-slate-400">{sendCount} prospect{sendCount !== 1 ? 's' : ''} will receive this email</p>
            </div>
            <div className="px-3 pb-2">
              {getQuickScheduleOptions().map((opt) => (
                <button
                  key={opt.isoString}
                  onClick={() => void handleSchedule(opt.isoString)}
                  disabled={scheduling}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors text-left group disabled:opacity-50"
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-100 transition-colors">
                    <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{opt.label}</p>
                    <p className="text-xs text-slate-400">{opt.sublabel}</p>
                  </div>
                  {scheduling && (
                    <svg className="w-4 h-4 text-indigo-400 ml-auto animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  )}
                </button>
              ))}
              <button
                onClick={() => setShowCustomPicker((v) => !v)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors text-left group"
              >
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-slate-200 transition-colors">
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">Pick date &amp; time</p>
                  {showCustomPicker && scheduleDateTime && (
                    <p className="text-xs text-slate-400">
                      {new Date(scheduleDateTime).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${showCustomPicker ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showCustomPicker && (
                <div className="mx-3 mb-2 space-y-3">
                  <input
                    type="datetime-local"
                    className="form-input text-sm"
                    value={scheduleDateTime}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    onChange={(e) => setScheduleDateTime(e.target.value)}
                  />
                  {error && <p className="text-red-500 text-xs">{error}</p>}
                  <button
                    onClick={() => void handleSchedule()}
                    disabled={scheduling || !scheduleDateTime}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                  >
                    {scheduling ? 'Scheduling…' : 'Schedule send'}
                  </button>
                </div>
              )}
            </div>
            {!showCustomPicker && error && <p className="text-red-500 text-xs px-5 pb-3">{error}</p>}
            <div className="h-2" />
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && preview && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <h3 className="font-semibold text-slate-800">Email Preview</h3>
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1 font-medium">SUBJECT</p>
            <p className="text-slate-800 font-medium">{preview.subject}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-3 font-medium">BODY</p>
            <iframe
              srcDoc={preview.html}
              sandbox="allow-same-origin allow-popups"
              title="Email preview"
              className="w-full rounded bg-white border-0"
              style={{ minHeight: '200px' }}
              onLoad={(e) => {
                const doc = e.currentTarget.contentDocument;
                if (doc) e.currentTarget.style.height = `${doc.body.scrollHeight + 32}px`;
              }}
            />
          </div>
          {selectedDocumentIds.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-3 font-medium">ATTACHMENTS</p>
              <div className="space-y-1.5">
                {documents.filter((d) => selectedDocumentIds.includes(d.id)).map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span className="font-medium">{d.name}</span>
                    <span className="text-slate-400">({d.filename})</span>
                    {templateDocIds.includes(d.id) && (
                      <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">template</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-between">
            <button onClick={() => setStep('customize')} className="text-slate-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">← Back</button>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSchedulePicker(true)}
                className="border border-slate-300 hover:border-slate-400 text-slate-600 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Schedule
              </button>
              <button
                onClick={() => void handleSend()}
                disabled={sending}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
              >
                {sending ? 'Sending…' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {step === 'result' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          {scheduled ? (
            <>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Emails scheduled</h3>
                  <p className="text-slate-500 text-sm">
                    Will send on {new Date(scheduleDateTime).toLocaleString()} · view or cancel in <a href="/scheduled" className="text-indigo-600 hover:underline">Scheduled</a>
                  </p>
                </div>
              </div>
              <button onClick={reset} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-2.5 rounded-lg transition-colors">
                Schedule another batch
              </button>
            </>
          ) : result ? (
            <>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Send complete</h3>
                  <p className="text-slate-500 text-sm">{result.sent} sent · {result.failed} failed · {result.total} total</p>
                </div>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {result.results.map((r, i) => (
                  <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${r.status === 'sent' ? 'bg-green-50' : 'bg-red-50'}`}>
                    <span className={r.status === 'sent' ? 'text-green-700' : 'text-red-700'}>{r.email}</span>
                    <div className="text-right">
                      <span className={`font-medium ${r.status === 'sent' ? 'text-green-600' : 'text-red-600'}`}>{r.status}</span>
                      {r.error && <p className="text-xs text-red-500">{r.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={reset} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-2.5 rounded-lg transition-colors">
                Send another batch
              </button>
            </>
          ) : null}
        </div>
      )}
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col mt-2">
          <div className="bg-slate-50/80 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              New Message
            </h2>
          </div>
          {quickStatus && (
            <div className={`mx-5 mt-4 px-4 py-3 rounded-lg text-sm ${quickStatus.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'}`}>
              {quickStatus.msg}
            </div>
          )}
          <div className="flex flex-col flex-1">
            <div className="flex items-center px-5 py-3 border-b border-slate-100 focus-within:bg-slate-50/50 transition-colors relative">
              <span className="text-slate-400 text-sm font-medium w-16">To:</span>
              <input 
                type="email" 
                value={quickTo} 
                onChange={e => {
                  setQuickTo(e.target.value);
                  setShowQuickEmailSuggestions(true);
                }} 
                onFocus={() => { if (quickTo.length >= 2) setShowQuickEmailSuggestions(true); }}
                onBlur={() => setTimeout(() => setShowQuickEmailSuggestions(false), 200)}
                className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 placeholder-slate-300 focus:ring-0 p-0" 
                placeholder="recipient@example.com" 
              />
              {showQuickEmailSuggestions && quickEmailSuggestions.length > 0 && (
                <div className="absolute top-full left-16 mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-10 overflow-hidden">
                  {quickEmailSuggestions.map(p => (
                    <div 
                      key={p.id} 
                      className="px-4 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0"
                      onMouseDown={(e) => {
                        e.preventDefault(); // prevent blur from firing before click
                        setQuickTo(p.email);
                        setShowQuickEmailSuggestions(false);
                      }}
                    >
                      <div className="text-sm font-medium text-slate-800">{p.first_name} {p.last_name}</div>
                      <div className="text-xs text-slate-500">{p.email}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center px-5 py-3 border-b border-slate-100 focus-within:bg-slate-50/50 transition-colors">
              <span className="text-slate-400 text-sm font-medium w-16">Subject:</span>
              <input type="text" value={quickSubject} onChange={e => setQuickSubject(e.target.value)} className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 placeholder-slate-300 focus:ring-0 p-0" placeholder="Email subject..." />
            </div>
            <div className="p-5 flex-1 focus-within:bg-slate-50/30 transition-colors">
              <textarea value={quickBody} onChange={e => setQuickBody(e.target.value)} className="w-full bg-transparent border-none outline-none text-sm text-slate-800 placeholder-slate-300 focus:ring-0 p-0 resize-none min-h-[240px]" placeholder="Type your message here..."></textarea>
            </div>
            {(quickAttachments.length > 0 || quickSelectedDocumentIds.length > 0) && (
              <div className="px-5 pb-4 flex flex-wrap gap-2">
                {quickAttachments.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-100 border border-slate-200 text-slate-600 text-xs px-2.5 py-1.5 rounded-md">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    <span className="max-w-[150px] truncate" title={f.name}>{f.name}</span>
                    <button onClick={() => setQuickAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500 ml-1 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
                {documents.filter(d => quickSelectedDocumentIds.includes(d.id)).map(doc => (
                  <div key={doc.id} className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs px-2.5 py-1.5 rounded-md">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    <span className="max-w-[150px] truncate" title={doc.name}>{doc.name}</span>
                    <button onClick={() => setQuickSelectedDocumentIds(prev => prev.filter(id => id !== doc.id))} className="text-indigo-400 hover:text-indigo-600 ml-1 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="bg-slate-50/80 px-5 py-4 border-t border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-4 relative">
              <div className="text-xs text-slate-400 font-medium hidden sm:block">
                All fields are required
              </div>
              <button onClick={() => quickFileInputRef.current?.click()} className="text-slate-400 hover:text-indigo-600 transition-colors p-1 flex items-center gap-1 text-sm font-medium" title="Upload Files">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                <span className="hidden sm:inline">Upload</span>
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
              
              <button onClick={() => setShowQuickDocsPicker(!showQuickDocsPicker)} className="text-slate-400 hover:text-indigo-600 transition-colors p-1 flex items-center gap-1 text-sm font-medium" title="Attach from Profile">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                <span className="hidden sm:inline">Profile Files</span>
              </button>

              {showQuickDocsPicker && (
                <div className="absolute bottom-full left-0 mb-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-10">
                  <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-semibold text-slate-800 text-sm">Select Documents</h3>
                    <button onClick={() => setShowQuickDocsPicker(false)} className="text-slate-400 hover:text-slate-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                    {documents.length === 0 ? (
                      <div className="p-3 text-sm text-slate-500 text-center">No documents in profile</div>
                    ) : (
                      documents.map(doc => (
                        <label key={doc.id} className="flex items-center gap-3 rounded px-2 py-2 cursor-pointer hover:bg-slate-50 transition-colors">
                          <input
                            type="checkbox"
                            checked={quickSelectedDocumentIds.includes(doc.id)}
                            onChange={(e) => {
                              if (e.target.checked) setQuickSelectedDocumentIds(p => [...p, doc.id]);
                              else setQuickSelectedDocumentIds(p => p.filter(id => id !== doc.id));
                            }}
                            className="rounded border-slate-300 text-indigo-600 w-4 h-4 flex-shrink-0"
                          />
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="text-sm text-slate-700 truncate">{doc.name}</span>
                            {doc.drive_url && (
                              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium">Drive</span>
                            )}
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 w-full sm:w-auto justify-end relative">
              <button
                onClick={() => setShowSchedulePicker(!showSchedulePicker)}
                className="bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 text-sm font-medium px-4 py-2 rounded-lg transition-all flex items-center gap-2 shadow-sm"
              >
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Schedule
              </button>
              <button
                onClick={() => void handleQuickSend()}
                disabled={sending}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-all shadow-sm flex items-center gap-2"
              >
                {sending ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sending...
                  </span>
                ) : (
                  <>
                    <span>Send Now</span>
                    <svg className="w-4 h-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </>
                )}
              </button>

            {showSchedulePicker && (
              <div className="absolute bottom-full right-0 mb-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-10">
                <div className="p-3 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-800 text-sm">Schedule Quick Email</h3>
                </div>
                <div className="p-2 space-y-1">
                  {getQuickScheduleOptions().map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => void handleQuickSchedule(opt.isoString)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <div className="text-sm font-medium text-slate-700">{opt.label}</div>
                      <div className="text-xs text-slate-500">{opt.sublabel}</div>
                    </button>
                  ))}
                  <button
                    onClick={() => { setShowCustomPicker(true); setShowSchedulePicker(false); }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="text-sm font-medium text-slate-700">Custom date & time</div>
                  </button>
                </div>
              </div>
            )}
            
            {showCustomPicker && (
              <div className="absolute bottom-full right-0 mb-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-10 space-y-4">
                <h3 className="font-semibold text-slate-800 text-sm">Custom Schedule</h3>
                <input
                  type="datetime-local"
                  value={scheduleDateTime}
                  onChange={(e) => setScheduleDateTime(e.target.value)}
                  className="input text-sm"
                  min={localDatetimeDefault()}
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowCustomPicker(false)} className="flex-1 border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-medium">Cancel</button>
                  <button
                    onClick={() => void handleQuickSchedule()}
                    disabled={scheduling}
                    className="flex-1 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-60"
                  >
                    {scheduling ? '...' : 'Schedule'}
                  </button>
                </div>
              </div>
            )}
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
    <div className="space-y-1.5 max-h-56 overflow-y-auto border border-slate-200 rounded-lg p-3">
      {prospects.map((p) => (
        <label key={p.id} className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded p-1">
          <input
            type="checkbox"
            checked={selected.includes(p.id)}
            onChange={() => onToggle(p.id)}
            className="rounded border-slate-300 text-indigo-600"
          />
          <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">
            {prospectFullName(p)}
            {showCompany && (p as unknown as { company?: { name: string } }).company?.name && (
              <span className="text-slate-400 ml-1">· {(p as unknown as { company: { name: string } }).company.name}</span>
            )}
          </span>
          <span className="text-xs text-slate-400 hidden sm:inline truncate max-w-[140px]">{p.email}</span>
          {p.role_category && (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
              p.role_category === 'engineer' ? 'bg-blue-100 text-blue-700' :
              p.role_category === 'hr'       ? 'bg-purple-100 text-purple-700' :
                                               'bg-slate-100 text-slate-500'
            }`}>
              {p.role_category === 'engineer' ? 'Eng' : p.role_category === 'hr' ? 'HR' : 'Other'}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}
