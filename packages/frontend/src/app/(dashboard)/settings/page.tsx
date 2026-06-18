'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { CrmUser, Document, VariablePreset, VariableSource } from '@/lib/types';
import { PROSPECT_FIELDS, COMPANY_FIELDS, SENDER_FIELDS, toVariableLabel } from '@/lib/types';

// ─── constants ────────────────────────────────────────────────────────────────

const SOURCE_OPTIONS: { value: VariableSource; label: string; description: string }[] = [
  { value: 'prospect', label: 'Prospect field', description: 'Pulled from the prospect record' },
  { value: 'company',  label: 'Company field',  description: 'Pulled from the company record' },
  { value: 'sender',   label: 'Sender (your profile)', description: 'Pulled from your user profile' },
  { value: 'static',   label: 'Static value',   description: 'Same fixed value every time' },
  { value: 'custom',   label: 'Custom (per send)', description: 'You fill it in when sending' },
];

const EMPTY_PRESET = {
  key: '',
  label: '',
  source: 'prospect' as VariableSource,
  field: '',
  default_value: '',
};

type Section = 'profile' | 'documents' | 'variables';

const NAV: { id: Section; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Your sender details',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    id: 'documents',
    label: 'Documents',
    description: 'Attachments for email sends',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'variables',
    label: 'Template Variables',
    description: 'Auto-wired variable presets',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
  },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6 pb-5 border-b border-slate-100">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500 mt-0.5">{description}</p>
    </div>
  );
}

function Alert({ type, message }: { type: 'error' | 'success'; message: string }) {
  const styles = type === 'error'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-green-50 border-green-200 text-green-700';
  return (
    <div className={`border rounded-lg px-4 py-3 text-sm mb-4 ${styles}`}>{message}</div>
  );
}

// ─── documents section ────────────────────────────────────────────────────────

