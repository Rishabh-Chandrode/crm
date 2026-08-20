'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { CrmUser, Document, VariablePreset, VariableSource } from '@/lib/types';
import { PROSPECT_FIELDS, COMPANY_FIELDS, SENDER_FIELDS, toVariableLabel } from '@/lib/types';
import { useTheme } from '@/components/ThemeProvider';

// ─── constants ────────────────────────────────────────────────────────────────

const SOURCE_OPTIONS: { value: VariableSource; label: string; description: string }[] = [
  { value: 'prospect', label: 'Prospect field',        description: 'Pulled from the prospect record' },
  { value: 'company',  label: 'Company field',         description: 'Pulled from the company record' },
  { value: 'sender',   label: 'Sender (your profile)', description: 'Pulled from your user profile' },
  { value: 'static',   label: 'Static value',          description: 'Same fixed value every time' },
  { value: 'custom',   label: 'Custom (per send)',      description: 'You fill it in when sending' },
];

const EMPTY_PRESET = {
  key: '', label: '', source: 'prospect' as VariableSource, field: '', default_value: '',
};

type Section = 'appearance' | 'documents' | 'variables' | 'gmail';

const NAV: { id: Section; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme & display preferences',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
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
  {
    id: 'gmail',
    label: 'Gmail',
    description: 'Email sending configuration',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.909 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
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

// ─── shared sub-components ────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{description}</p>
    </div>
  );
}

function Alert({ type, message }: { type: 'error' | 'success'; message: string }) {
  const styles = type === 'error'
    ? 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300';
  return (
    <div className={`border rounded-xl px-3.5 py-2.5 text-xs mb-4 ${styles}`}>{message}</div>
  );
}

// ─── appearance section ───────────────────────────────────────────────────────