function DocumentsSection() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  useEffect(() => {
    api.documents.list().then((r) => setDocuments(r.data)).catch(console.error);
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    if (!name.trim()) {
      setName(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
    }
  }

  async function handleUpload() {
    if (!pendingFile) { fileRef.current?.click(); return; }
    if (!name.trim()) { setError('Please enter a label for this document'); return; }
    setError(''); setSuccess(''); setUploading(true);
    try {
      const r = await api.documents.upload(pendingFile, name.trim());
      setDocuments((prev) => [r.data, ...prev]);
      setSuccess(`"${r.data.name}" uploaded.`);
      setName(''); setPendingFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally { setUploading(false); }
  }

  async function handleDelete(id: string, docName: string) {
    if (!confirm(`Remove "${docName}"?`)) return;
    setError(''); setSuccess('');
    try {
      await api.documents.delete(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setSuccess(`"${docName}" removed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div>
      <SectionHeader
        title="Documents"
        description="Upload resumes, cover letters, portfolios, or any file you attach to outreach emails. Label each one so you can pick the right combination per send."
      />

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {/* Upload form */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 mb-5">
        <p className="text-sm font-medium text-slate-700">Add a document</p>

        <div>
          <label className="form-label">Label *</label>
          <input
            className="form-input"
            placeholder="e.g. Backend Resume, Cover Letter – Stripe"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="form-label">
            File * <span className="text-slate-400 font-normal">(PDF, DOC, DOCX · max 10 MB)</span>
          </label>
          {pendingFile ? (
            <div className="flex items-center gap-3 px-3 py-2 border border-indigo-200 bg-indigo-50 rounded-lg text-sm">
              <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="flex-1 truncate text-slate-700">{pendingFile.name}</span>
              <button
                onClick={() => { setPendingFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                className="text-slate-400 hover:text-red-500 transition-colors"
              >✕</button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 w-full border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-lg px-4 py-3 text-sm text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Choose file
            </button>
          )}
        </div>

        <button
          onClick={() => void handleUpload()}
          disabled={uploading || !pendingFile || !name.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {uploading ? 'Uploading…' : 'Upload document'}
        </button>
      </div>

      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileChange} />

      {/* List */}
      {documents.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-6">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{doc.name}</p>
                <p className="text-xs text-slate-400 truncate">
                  {doc.filename}
                  {doc.size ? ` · ${formatBytes(doc.size)}` : ''}
                  {' · '}
                  {new Date(doc.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                </p>
              </div>
              <button
                onClick={() => void handleDelete(doc.id, doc.name)}
                className="text-sm text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors flex-shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── profile section ──────────────────────────────────────────────────────────

function ProfileSection() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [user, setUser] = useState<CrmUser | null>(null);
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '',
    current_company: '', job_title: '', phone: '', website: '', bio: '',
  });
  const [gmailForm, setGmailForm] = useState({ from_name: '', reply_to_email: '' });
  const [saving, setSaving] = useState(false);
  const [gmailSaving, setGmailSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [gmailError, setGmailError] = useState('');
  const [gmailSuccess, setGmailSuccess] = useState('');

  const loadUser = useCallback(() => {
    api.auth.me().then((r) => {
      setUser(r.user);
      setForm({
        first_name:       r.user.first_name       ?? '',
        last_name:        r.user.last_name        ?? '',
        email:            r.user.email            ?? '',
        current_company:  r.user.current_company  ?? '',
        job_title:        r.user.job_title        ?? '',
        phone:            r.user.phone            ?? '',
        website:          r.user.website          ?? '',
        bio:              r.user.bio              ?? '',
      });
      setGmailForm({
        from_name:      r.user.from_name      ?? '',
        reply_to_email: r.user.reply_to_email ?? '',
      });
    }).catch(console.error);
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Handle return from Google OAuth
  useEffect(() => {
    const gmailParam = searchParams.get('gmail');
    if (!gmailParam) return;
    // Clean up the URL
    router.replace('/settings');
    if (gmailParam === 'connected') {
      setGmailSuccess('Gmail connected successfully.');
      loadUser();
    } else if (gmailParam === 'error') {
      const reason = searchParams.get('reason') ?? 'unknown error';
      setGmailError(`Gmail connection failed: ${reason.replace(/_/g, ' ')}`);
    }
  }, [searchParams, router, loadUser]);

  async function handleSave() {
    setSaving(true); setError(''); setSuccess('');
    try {
      const r = await api.auth.updateProfile({
        first_name:      form.first_name.trim()      || null,
        last_name:       form.last_name.trim()       || null,
        email:           form.email.trim()           || null,
        current_company: form.current_company.trim() || null,
        job_title:       form.job_title.trim()       || null,
        phone:           form.phone.trim()           || null,
        website:         form.website.trim()         || null,
        bio:             form.bio.trim()             || null,
      });
      setUser(r.user);
      setSuccess('Profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally { setSaving(false); }
  }

  async function handleGmailSettingsSave() {
    setGmailSaving(true); setGmailError(''); setGmailSuccess('');
    try {
      const r = await api.auth.updateProfile({
        from_name:      gmailForm.from_name.trim()      || null,
        reply_to_email: gmailForm.reply_to_email.trim() || null,
      });
      setUser(r.user);
      setGmailSuccess('Settings saved.');
    } catch (err) {
      setGmailError(err instanceof Error ? err.message : 'Save failed');
    } finally { setGmailSaving(false); }
  }

  async function handleGmailConnect() {
    setConnecting(true); setGmailError('');
    try {
      const { url } = await api.auth.gmailConnect();
      window.location.href = url;
    } catch (err) {
      setGmailError(err instanceof Error ? err.message : 'Could not start Gmail connection');
      setConnecting(false);
    }
  }

  async function handleGmailDisconnect() {
    if (!confirm('Disconnect Gmail? You will not be able to send emails until you reconnect.')) return;
    setDisconnecting(true); setGmailError('');
    try {
      await api.auth.gmailDisconnect();
      setGmailSuccess('Gmail disconnected.');
      loadUser();
    } catch (err) {
      setGmailError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally { setDisconnecting(false); }
  }

  function field(id: keyof typeof form, label: string, placeholder?: string, multiline?: boolean) {
    return (
      <div>
        <label className="form-label">{label}</label>
        {multiline ? (
          <textarea
            className="form-input"
            rows={3}
            placeholder={placeholder}
            value={form[id]}
            onChange={(e) => setForm((prev) => ({ ...prev, [id]: e.target.value }))}
          />
        ) : (
          <input
            className="form-input"
            placeholder={placeholder}
            value={form[id]}
            onChange={(e) => setForm((prev) => ({ ...prev, [id]: e.target.value }))}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <SectionHeader
        title="Your Profile"
        description="These details are available as {{sender…}} variables in email templates — e.g. {{myFirstName}} can map to your First Name."
      />

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {user && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {user.username[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">{user.username}</p>
            <p className="text-xs text-slate-400 capitalize">{user.role}</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field('first_name', 'First name', 'Jane')}
          {field('last_name', 'Last name', 'Smith')}
        </div>
        {field('email', 'Email address', 'jane@example.com')}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field('current_company', 'Current company', 'Acme Inc.')}
          {field('job_title', 'Job title', 'Software Engineer')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field('phone', 'Phone', '+1 555-000-0000')}
          {field('website', 'Website', 'https://yoursite.com')}
        </div>
        {field('bio', 'Bio / signature blurb', 'A short note about yourself…', true)}
      </div>

      <div className="mt-5 pt-5 border-t border-slate-100">
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 mb-4">
          <p className="text-xs font-medium text-indigo-700 mb-1">Using profile fields in templates</p>
          <p className="text-xs text-indigo-600">
            Go to <strong>Template Variables</strong> and add a preset with source "Sender (your profile)", then pick the field.
            Use it as <code className="bg-white/60 px-1 rounded">{`{{myFirstName}}`}</code> (or any key you choose) in any template.
          </p>
        </div>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>

      {/* Gmail OAuth */}
      <div className="mt-8 pt-6 border-t border-slate-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.909 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
              </svg>
              <h3 className="text-sm font-semibold text-slate-800">Gmail sending account</h3>
              {user?.has_gmail_configured
                ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Connected</span>
                : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Not connected</span>
              }
            </div>
            <p className="text-xs text-slate-500">
              {user?.has_gmail_configured
                ? <>Sending as <span className="font-medium text-slate-700">{user.gmail_user}</span></>
                : 'Connect your Gmail account to send emails. Required before sending.'}
            </p>
          </div>
          <div className="flex-shrink-0 ml-4">
            {user?.has_gmail_configured ? (
              <button
                onClick={() => void handleGmailDisconnect()}
                disabled={disconnecting}
                className="text-sm text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            ) : (
              <button
                onClick={() => void handleGmailConnect()}
                disabled={connecting}
                className="flex items-center gap-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {connecting ? 'Redirecting…' : (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.909 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
                    </svg>
                    Connect Gmail
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {gmailError && <Alert type="error" message={gmailError} />}
        {gmailSuccess && <Alert type="success" message={gmailSuccess} />}

        {user?.has_gmail_configured && (
          <div className="space-y-3 mt-4 pt-4 border-t border-slate-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label">Display name</label>
                <input
                  className="form-input"
                  placeholder="Jane Smith"
                  value={gmailForm.from_name}
                  onChange={(e) => setGmailForm((prev) => ({ ...prev, from_name: e.target.value }))}
                />
                <p className="text-xs text-slate-400 mt-1">Shown as sender name in recipients' inboxes</p>
              </div>
              <div>
                <label className="form-label">Reply-to address</label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="you@example.com"
                  value={gmailForm.reply_to_email}
                  onChange={(e) => setGmailForm((prev) => ({ ...prev, reply_to_email: e.target.value }))}
                />
                <p className="text-xs text-slate-400 mt-1">Optional — defaults to your Gmail address</p>
              </div>
            </div>
            <button
              onClick={() => void handleGmailSettingsSave()}
              disabled={gmailSaving}
              className="bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {gmailSaving ? 'Saving…' : 'Save Gmail settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── variable presets section ─────────────────────────────────────────────────

function VariablesSection() {
  const [presets, setPresets] = useState<VariablePreset[]>([]);
  const [form, setForm] = useState(EMPTY_PRESET);
  const [editing, setEditing] = useState<VariablePreset | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.variablePresets.list().then((r) => setPresets(r.data)).catch(console.error);
  }, []);

  function openEdit(preset: VariablePreset) {
    setEditing(preset);
    setForm({ key: preset.key, label: preset.label, source: preset.source, field: preset.field ?? '', default_value: preset.default_value });
    setError('');
  }

  function cancelEdit() {
    setEditing(null);
    setForm(EMPTY_PRESET);
    setError('');
  }

  async function save() {
    if (!form.key.trim() || !form.label.trim()) { setError('Variable name and label are required'); return; }
    setSaving(true); setError('');
    try {
      const body = {
        key: form.key.trim(),
        label: form.label.trim(),
        source: form.source,
        field: form.field.trim() || null,
        default_value: form.default_value,
      };
      if (editing) {
        const r = await api.variablePresets.update(editing.id, body);
        setPresets((prev) => prev.map((p) => (p.id === r.data.id ? r.data : p)));
      } else {
        const r = await api.variablePresets.create(body);
        setPresets((prev) => [...prev, r.data].sort((a, b) => a.key.localeCompare(b.key)));
      }
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally { setSaving(false); }
  }

  async function remove(id: string, key: string) {
    if (!confirm(`Remove preset "${key}"?`)) return;
    try {
      await api.variablePresets.delete(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  const fieldOptions = form.source === 'prospect' ? PROSPECT_FIELDS : form.source === 'company' ? COMPANY_FIELDS : form.source === 'sender' ? SENDER_FIELDS : [];

  return (
    <div>
      <SectionHeader
        title="Template Variables"
        description={`Configure variable names once. When you write {{variableName}} in any template and click "Detect Variables", it auto-wires to the right field — no setup per template.`}
      />

      {error && <Alert type="error" message={error} />}

      {/* Form */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 mb-5">
        <p className="text-sm font-medium text-slate-700">
          {editing ? `Editing: ${editing.key}` : 'Add a variable preset'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">Variable name *</label>
            <input
              className="form-input font-mono"
              placeholder="e.g. firstName"
              value={form.key}
              disabled={!!editing}
              onChange={(e) => {
                const k = e.target.value;
                setForm((prev) => ({ ...prev, key: k, label: prev.label || toVariableLabel(k) }));
              }}
            />
            <p className="text-xs text-slate-400 mt-1">Used as <span className="font-mono">{`{{${form.key || 'name'}}}`}</span> in templates</p>
          </div>
          <div>
            <label className="form-label">Display label *</label>
            <input
              className="form-input"
              placeholder="e.g. First Name"
              value={form.label}
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">Source *</label>
            <select
              className="form-input"
              value={form.source}
              onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value as VariableSource, field: '' }))}
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">
              {SOURCE_OPTIONS.find((o) => o.value === form.source)?.description}
            </p>
          </div>

          {fieldOptions.length > 0 ? (
            <div>
              <label className="form-label">Database field</label>
              <select
                className="form-input"
                value={form.field}
                onChange={(e) => setForm((prev) => ({ ...prev, field: e.target.value }))}
              >
                <option value="">— select —</option>
                {fieldOptions.map((f) => (
                  <option key={f.value} value={f.value}>{f.label} ({f.value})</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="form-label">Default value</label>
              <input
                className="form-input"
                placeholder="Fallback when empty"
                value={form.default_value}
                onChange={(e) => setForm((prev) => ({ ...prev, default_value: e.target.value }))}
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : editing ? 'Update preset' : 'Add preset'}
          </button>
          {editing && (
            <button
              onClick={cancelEdit}
              className="text-sm text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Grouped list */}
      {presets.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-6">No presets yet. Add one above.</p>
      ) : (
        <>
          {(['prospect', 'company', 'sender', 'static', 'custom'] as VariableSource[]).map((src) => {
            const group = presets.filter((p) => p.source === src);
            if (group.length === 0) return null;
            const srcLabel = SOURCE_OPTIONS.find((o) => o.value === src)?.label ?? src;
            return (
              <div key={src} className="mb-5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{srcLabel}</p>
                <div className="space-y-1.5">
                  {group.map((preset) => (
                    <div key={preset.id} className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-mono">{`{{${preset.key}}}`}</code>
                          <span className="text-sm font-medium text-slate-800">{preset.label}</span>
                        </div>
                        {preset.field && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            → <span className="font-mono">{preset.field}</span>
                            {preset.default_value ? ` · default: "${preset.default_value}"` : ''}
                          </p>
                        )}
                        {!preset.field && preset.default_value && (
                          <p className="text-xs text-slate-400 mt-0.5">default: "{preset.default_value}"</p>
                        )}
                      </div>
                      <button
                        onClick={() => openEdit(preset)}
                        className="text-sm text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors flex-shrink-0"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void remove(preset.id, preset.key)}
                        className="text-sm text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors flex-shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [active, setActive] = useState<Section>('profile');
  const current = NAV.find((n) => n.id === active)!;

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Configure your CRM preferences</p>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        {/* Nav — horizontal scrolling tabs on mobile, sidebar on md+ */}
        <nav className="flex-shrink-0 md:w-52">
          <ul className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:pb-0 md:space-y-0.5">
            {NAV.map((item) => (
              <li key={item.id} className="flex-shrink-0 md:flex-shrink">
                <button
                  onClick={() => setActive(item.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors md:items-start md:gap-3 md:py-2.5 ${
                    active === item.id
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className={`flex-shrink-0 ${active === item.id ? 'text-indigo-600' : 'text-slate-400'}`}>
                    {item.icon}
                  </span>
                  <span>
                    <span className="block text-sm font-medium whitespace-nowrap md:whitespace-normal">{item.label}</span>
                    <span className="hidden md:block text-xs text-slate-400 mt-0.5">{item.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 p-6 min-w-0">
          {active === 'profile'   && <ProfileSection />}
          {active === 'documents' && <DocumentsSection />}
          {active === 'variables' && <VariablesSection />}
        </div>
      </div>
    </div>
  );
}