function AppearanceSection() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const themes: { id: 'light' | 'dark' | 'system'; title: string; desc: string; icon: React.ReactNode }[] = [
    {
      id: 'light',
      title: 'Light Theme',
      desc: 'Crisp, high-contrast light layout with neutral zinc accents',
      icon: (
        <svg className="w-4 h-4 text-zinc-600 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      id: 'dark',
      title: 'Dark Theme',
      desc: 'Deep zinc-950 dark background, minimal and easy on the eyes',
      icon: (
        <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ),
    },
    {
      id: 'system',
      title: 'System (Auto)',
      desc: 'Synchronizes automatically with your operating system preference',
      icon: (
        <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
  ];

  return (
    <div>
      <SectionHeader
        title="Appearance"
        description="Select your preferred theme or let CRM follow your device settings."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {themes.map((t) => {
          const isSelected = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={`text-left p-4 rounded-xl border transition-all relative flex flex-col justify-between cursor-pointer ${
                isSelected
                  ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-850 shadow-xs ring-1 ring-zinc-900 dark:ring-zinc-100'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    {t.icon}
                  </div>
                  {isSelected && (
                    <span className="w-4 h-4 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center text-[10px] font-bold">
                      ✓
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 mb-0.5">{t.title}</h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{t.desc}</p>
              </div>

              <div className="mt-4 pt-2.5 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[10px] text-zinc-400">
                <span>{t.id === 'system' ? `Current: ${resolvedTheme}` : t.id}</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{isSelected ? 'Active' : 'Select'}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
        <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>
            Active theme: <strong className="text-zinc-900 dark:text-zinc-100 capitalize">{theme}</strong> (resolved as <strong className="text-zinc-900 dark:text-zinc-100 capitalize">{resolvedTheme}</strong> mode).
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── gmail section ────────────────────────────────────────────────────────────

function GmailSection() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const [user, setUser] = useState<CrmUser | null>(null);
  const [gmailForm,  setGmailForm]  = useState({ from_name: '', reply_to_email: '' });
  const [appPwForm,  setAppPwForm]  = useState({ gmail_user: '', app_password: '' });
  const [gmailSaving,     setGmailSaving]     = useState(false);
  const [appPwSaving,     setAppPwSaving]     = useState(false);
  const [connecting,      setConnecting]      = useState(false);
  const [disconnecting,   setDisconnecting]   = useState(false);
  const [removingAppPw,   setRemovingAppPw]   = useState(false);
  const [showAppPwGuide,  setShowAppPwGuide]  = useState(false);
  const [gmailError,   setGmailError]   = useState('');
  const [gmailSuccess, setGmailSuccess] = useState('');

  const loadUser = useCallback(() => {
    api.auth.me().then((r) => {
      setUser(r.user);
      setGmailForm({
        from_name:      r.user.from_name      ?? '',
        reply_to_email: r.user.reply_to_email ?? '',
      });
    }).catch(console.error);
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  useEffect(() => {
    const gmailParam = searchParams.get('gmail');
    if (!gmailParam) return;
    router.replace('/settings?tab=gmail');
    if (gmailParam === 'connected') {
      setGmailSuccess('Gmail connected successfully.');
      loadUser();
    } else if (gmailParam === 'error') {
      const reason = searchParams.get('reason') ?? 'unknown error';
      setGmailError(`Gmail connection failed: ${reason.replace(/_/g, ' ')}`);
    }
  }, [searchParams, router, loadUser]);

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
    if (!confirm('Disconnect Gmail OAuth? You will not be able to send emails via OAuth until you reconnect.')) return;
    setDisconnecting(true); setGmailError('');
    try {
      await api.auth.gmailDisconnect();
      setGmailSuccess('Gmail OAuth disconnected.');
      loadUser();
    } catch (err) {
      setGmailError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally { setDisconnecting(false); }
  }

  async function handleAppPwSave() {
    setAppPwSaving(true); setGmailError(''); setGmailSuccess('');
    try {
      await api.auth.gmailSaveAppPassword(appPwForm.gmail_user.trim(), appPwForm.app_password.trim());
      setGmailSuccess('App password saved. Gmail is now connected via App Password.');
      setAppPwForm({ gmail_user: '', app_password: '' });
      loadUser();
    } catch (err) {
      setGmailError(err instanceof Error ? err.message : 'Save failed');
    } finally { setAppPwSaving(false); }
  }

  async function handleAppPwRemove() {
    if (!confirm('Remove app password? You will not be able to send emails until you reconnect.')) return;
    setRemovingAppPw(true); setGmailError('');
    try {
      await api.auth.gmailRemoveAppPassword();
      setGmailSuccess('App password removed.');
      loadUser();
    } catch (err) {
      setGmailError(err instanceof Error ? err.message : 'Remove failed');
    } finally { setRemovingAppPw(false); }
  }

  return (
    <div>
      <SectionHeader
        title="Gmail"
        description="Connect your Gmail account to send emails directly from the CRM."
      />

      <div className="flex items-center gap-2 mb-4">
        {user?.has_gmail_configured
          ? <span className="text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded font-medium">Active · OAuth</span>
          : user?.has_gmail_app_password
          ? <span className="text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded font-medium">Active · App Password</span>
          : <span className="text-[11px] bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 rounded font-medium">Not connected</span>
        }
        {user && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {user.has_gmail_app_password && !user.has_gmail_configured
              ? <>Sending as <strong className="text-zinc-800 dark:text-zinc-200">{user.gmail_user}</strong> via App Password</>
              : user.has_gmail_configured
              ? <>Sending as <strong className="text-zinc-800 dark:text-zinc-200">{user.gmail_user}</strong> via OAuth</>
              : 'Connect Gmail to enable email sending.'}
          </span>
        )}
      </div>

      {gmailError   && <Alert type="error"   message={gmailError} />}
      {gmailSuccess && <Alert type="success" message={gmailSuccess} />}

      {/* Option 1 — App Password */}
      <div className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 rounded-xl p-4 mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Option 1 — Gmail App Password</p>
              <span className="text-[10px] bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-1.5 py-0.5 rounded font-medium">Recommended</span>
              {user?.has_gmail_app_password && !user?.has_gmail_configured && (
                <span className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-1.5 py-0.5 rounded font-medium">Active</span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">No app verification needed. Works immediately with any Google account that has 2-Step Verification enabled.</p>
          </div>
          {user?.has_gmail_app_password && (
            <button
              onClick={() => void handleAppPwRemove()}
              disabled={removingAppPw}
              className="btn-destructive text-xs py-1 px-2.5"
            >
              {removingAppPw ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>

        <button
          onClick={() => setShowAppPwGuide((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:underline font-medium mb-3 transition-colors"
        >
          <svg className={`w-3.5 h-3.5 transition-transform ${showAppPwGuide ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {showAppPwGuide ? 'Hide setup guide' : 'How to set up an App Password'}
        </button>

        {showAppPwGuide && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 mb-3 space-y-2.5 text-xs">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide text-[10px]">Setup guide — takes ~2 minutes</p>
            {[
              {
                n: 1,
                title: 'Enable 2-Step Verification',
                body: "App Passwords require 2-Step Verification to be turned on. Go to your Google Account → Security → 2-Step Verification and enable it if you haven't already.",
                link: 'https://myaccount.google.com/security',
                linkLabel: 'Open Google Security settings →',
              },
              {
                n: 2,
                title: 'Open App Passwords',
                body: 'In the same Security page, search for "App passwords" or go directly to the link below. You may need to sign in again.',
                link: 'https://myaccount.google.com/apppasswords',
                linkLabel: 'Open App Passwords →',
              },
              {
                n: 3,
                title: 'Create a new App Password',
                body: 'In the "App name" field type something like "Outreach CRM", then click Create. Google will show you a 16-character password.',
              },
              {
                n: 4,
                title: 'Paste it below',
                body: 'Copy the 16-character password (spaces are optional) and paste it into the App Password field below along with your Gmail address. Click Save.',
              },
            ].map((step) => (
              <div key={step.n} className="flex gap-2.5">
                <div className="w-4 h-4 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {step.n}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs mb-0.5">{step.title}</p>
                  <p className="text-zinc-500 dark:text-zinc-400 text-[11px]">{step.body}</p>
                  {'link' in step && step.link && (
                    <a href={step.link} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-zinc-800 dark:text-zinc-200 hover:underline mt-0.5 inline-block font-medium">
                      {step.linkLabel}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label text-xs">Gmail address</label>
              <input
                className="form-input text-xs"
                type="email"
                placeholder="you@gmail.com"
                value={appPwForm.gmail_user}
                onChange={(e) => setAppPwForm((prev) => ({ ...prev, gmail_user: e.target.value }))}
              />
            </div>
            <div>
              <label className="form-label text-xs">App Password</label>
              <input
                className="form-input text-xs font-mono tracking-widest"
                type="password"
                placeholder="xxxx xxxx xxxx xxxx"
                value={appPwForm.app_password}
                onChange={(e) => setAppPwForm((prev) => ({ ...prev, app_password: e.target.value }))}
                autoComplete="new-password"
              />
            </div>
          </div>
          <button
            onClick={() => void handleAppPwSave()}
            disabled={appPwSaving || !appPwForm.gmail_user.trim() || !appPwForm.app_password.trim()}
            className="btn-primary"
          >
            {appPwSaving ? 'Saving…' : user?.has_gmail_app_password ? 'Update App Password' : 'Save App Password'}
          </button>
        </div>
      </div>

      {/* Option 2 — OAuth */}
      <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl p-4 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Option 2 — Google OAuth</p>
              {user?.has_gmail_configured && (
                <span className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-1.5 py-0.5 rounded font-medium">Active</span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Connects directly via your Google account consent screen.</p>
          </div>
          <div className="flex-shrink-0 ml-2">
            {user?.has_gmail_configured ? (
              <button
                onClick={() => void handleGmailDisconnect()}
                disabled={disconnecting}
                className="btn-destructive text-xs py-1 px-2.5"
              >
                {disconnecting ? 'Removing…' : 'Disconnect'}
              </button>
            ) : (
              <button
                onClick={() => void handleGmailConnect()}
                disabled={connecting}
                className="btn-secondary text-xs"
              >
                {connecting ? 'Redirecting…' : 'Connect via Google'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sending preferences */}
      {(user?.has_gmail_configured || user?.has_gmail_app_password) && (
        <div className="space-y-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Sending preferences</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label text-xs">Display name</label>
              <input
                className="form-input text-xs"
                placeholder={user?.username ?? 'Your Name'}
                value={gmailForm.from_name}
                onChange={(e) => setGmailForm((prev) => ({ ...prev, from_name: e.target.value }))}
              />
              <p className="text-[11px] text-zinc-400 mt-1">Shown as sender name in outreach emails</p>
            </div>
            <div>
              <label className="form-label text-xs">Reply-to address</label>
              <input
                className="form-input text-xs"
                type="email"
                placeholder="you@example.com"
                value={gmailForm.reply_to_email}
                onChange={(e) => setGmailForm((prev) => ({ ...prev, reply_to_email: e.target.value }))}
              />
              <p className="text-[11px] text-zinc-400 mt-1">Optional — defaults to your connected email</p>
            </div>
          </div>
          <button
            onClick={() => void handleGmailSettingsSave()}
            disabled={gmailSaving}
            className="btn-primary"
          >
            {gmailSaving ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── documents section ────────────────────────────────────────────────────────

function DocumentsSection() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [name, setName]           = useState('');
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [showDrive, setShowDrive]     = useState(false);
  const [driveName, setDriveName]     = useState('');
  const [driveUrl, setDriveUrl]       = useState('');
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError]   = useState('');

  useEffect(() => {
    api.documents.list().then((r) => setDocuments(r.data)).catch(console.error);
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
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

  async function handleAddFromDrive() {
    if (!driveName.trim() || !driveUrl.trim()) return;
    setDriveError('');
    setDriveLoading(true);
    try {
      const r = await api.documents.fromDrive(driveName.trim(), driveUrl.trim());
      setDocuments((prev) => [r.data, ...prev]);
      setSuccess(`"${r.data.name}" linked from Drive.`);
      setDriveName(''); setDriveUrl(''); setShowDrive(false);
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Failed to fetch from Drive');
    } finally { setDriveLoading(false); }
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
        description="Upload resumes, cover letters, and portfolios to attach to outreach emails. Drive-linked files re-sync every 2 hours automatically."
      />

      {error   && <Alert type="error"   message={error} />}
      {success && <Alert type="success" message={success} />}

      {/* Upload card */}
      <div className="bg-zinc-50/50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3 mb-4">
        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Upload a file</p>
        <div>
          <label className="form-label text-xs">Label *</label>
          <input
            className="form-input text-xs"
            placeholder="e.g. Backend Resume, Cover Letter – Stripe"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label text-xs">
            File * <span className="text-zinc-400 font-normal">(PDF, DOC, DOCX · max 10 MB)</span>
          </label>
          {pendingFile ? (
            <div className="flex items-center gap-2.5 px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-lg text-xs">
              <svg className="w-4 h-4 text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="flex-1 truncate text-zinc-800 dark:text-zinc-200 font-medium">{pendingFile.name}</span>
              <button
                onClick={() => { setPendingFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                className="text-zinc-400 hover:text-rose-500 transition-colors p-1"
              >✕</button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-2 w-full border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 rounded-lg px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors bg-white/50 dark:bg-zinc-900/30"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Choose file to upload
            </button>
          )}
        </div>
        <button
          onClick={() => void handleUpload()}
          disabled={uploading || !pendingFile || !name.trim()}
          className="btn-primary"
        >
          {uploading ? 'Uploading…' : 'Upload document'}
        </button>
      </div>

      {/* Drive link */}
      <div className="bg-zinc-50/50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mb-4">
        <button
          onClick={() => { setShowDrive((v) => !v); setDriveError(''); }}
          className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors w-full text-left cursor-pointer"
        >
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.28 3l5.74 9.94L6.28 21H2.1l5.74-9.94L2.1 3h4.18zm7.44 0l5.74 9.94-5.74 9.06h-4.18l5.74-9.06L9.54 3h4.18z"/>
          </svg>
          Link from Google Drive / Docs
          <svg className={`w-3.5 h-3.5 text-zinc-400 ml-auto transition-transform ${showDrive ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showDrive && (
          <div className="mt-3 space-y-2.5 pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Paste a public Google Drive or Google Docs link. The document will be cached locally and synced periodically.
            </p>
            <div>
              <label className="form-label text-xs">Label *</label>
              <input
                className="form-input text-xs"
                placeholder="e.g. My Resume"
                value={driveName}
                onChange={(e) => setDriveName(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label text-xs">Google Drive URL *</label>
              <input
                className="form-input text-xs"
                placeholder="https://drive.google.com/file/d/… or docs.google.com/document/d/…"
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
              />
            </div>
            {driveError && <p className="text-xs text-rose-600 dark:text-rose-400">{driveError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => void handleAddFromDrive()}
                disabled={driveLoading || !driveName.trim() || !driveUrl.trim()}
                className="btn-primary"
              >
                {driveLoading ? 'Fetching…' : 'Fetch & save'}
              </button>
              <button
                onClick={() => { setShowDrive(false); setDriveError(''); setDriveName(''); setDriveUrl(''); }}
                className="btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileChange} />

      {documents.length === 0 ? (
        <p className="text-zinc-400 text-xs text-center py-6">No documents added yet.</p>
      ) : (
        <div className="space-y-1.5">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 px-3.5 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-850/60 transition-colors">
              <div className="w-7 h-7 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0 text-zinc-600 dark:text-zinc-300">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{doc.name}</p>
                  {doc.drive_url && (
                    <span className="flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-1.5 py-0.2 rounded flex-shrink-0 font-medium">
                      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6.28 3l5.74 9.94L6.28 21H2.1l5.74-9.94L2.1 3h4.18zm7.44 0l5.74 9.94-5.74 9.06h-4.18l5.74-9.06L9.54 3h4.18z"/>
                      </svg>
                      Drive
                    </span>
                  )}
                  {doc.drive_sync_error && (
                    <span className="text-[10px] text-rose-500" title={doc.drive_sync_error}>sync error</span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                  {doc.filename}
                  {doc.size ? ` · ${formatBytes(doc.size)}` : ''}
                  {doc.drive_url && doc.drive_synced_at
                    ? ` · synced ${new Date(doc.drive_synced_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}`
                    : ` · ${new Date(doc.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}`}
                </p>
              </div>
              <button
                onClick={() => void handleDelete(doc.id, doc.name)}
                className="text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline px-2 py-1 rounded transition-colors flex-shrink-0"
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

// ─── variable presets section ─────────────────────────────────────────────────

function VariablesSection() {
  const [presets, setPresets] = useState<VariablePreset[]>([]);
  const [form, setForm]       = useState(EMPTY_PRESET);
  const [editing, setEditing] = useState<VariablePreset | null>(null);
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    api.variablePresets.list().then((r) => setPresets(r.data)).catch(console.error);
  }, []);

  function openEdit(preset: VariablePreset) {
    setEditing(preset);
    setForm({ key: preset.key, label: preset.label, source: preset.source, field: preset.field ?? '', default_value: preset.default_value });
    setError('');
  }

  function cancelEdit() { setEditing(null); setForm(EMPTY_PRESET); setError(''); }

  async function save() {
    if (!form.key.trim() || !form.label.trim()) { setError('Variable name and label are required'); return; }
    setSaving(true); setError('');
    try {
      const body = {
        key: form.key.trim(), label: form.label.trim(), source: form.source,
        field: form.field.trim() || null, default_value: form.default_value,
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

  const fieldOptions = form.source === 'prospect' ? PROSPECT_FIELDS
    : form.source === 'company' ? COMPANY_FIELDS
    : form.source === 'sender'  ? SENDER_FIELDS
    : [];

  return (
    <div>
      <SectionHeader
        title="Template Variables"
        description={`Configure variable presets. When you write {{variableName}} in any template and click "Detect Variables", it auto-wires to the right field.`}
      />

      {error && <Alert type="error" message={error} />}

      <div className="bg-zinc-50/50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3 mb-4">
        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
          {editing ? `Editing: ${editing.key}` : 'Add a variable preset'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label text-xs">Variable name *</label>
            <input
              className="form-input text-xs font-mono"
              placeholder="e.g. firstName"
              value={form.key}
              disabled={!!editing}
              onChange={(e) => {
                const k = e.target.value;
                setForm((prev) => ({ ...prev, key: k, label: prev.label || toVariableLabel(k) }));
              }}
            />
            <p className="text-[11px] text-zinc-400 mt-1">Used as <span className="font-mono text-zinc-800 dark:text-zinc-200">{`{{${form.key || 'name'}}}`}</span> in templates</p>
          </div>
          <div>
            <label className="form-label text-xs">Display label *</label>
            <input
              className="form-input text-xs"
              placeholder="e.g. First Name"
              value={form.label}
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label text-xs">Source *</label>
            <select
              className="form-select text-xs"
              value={form.source}
              onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value as VariableSource, field: '' }))}
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-400 mt-1">
              {SOURCE_OPTIONS.find((o) => o.value === form.source)?.description}
            </p>
          </div>

          {fieldOptions.length > 0 ? (
            <div>
              <label className="form-label text-xs">Database field</label>
              <select
                className="form-select text-xs"
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
              <label className="form-label text-xs">Default value</label>
              <input
                className="form-input text-xs"
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
            className="btn-primary"
          >
            {saving ? 'Saving…' : editing ? 'Update preset' : 'Add preset'}
          </button>
          {editing && (
            <button
              onClick={cancelEdit}
              className="btn-ghost"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {presets.length === 0 ? (
        <p className="text-zinc-400 text-xs text-center py-6">No presets yet. Add one above.</p>
      ) : (
        <>
          {(['prospect', 'company', 'sender', 'static', 'custom'] as VariableSource[]).map((src) => {
            const group = presets.filter((p) => p.source === src);
            if (group.length === 0) return null;
            const srcLabel = SOURCE_OPTIONS.find((o) => o.value === src)?.label ?? src;
            return (
              <div key={src} className="mb-4">
                <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">{srcLabel}</p>
                <div className="space-y-1">
                  {group.map((preset) => (
                    <div key={preset.id} className="flex items-center gap-3 px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-850/60 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 rounded font-mono border border-zinc-200 dark:border-zinc-700">{`{{${preset.key}}}`}</code>
                          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{preset.label}</span>
                        </div>
                        {preset.field && (
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            → <span className="font-mono">{preset.field}</span>
                            {preset.default_value ? ` · default: "${preset.default_value}"` : ''}
                          </p>
                        )}
                        {!preset.field && preset.default_value && (
                          <p className="text-[11px] text-zinc-400 mt-0.5">default: "{preset.default_value}"</p>
                        )}
                      </div>
                      <button onClick={() => openEdit(preset)}
                        className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:underline px-2 py-1 transition-colors flex-shrink-0">
                        Edit
                      </button>
                      <button onClick={() => void remove(preset.id, preset.key)}
                        className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline px-2 py-1 transition-colors flex-shrink-0">
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

function SettingsContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const tabParam = searchParams.get('tab') as Section | null;
  const [active, setActive] = useState<Section>(
    tabParam && ['appearance', 'documents', 'variables', 'gmail'].includes(tabParam)
      ? tabParam
      : 'appearance'
  );

  function switchTab(id: Section) {
    setActive(id);
    router.replace(`/settings?tab=${id}`, { scroll: false });
  }

  const current = NAV.find((n) => n.id === active)!;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-5">
      <div className="pb-1 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Settings</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">Configure your CRM and display preferences</p>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:gap-5">
        {/* Sidebar nav (macOS Preferences style) */}
        <nav className="flex-shrink-0 md:w-52">
          <ul className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:pb-0 md:space-y-0.5">
            {NAV.map((item) => (
              <li key={item.id} className="flex-shrink-0 md:flex-shrink">
                <button
                  onClick={() => switchTab(item.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all md:items-start md:gap-2.5 cursor-pointer ${
                    active === item.id
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-850 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <span className={`flex-shrink-0 mt-0.5 ${active === item.id ? 'text-white dark:text-zinc-900' : 'text-zinc-400'}`}>
                    {item.icon}
                  </span>
                  <span>
                    <span className="block text-xs font-medium whitespace-nowrap md:whitespace-normal">{item.label}</span>
                    <span className={`hidden md:block text-[10px] mt-0.5 ${active === item.id ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-400'}`}>{item.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content panel */}
        <div className="flex-1 card p-5 min-w-0">
          <p className="sr-only">{current.label}</p>
          {active === 'appearance' && <AppearanceSection />}
          {active === 'documents'  && <DocumentsSection />}
          {active === 'variables'  && <VariablesSection />}
          {active === 'gmail'      && <GmailSection />}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-zinc-400">Loading settings…</div>}>
      <SettingsContent />
    </Suspense>
  );
}

