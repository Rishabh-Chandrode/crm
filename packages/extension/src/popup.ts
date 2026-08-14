import type { ProspectData, ScrapeMessage, TemplateInfo, AuthState, UserProfile, AutofillResultMessage, WorkExperience, Project } from './types';

// ── DOM refs ─────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Auth
const loginGate          = $<HTMLDivElement>('loginGate');
const authShell          = $<HTMLDivElement>('authShell');
const loginUsernameEl    = $<HTMLInputElement>('loginUsername');
const loginPasswordEl    = $<HTMLInputElement>('loginPassword');
const loginErrorEl       = $<HTMLDivElement>('loginError');
const loginBtn           = $<HTMLButtonElement>('loginBtn');
const loginGoogleBtn     = $<HTMLButtonElement>('loginGoogleBtn');

// Settings
const settingsToggle           = $<HTMLButtonElement>('settingsToggle');
const settingsPanel            = $<HTMLDivElement>('settingsPanel');
const settingsUserInfo         = $<HTMLDivElement>('settingsUserInfo');
const settingsSignIn           = $<HTMLDivElement>('settingsSignIn');
const settingsUserAvatarEl     = $<HTMLDivElement>('settingsUserAvatar');
const settingsUserNameEl       = $<HTMLDivElement>('settingsUserName');
const settingsUserEmailEl      = $<HTMLDivElement>('settingsUserEmail');
const settingsUserRoleEl       = $<HTMLSpanElement>('settingsUserRole');
const logoutBtn                = $<HTMLButtonElement>('logoutBtn');
const googleSignInSettingsBtn  = $<HTMLButtonElement>('googleSignInSettingsBtn');

// Contact tab
const firstNameEl    = $<HTMLInputElement>('firstName');
const lastNameEl     = $<HTMLInputElement>('lastName');
const emailEl        = $<HTMLInputElement>('email');
const companyEl      = $<HTMLInputElement>('company');
const jobTitleEl     = $<HTMLInputElement>('jobTitle');
const linkedinUrlEl  = $<HTMLInputElement>('linkedinUrl');
const statusEl              = $<HTMLDivElement>('status');
const scrapeBtn             = $<HTMLButtonElement>('scrapeBtn');
const existingProspectCard  = $<HTMLDivElement>('existingProspectCard');
const matchNameEl           = $<HTMLDivElement>('matchName');
const matchMetaEl           = $<HTMLDivElement>('matchMeta');
const matchViewLinkEl       = $<HTMLAnchorElement>('matchViewLink');
const matchSendEmailBtn     = $<HTMLButtonElement>('matchSendEmailBtn');
const pasteBtn       = $<HTMLButtonElement>('pasteBtn');
const enrichBtn      = $<HTMLButtonElement>('enrichBtn');
const enrichCredits  = $<HTMLDivElement>('enrichCredits');
const addBtn         = $<HTMLButtonElement>('addBtn');
const clearBtn       = $<HTMLButtonElement>('clearBtn');

// Track Job panel
const trackJobPanel      = $<HTMLDivElement>('trackJobPanel');
const trackJobPlatformEl = $<HTMLSpanElement>('trackJobPlatform');
const trackCompanyEl     = $<HTMLInputElement>('trackCompany');
const trackTitleEl       = $<HTMLInputElement>('trackTitle');
const trackUrlEl         = $<HTMLInputElement>('trackUrl');
const trackNotesEl       = $<HTMLTextAreaElement>('trackNotes');
const trackJobErrorEl    = $<HTMLDivElement>('trackJobError');
const trackCancelBtn     = $<HTMLButtonElement>('trackCancelBtn');
const trackSaveBtn       = $<HTMLButtonElement>('trackSaveBtn');
const trackJobBtn        = $<HTMLButtonElement>('trackJobBtn');

// Apply / Autofill tab
const applyProfileCardEl  = $<HTMLDivElement>('applyProfileCard');
const profileIncompleteEl = $<HTMLDivElement>('profileIncompleteNote');
const resumePickerEl      = $<HTMLSelectElement>('resumePicker');
const resumePickerNoteEl  = $<HTMLDivElement>('resumePickerNote');
const autofillBtn         = $<HTMLButtonElement>('autofillBtn');
const autofillSpinnerEl   = $<HTMLDivElement>('autofillSpinner');
const autofillStatusEl    = $<HTMLDivElement>('autofillStatus');
const autofillResultEl    = $<HTMLDivElement>('autofillResult');
const autofillFilledEl    = $<HTMLDivElement>('autofillFilledList');
const autofillSkippedWrap = $<HTMLDivElement>('autofillSkippedWrap');
const autofillSkippedEl   = $<HTMLDivElement>('autofillSkippedList');

// Send Email tab — prospect search
const prospectSearchEl      = $<HTMLDivElement>('prospectSearch');
const prospectSearchInputEl = $<HTMLInputElement>('prospectSearchInput');
const prospectResultsEl     = $<HTMLDivElement>('prospectResults');

// Send Email tab — compose
const sendContent           = $<HTMLDivElement>('sendContent');
const recipientAvatar       = $<HTMLDivElement>('recipientAvatar');
const recipientName         = $<HTMLDivElement>('recipientName');
const recipientEmail        = $<HTMLDivElement>('recipientEmail');
const clearProspectBtn      = $<HTMLButtonElement>('clearProspectBtn');
const templateSelectEl      = $<HTMLSelectElement>('templateSelect');
const customVarsSection     = $<HTMLDivElement>('customVarsSection');
const customVarsFields      = $<HTMLDivElement>('customVarsFields');
const emailPreviewArea      = $<HTMLDivElement>('emailPreviewArea');
const emailPreviewSubjectEl = $<HTMLDivElement>('emailPreviewSubject');
const emailPreviewFrameEl   = $<HTMLIFrameElement>('emailPreviewFrame');
const previewEmailBtn       = $<HTMLButtonElement>('previewEmailBtn');
const sendEmailBtn          = $<HTMLButtonElement>('sendEmailBtn');
const sendStatusEl          = $<HTMLDivElement>('sendStatus');

const sendModeRadios        = document.querySelectorAll<HTMLInputElement>('input[name="sendMode"]');
const templateModeContent   = $<HTMLDivElement>('templateModeContent');
const quickEmailModeContent = $<HTMLDivElement>('quickEmailModeContent');

const quickEmailToEl        = $<HTMLInputElement>('quickEmailTo');
const quickEmailSubjectEl   = $<HTMLInputElement>('quickEmailSubject');
const quickEmailBodyEl      = $<HTMLTextAreaElement>('quickEmailBody');
const quickEmailStatusEl    = $<HTMLDivElement>('quickEmailStatus');
const quickSendEmailBtn     = $<HTMLButtonElement>('quickSendEmailBtn');
const quickScheduleEmailBtn = $<HTMLButtonElement>('quickScheduleEmailBtn');
const quickSchedulePicker   = $<HTMLDivElement>('quickSchedulePicker');
const quickScheduleDateEl   = $<HTMLInputElement>('quickScheduleDate');
const quickConfirmScheduleBtn = $<HTMLButtonElement>('quickConfirmScheduleBtn');

// ── Shared state ─────────────────────────────────────────────────────────────

const STORAGE_KEYS: (keyof ProspectData)[] = [
  'firstName', 'lastName', 'email', 'company', 'jobTitle', 'linkedinUrl',
];

declare const BACKEND_URL: string;
declare const FRONTEND_URL: string;

let currentToken = '';
const currentBackendUrl = BACKEND_URL;
const currentFrontendUrl = FRONTEND_URL;
let currentAuth: AuthState | null = null;

function getFormData(): ProspectData {
  return {
    firstName:   firstNameEl.value.trim(),
    lastName:    lastNameEl.value.trim(),
    email:       emailEl.value.trim(),
    company:     companyEl.value.trim(),
    jobTitle:    jobTitleEl.value.trim(),
    linkedinUrl: linkedinUrlEl.value.trim(),
  };
}

function setFormData(data: Partial<ProspectData>): void {
  if (data.firstName   !== undefined) firstNameEl.value   = data.firstName;
  if (data.lastName    !== undefined) lastNameEl.value    = data.lastName;
  if (data.email       !== undefined) emailEl.value       = data.email;
  if (data.company     !== undefined) companyEl.value     = data.company;
  if (data.jobTitle    !== undefined) jobTitleEl.value    = data.jobTitle;
  if (data.linkedinUrl !== undefined) linkedinUrlEl.value = data.linkedinUrl;
}

function persistForm(): void {
  chrome.storage.sync.set(getFormData());
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

function showLoginGate(): void {
  currentAuth = null;
  currentToken = '';
  loginGate.style.display = 'block';
  authShell.style.display = 'none';
  refreshSettingsPanel();
}

function showAuthShell(): void {
  loginGate.style.display = 'none';
  authShell.style.display = 'block';
  refreshSettingsPanel();
  checkCurrentTab();
}

function showLoginError(msg: string): void {
  loginErrorEl.textContent = msg;
  loginErrorEl.style.display = 'block';
}

// ── Settings panel user info ──────────────────────────────────────────────────

function refreshSettingsPanel(): void {
  if (currentAuth) {
    settingsUserInfo.style.display = 'flex';
    settingsUserInfo.style.flexDirection = 'column';
    settingsUserInfo.style.gap = '8px';
    settingsSignIn.style.display = 'none';

    const initials = (currentAuth.username[0] ?? '?').toUpperCase();
    settingsUserAvatarEl.textContent = initials;
    settingsUserNameEl.textContent   = currentAuth.username;
    settingsUserEmailEl.textContent  = currentAuth.email ?? '';
    settingsUserEmailEl.style.display = currentAuth.email ? 'block' : 'none';
    settingsUserRoleEl.textContent   = currentAuth.role;
  } else {
    settingsUserInfo.style.display = 'none';
    settingsSignIn.style.display   = 'block';
  }
}

// Fetch full user profile and store email back into auth
async function loadCurrentUser(): Promise<void> {
  if (!currentToken) return;
  try {
    const res = await fetch(`${currentBackendUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (!res.ok) return;
    const json = await res.json() as { user?: { username: string; email?: string; role: string } };
    if (!json.user) return;

    if (currentAuth) {
      currentAuth.email = json.user.email ?? undefined;
      currentAuth.username = json.user.username;
      currentAuth.role = json.user.role;
      chrome.storage.sync.set({ auth: currentAuth });
    }
    refreshSettingsPanel();
  } catch {
    // non-fatal
  }
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${currentBackendUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json() as { user?: { username: string; email?: string; role: string } };
      if (json.user && currentAuth) {
        currentAuth.email    = json.user.email ?? undefined;
        currentAuth.username = json.user.username;
        currentAuth.role     = json.user.role;
        chrome.storage.sync.set({ auth: currentAuth });
      }
    }
    return res.ok;
  } catch {
    return false;
  }
}

async function tryLogin(username: string, password: string): Promise<boolean> {
  try {
    const res = await fetch(`${currentBackendUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json() as { token?: string; user?: { username: string; email?: string; role: string }; error?: string };
    if (!res.ok || !json.token) {
      showLoginError(json.error ?? 'Invalid credentials');
      return false;
    }
    currentAuth = {
      token:    json.token,
      username: json.user?.username ?? username,
      role:     json.user?.role ?? 'user',
      email:    json.user?.email,
    };
    chrome.storage.sync.set({ auth: currentAuth });
    currentToken = json.token;
    return true;
  } catch {
    showLoginError('Cannot reach CRM backend. Check Settings.');
    return false;
  }
}

// ── Google sign-in ────────────────────────────────────────────────────────────

async function startGoogleSignIn(errorTarget: 'login' | 'settings'): Promise<void> {
  try {
    const res = await fetch(`${currentBackendUrl}/api/auth/google/connect`);
    const json = await res.json() as { url?: string; error?: string };
    if (!res.ok || !json.url) {
      if (errorTarget === 'login') showLoginError(json.error ?? 'Google sign-in unavailable');
      return;
    }
    void chrome.tabs.create({ url: json.url });
  } catch {
    if (errorTarget === 'login') showLoginError('Cannot reach CRM backend. Check Settings.');
  }
}

// ── React to background storing a google_token ────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes['auth']) return;
  const newAuth = changes['auth'].newValue as AuthState | undefined;

  if (newAuth?.token && newAuth.token !== currentToken) {
    currentToken = newAuth.token;
    currentAuth  = newAuth;
    showAuthShell();
    restoreTab();
    void loadCurrentUser();
  } else if (!newAuth) {
    showLoginGate();
  }
});

// ── Initialise ───────────────────────────────────────────────────────────────

let initialLoadDone = false;

chrome.storage.sync.get([...STORAGE_KEYS, 'auth'], async (stored) => {
  if (!initialLoadDone) setFormData(stored as Partial<ProspectData>);
  initialLoadDone = true;

  const auth = stored['auth'] as AuthState | undefined;

  if (auth?.token) {
    currentAuth  = auth;
    currentToken = auth.token;
    const valid = await verifyToken(auth.token);
    if (valid) {
      showAuthShell();
      restoreTab();
      void updateCreditsDisplay();
      return;
    }
    chrome.storage.sync.remove('auth');
    currentAuth  = null;
    currentToken = '';
  }
  
  showLoginGate();
});

[firstNameEl, lastNameEl, emailEl, companyEl, jobTitleEl, linkedinUrlEl].forEach((el) => {
  el.addEventListener('input', () => { initialLoadDone = true; persistForm(); });
  el.addEventListener('change', persistForm);
});

// ── Login form ────────────────────────────────────────────────────────────────

loginBtn.addEventListener('click', async () => {
  const username = loginUsernameEl.value.trim();
  const password = loginPasswordEl.value;
  loginErrorEl.style.display = 'none';

  if (!username || !password) { showLoginError('Username and password are required'); return; }

  loginBtn.disabled    = true;
  loginBtn.textContent = 'Signing in…';

  const ok = await tryLogin(username, password);
  if (ok) {
    loginPasswordEl.value = '';
    showAuthShell();
    restoreTab();
    void loadCurrentUser();
    void updateCreditsDisplay();
  }

  loginBtn.disabled    = false;
  loginBtn.textContent = 'Sign in';
});

loginPasswordEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

loginGoogleBtn.addEventListener('click', () => {
  loginGoogleBtn.disabled    = true;
  loginGoogleBtn.querySelector('span')!.textContent = 'Opening…';
  void startGoogleSignIn('login').finally(() => {
    loginGoogleBtn.disabled    = false;
    loginGoogleBtn.querySelector('span')!.textContent = 'Continue with Google';
  });
});

// ── Settings ─────────────────────────────────────────────────────────────────

settingsToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  const hidden = settingsPanel.style.display === 'none' || !settingsPanel.style.display;
  if (hidden) {
    refreshSettingsPanel();
    settingsPanel.style.display = 'flex';
  } else {
    settingsPanel.style.display = 'none';
  }
});

document.addEventListener('click', (e) => {
  if (!settingsPanel.contains(e.target as Node) && e.target !== settingsToggle) {
    settingsPanel.style.display = 'none';
  }
});

logoutBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: currentFrontendUrl });
  settingsPanel.style.display = 'none';
});

googleSignInSettingsBtn.addEventListener('click', () => {
  settingsPanel.style.display = 'none';
  void startGoogleSignIn('settings');
});

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset['tab'] ?? 'contact'));
});

function restoreTab(): void {
  chrome.storage.local.get(['activeTab'], (local) => {
    const saved = local['activeTab'] as string | undefined;
    if (saved && saved !== 'contact') switchTab(saved);
  });
}

function switchTab(target: string): void {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('tab--active'));
  document.querySelectorAll<HTMLElement>('.tab-pane').forEach((p) => { p.style.display = 'none'; });

  document.querySelector<HTMLButtonElement>(`.tab[data-tab="${target}"]`)?.classList.add('tab--active');
  const pane = document.getElementById(`tab-${target}`);
  if (pane) pane.style.display = 'flex';

  chrome.storage.local.set({ activeTab: target });
  if (target === 'send')  onEnterSendTab();
  if (target === 'apply') void onEnterApplyTab();
}

// ── Contact tab ───────────────────────────────────────────────────────────────

function showContactStatus(msg: string, type: 'success' | 'error' | 'info'): void {
  statusEl.textContent = msg;
  statusEl.className = `status status--${type}`;
  statusEl.style.display = 'block';
  if (type !== 'error') setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
}

scrapeBtn.addEventListener('click', async () => {
  scrapeBtn.disabled    = true;
  scrapeBtn.textContent = 'Scraping…';
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (activeTab?.id) {
    try {
      await chrome.tabs.sendMessage(activeTab.id, { type: 'SCRAPE_PAGE' });
    } catch (err) {
      chrome.runtime.sendMessage({ action: 'triggerScrape' }).catch(() => {});
    }
  }
});

async function updateCreditsDisplay() {
  if (!currentBackendUrl || !currentToken) return;

  try {
    const res = await fetch(`${currentBackendUrl}/api/prospects/enrich/credits`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const json = await res.json() as { credits: number | null, provider?: string };
    if (json.credits !== null && json.credits !== undefined) {
      const providerName = json.provider ? json.provider.charAt(0).toUpperCase() + json.provider.slice(1) : 'Provider';
      enrichCredits.textContent = `${providerName} Credits: ${json.credits}`;
      enrichCredits.style.display = 'block';
    } else {
      enrichCredits.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to fetch credits:', err);
    enrichCredits.style.display = 'none';
  }
}

function handleScrapeResult(data: any) {
  if (data.firstName)   firstNameEl.value   = data.firstName;
  if (data.lastName)    lastNameEl.value    = data.lastName;
  if (data.company)     companyEl.value     = data.company;
  if (data.title)       jobTitleEl.value    = data.title;
  if (data.linkedinUrl) linkedinUrlEl.value = data.linkedinUrl;
  if (data.email)       emailEl.value       = data.email;
  persistForm();
}

interface ProspectMatch {
  id: string;
  first_name: string;
  last_name?: string | null;
  email?: string | null;
  job_title?: string | null;
  company_name?: string | null;
}

function showExistingProspect(p: ProspectMatch): void {
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
  const meta = [p.job_title, p.company_name, p.email].filter(Boolean).join(' · ');
  matchNameEl.textContent = name;
  matchMetaEl.textContent = meta;
  matchViewLinkEl.href = `${currentFrontendUrl}/prospects/${p.id}`;

  matchSendEmailBtn.onclick = () => {
    switchTab('send');
    onEnterSendTab();
    // Pre-select this prospect once templates have loaded (they load async)
    const trySelect = () => {
      if (templateSelectEl.options.length > 1) {
        selectProspect(p.id, name, p.email ?? '');
      } else {
        setTimeout(trySelect, 150);
      }
    };
    trySelect();
  };

  existingProspectCard.style.display = 'block';
}

function hideExistingProspect(): void {
  existingProspectCard.style.display = 'none';
}

async function lookupProspect(linkedinUrl: string, email: string): Promise<void> {
  if (!currentToken || (!linkedinUrl && !email)) return;
  try {
    const params = new URLSearchParams();
    if (linkedinUrl) params.set('linkedin_url', linkedinUrl);
    if (email)       params.set('email', email);
    const res = await fetch(`${currentBackendUrl}/api/prospects/lookup?${params.toString()}`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (!res.ok) return;
    const json = await res.json() as { data: ProspectMatch | null };
    if (json.data) showExistingProspect(json.data);
    else hideExistingProspect();
  } catch {
    // non-fatal
  }
}

function handleTabUrl(url: string): void {
  if (url.includes('linkedin.com/in/')) {
    const cleanUrl = url.split('?')[0]!.toLowerCase().replace(/\/+$/, '');
    void lookupProspect(cleanUrl, '');
  } else {
    hideExistingProspect();
  }
}

function checkCurrentTab(): void {
  chrome.runtime.sendMessage({ action: 'getActiveTabUrl' });
}

interface TrackJobInfo {
  company_name: string;
  job_title:    string;
  job_url:      string;
  platform:     string;
}

function openTrackJobPanel(info: Partial<TrackJobInfo>): void {
  trackCompanyEl.value       = info.company_name ?? '';
  trackTitleEl.value         = info.job_title    ?? '';
  trackUrlEl.value           = info.job_url      ?? '';
  trackNotesEl.value         = '';
  trackJobPlatformEl.textContent = info.platform ?? '';
  trackJobPlatformEl.style.display = info.platform ? '' : 'none';
  trackJobErrorEl.style.display    = 'none';
  trackSaveBtn.disabled      = false;
  trackSaveBtn.textContent   = 'Save to Tracker';
  trackJobPanel.style.display = 'flex';
}

function closeTrackJobPanel(): void {
  trackJobPanel.style.display = 'none';
}

async function saveTrackedJob(): Promise<void> {
  const company = trackCompanyEl.value.trim();
  const title   = trackTitleEl.value.trim();
  const url     = trackUrlEl.value.trim();
  const notes   = trackNotesEl.value.trim();
  const platform = trackJobPlatformEl.textContent?.trim() || 'Generic';

  if (!company || !title || !url) {
    trackJobErrorEl.textContent = 'Company, job title, and URL are required.';
    trackJobErrorEl.style.display = 'block';
    return;
  }

  trackSaveBtn.disabled    = true;
  trackSaveBtn.textContent = 'Saving…';
  trackJobErrorEl.style.display = 'none';

  try {
    await fetch(`${currentBackendUrl}/api/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`,
      },
      body: JSON.stringify({ company_name: company, job_title: title, job_url: url, platform, notes: notes || undefined }),
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    closeTrackJobPanel();
    showAutofillStatus('Application saved to tracker!', 'success');
  } catch {
    trackJobErrorEl.textContent = 'Failed to save — please try again.';
    trackJobErrorEl.style.display = 'block';
    trackSaveBtn.disabled    = false;
    trackSaveBtn.textContent = 'Save to Tracker';
  }
}

function extractJobInfoFromTab(tab: chrome.tabs.Tab): TrackJobInfo {
  const url      = tab.url ?? '';
  const hostname = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  let jobTitle   = (tab.title ?? '').replace(/\s*[-|·—]\s*.+$/, '').trim();
  let company    = '';
  let platform   = 'Generic';

  if (hostname.includes('greenhouse.io')) {
    platform = 'Greenhouse';
    const m = url.match(/greenhouse\.io\/([^/?#]+)/);
    company = m?.[1]?.replace(/-/g, ' ') ?? '';
  } else if (hostname.includes('lever.co')) {
    platform = 'Lever';
    const m = url.match(/lever\.co\/([^/?#]+)/);
    company = m?.[1]?.replace(/-/g, ' ') ?? '';
  } else if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) {
    platform = 'Workday';
    company = hostname.split('.')[0] ?? '';
  }

  return { company_name: company, job_title: jobTitle, job_url: url, platform };
}

trackCancelBtn.addEventListener('click', closeTrackJobPanel);
trackJobPanel.addEventListener('click', (e) => {
  if (e.target === trackJobPanel) closeTrackJobPanel();
});
trackSaveBtn.addEventListener('click', () => { void saveTrackedJob(); });

trackJobBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true }, (tabs) => {
    const tab = tabs.find(t => t.url) ?? tabs[0];
    if (!tab) { openTrackJobPanel({}); return; }
    openTrackJobPanel(extractJobInfoFromTab(tab));
  });
});

// ── Autofill result accumulator ───────────────────────────────────────────────
// The content script runs in allFrames. Each frame sends its own autofillResult
// as soon as it finishes — but async fields (city dropdowns, etc.) can take many
// seconds, so frames finish at very different times.
//
// Strategy: keep the spinner alive and live-update the chips on every incoming
// message. Only hide the spinner after 4 s of silence (no new frames reporting).

let autofillAccTimer: ReturnType<typeof setTimeout> | null = null;
let autofillAccFilled: string[] = [];
let autofillAccSkipped: string[] = [];
let autofillAccPlatform = '';
let autofillAccActive = false;
let autofillExpectedFrames = 0;
let autofillCompletedFrames = 0;

function finishAutofill(): void {
  if (autofillAccTimer) { clearTimeout(autofillAccTimer); autofillAccTimer = null; }
  autofillAccActive = false;
  const combined: AutofillResultMessage = {
    action:   'autofillResult',
    filled:   autofillAccFilled,
    skipped:  autofillAccSkipped,
    platform: autofillAccPlatform || 'Generic',
  };
  setAutofillLoading(false);
  if (combined.filled.length === 0) {
    showAutofillStatus(`No fields matched on this page (${combined.platform})`, 'info');
  } else {
    showAutofillStatus(`Done — filled ${combined.filled.length} field${combined.filled.length === 1 ? '' : 's'} on ${combined.platform}`, 'success');
  }
  renderAutofillResult(combined);
  autofillAccFilled   = [];
  autofillAccSkipped  = [];
  autofillAccPlatform = '';
}

function accumulateAutofillResult(msg: AutofillResultMessage): void {
  if (!autofillAccActive) return; // stale message after reset

  autofillCompletedFrames++;

  if (msg.error) {
    if (autofillAccFilled.length === 0 && autofillExpectedFrames > 0 && autofillCompletedFrames >= autofillExpectedFrames) {
      if (autofillAccTimer) { clearTimeout(autofillAccTimer); autofillAccTimer = null; }
      autofillAccActive = false;
      setAutofillLoading(false);
      showAutofillStatus(msg.error, 'error');
    }
  } else {
    // Merge this frame's results (deduplicate)
    for (const f of msg.filled)  { if (!autofillAccFilled.includes(f))  autofillAccFilled.push(f); }
    for (const s of msg.skipped) { if (!autofillAccSkipped.includes(s)) autofillAccSkipped.push(s); }
    if (msg.platform && msg.platform !== 'unknown') autofillAccPlatform = msg.platform;

    // Live-update chips while spinner is still running so the user sees progress
    if (autofillAccFilled.length > 0) {
      autofillResultEl.style.display = 'block';
      autofillFilledEl.innerHTML = autofillAccFilled
        .map(f => `<span class="autofill-chip">${FIELD_LABEL_MAP[f] ?? f}</span>`)
        .join('');
      autofillSkippedWrap.style.display = 'none';
    }
  }

  // If we know how many frames we injected into, check if we're done
  if (autofillExpectedFrames > 0 && autofillCompletedFrames >= autofillExpectedFrames) {
    finishAutofill();
  } else {
    // Fallback: reset the quiet-period timer — hide spinner only after 10 s of silence
    if (autofillAccTimer) clearTimeout(autofillAccTimer);
    autofillAccTimer = setTimeout(() => {
      finishAutofill();
    }, 10000);
  }
}

chrome.runtime.onMessage.addListener((message: ScrapeMessage | AutofillResultMessage | { action: 'scrapeError'; error: string } | { action: 'tabUrlChanged'; url: string } | { action: 'applicationSubmitted'; company_name: string; job_title: string; job_url: string; platform: string }) => {
  if (message.action === 'applicationSubmitted') {
    const msg = message as { action: string; company_name: string; job_title: string; job_url: string; platform: string };
    openTrackJobPanel({ company_name: msg.company_name, job_title: msg.job_title, job_url: msg.job_url, platform: msg.platform });
    return;
  }
  if (message.action === 'autofillResult') {
    const msg = message as AutofillResultMessage;
    accumulateAutofillResult(msg);
    return;
  }
  if (message.action === 'tabUrlChanged') {
    if (currentToken) handleTabUrl(message.url);
    return;
  }
  if (message.action === 'scrapeError') {
    showContactStatus(message.error, 'error');
    scrapeBtn.disabled    = false;
    scrapeBtn.textContent = 'Scrape LinkedIn';
    return;
  }
  if (message.action !== 'scraped') return;
  setFormData({
    firstName:   message.firstName,
    lastName:    message.lastName,
    company:     message.company,
    jobTitle:    message.jobTitle,
    linkedinUrl: message.linkedinUrl,
  });
  persistForm();
  showContactStatus('Profile data scraped', 'success');
  scrapeBtn.disabled    = false;
  scrapeBtn.textContent = 'Scrape LinkedIn';
  void lookupProspect(message.linkedinUrl, '');
});

enrichBtn.addEventListener('click', async () => {
  const data = getFormData();

  enrichBtn.disabled = true;
  const originalSvg = enrichBtn.innerHTML;
  enrichBtn.textContent = '...';

  try {
    const res = await fetch(`${currentBackendUrl}/api/prospects/enrich`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`,
      },
      body: JSON.stringify({
        first_name: data.firstName,
        last_name: data.lastName,
        company_name: data.company,
        linkedin_url: data.linkedinUrl,
      }),
    });

    const json = await res.json() as { email?: string; error?: string };

    if (!res.ok) {
      showContactStatus(json.error ?? 'Failed to fetch email', 'error');
    } else if (json.email) {
      emailEl.value = json.email;
      persistForm();
      showContactStatus('Email found!', 'success');
      void updateCreditsDisplay();
    }
  } catch (err) {
    showContactStatus('Network error while fetching email', 'error');
  } finally {
    enrichBtn.disabled = false;
    enrichBtn.innerHTML = originalSvg;
  }
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text  = await navigator.clipboard.readText();
    const match = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    if (!match) { showContactStatus('No email address found in clipboard', 'error'); return; }
    emailEl.value = match[0];
    persistForm();
    showContactStatus('Email pasted', 'success');
  } catch {
    showContactStatus('Clipboard access denied', 'error');
  }
});

addBtn.addEventListener('click', async () => {
  const data = getFormData();
  if (!data.firstName) { showContactStatus('First name is required', 'error'); return; }
  if (!data.email)     { showContactStatus('Email is required', 'error'); return; }

  addBtn.disabled    = true;
  addBtn.textContent = 'Adding…';
  statusEl.style.display = 'none';

  try {
    const res = await fetch(`${currentBackendUrl}/api/prospects/quick-add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
      body: JSON.stringify({
        first_name:   data.firstName,
        last_name:    data.lastName    || null,
        email:        data.email,
        company_name: data.company     || null,
        job_title:    data.jobTitle    || null,
        linkedin_url: data.linkedinUrl || null,
      }),
    });

    if (res.status === 401) { chrome.storage.sync.remove('auth'); showLoginGate(); return; }

    const json = await res.json() as { existed?: boolean; error?: string };
    if (!res.ok) { showContactStatus(json.error ?? `Error ${res.status}`, 'error'); return; }

    if (json.existed) {
      showContactStatus('Already in CRM', 'info');
    } else {
      showContactStatus('Prospect added ✓', 'success');
      chrome.storage.sync.remove(STORAGE_KEYS);
      setFormData({ firstName: '', lastName: '', email: '', company: '', jobTitle: '', linkedinUrl: '' });
    }
  } catch (err) {
    showContactStatus(`Network error: ${String(err)}`, 'error');
  } finally {
    addBtn.disabled    = false;
    addBtn.textContent = 'Add to CRM';
  }
});

clearBtn.addEventListener('click', () => {
  chrome.storage.sync.remove(STORAGE_KEYS);
  setFormData({ firstName: '', lastName: '', email: '', company: '', jobTitle: '', linkedinUrl: '' });
  statusEl.style.display = 'none';
  hideExistingProspect();
});

// ── Apply / Autofill tab ─────────────────────────────────────────────────────

type FlatKey = Exclude<keyof UserProfile, 'skills' | 'projects' | 'work_experiences'>;

const PERSONAL_FIELDS: Array<{ key: FlatKey; label: string }> = [
  { key: 'first_name',   label: 'First name' },
  { key: 'last_name',    label: 'Last name' },
  { key: 'email',        label: 'Email' },
  { key: 'phone',        label: 'Phone' },
  { key: 'location',     label: 'Location' },
  { key: 'city',         label: 'City' },
  { key: 'state',        label: 'State' },
  { key: 'country',      label: 'Country' },
  { key: 'address_line1', label: 'Address' },
  { key: 'postal_code',  label: 'Postal code' },
  { key: 'hometown',     label: 'Hometown' },
  { key: 'linkedin_url', label: 'LinkedIn' },
  { key: 'github_url',   label: 'GitHub' },
  { key: 'website',      label: 'Website' },
  { key: 'gender',       label: 'Gender' },
];

const JOB_FIELDS: Array<{ key: FlatKey; label: string }> = [
  { key: 'current_company',     label: 'Company' },
  { key: 'job_title',           label: 'Job title' },
  { key: 'years_of_experience', label: 'Exp. years' },
  { key: 'work_authorization',  label: 'Work auth' },
  { key: 'notice_period',       label: 'Notice period' },
  { key: 'current_ctc',         label: 'Current CTC' },
  { key: 'expected_ctc',        label: 'Expected CTC' },
  { key: 'veteran_status',      label: 'Veteran status' },
];

const EDUCATION_FIELDS: Array<{ key: FlatKey; label: string }> = [
  { key: 'college_name',    label: 'College' },
  { key: 'education',       label: 'Degree' },
  { key: 'graduation_year', label: 'Grad year' },
];

const FIELD_LABEL_MAP: Record<string, string> = {
  first_name:          'First name',
  last_name:           'Last name',
  full_name:           'Full name',
  email:               'Email',
  phone:               'Phone',
  city:                'City',
  state:               'State',
  country:             'Country',
  linkedin_url:        'LinkedIn URL',
  github_url:          'GitHub URL',
  website:             'Website',
  current_company:     'Company',
  job_title:           'Job title',
  work_authorization:  'Work auth',
  location:            'Location',
  hometown:            'Hometown',
  years_of_experience: 'Exp. years',
  notice_period:       'Notice period',
  current_ctc:         'Current CTC',
  expected_ctc:        'Expected CTC',
  education:           'Education',
  college_name:        'College',
  gender:              'Gender',
  veteran_status:      'Veteran status',
  resume:              'Resume',
};

let cachedProfile: UserProfile | null = null;

const CLIPBOARD_SVG = `<svg class="copy-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHECK_SVG     = `<svg class="copy-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

function flashCopied(el: Element): void {
  const icon = el.querySelector('.copy-icon');
  if (!icon) return;
  icon.outerHTML = CHECK_SVG;
  el.classList.add('copied');
  setTimeout(() => {
    const check = el.querySelector('.copy-check');
    if (check) check.outerHTML = CLIPBOARD_SVG;
    el.classList.remove('copied');
  }, 1500);
}

function makeCopyRow(label: string, value: string | null): string {
  const isEmpty = !value;
  const safe = isEmpty ? '' : value!.replace(/"/g, '&quot;');
  return `<div class="apply-profile-row${isEmpty ? ' apply-profile-row--empty' : ''}" ${isEmpty ? '' : `data-copy="${safe}" role="button" tabindex="0"`}>
    <span class="apply-profile-key">${label}</span>
    <span class="apply-profile-value${isEmpty ? ' apply-profile-value--empty' : ''}">${value ?? '—'}</span>
    ${isEmpty ? '' : CLIPBOARD_SVG}
  </div>`;
}

function makeSectionHeader(icon: string, title: string): string {
  return `<div class="profile-section-header">${icon}<span>${title}</span></div>`;
}

function renderFlatSection(fields: Array<{ key: FlatKey; label: string }>, profile: UserProfile): string {
  return fields.map(({ key, label }) => makeCopyRow(label, profile[key] as string | null)).join('');
}

function makeCopyBlock(label: string, value: string | null | undefined, multiline = false): string {
  const val = value?.trim() ?? '';
  if (!val) return '';
  const safe = val.replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
  const inner = multiline
    ? `<div class="exp-multi-wrap">
        <span class="exp-copy-value">${val.replace(/\n/g, '<br>')}</span>
        <button class="exp-read-more" type="button">Read more</button>
      </div>`
    : `<span class="exp-copy-value">${val}</span>`;
  return `<div class="exp-copy-block${multiline ? ' exp-copy-block--multi' : ''}" data-copy="${safe}" role="button" tabindex="0">
    <span class="exp-copy-label">${label}</span>
    ${inner}
    ${CLIPBOARD_SVG}
  </div>`;
}

function renderWorkExperienceSection(list: WorkExperience[]): string {
  if (!list.length) return `<div class="profile-empty-section">No work experience added yet.</div>`;
  return list.map((exp) => {
    const dates = [exp.start_date, exp.end_date || 'Present'].filter(Boolean).join(' – ');
    const duration = [dates, exp.location].filter(Boolean).join(' · ');
    return `<div class="profile-exp-card">
      ${makeCopyBlock('Title', exp.title)}
      ${makeCopyBlock('Company', exp.company)}
      ${makeCopyBlock('Duration', duration)}
      ${makeCopyBlock('Description', exp.description, true)}
    </div>`;
  }).join('');
}

function renderProjectSection(list: Project[]): string {
  if (!list.length) return `<div class="profile-empty-section">No projects added yet.</div>`;
  return list.map((proj) => {
    return `<div class="profile-exp-card">
      ${makeCopyBlock('Name', proj.name)}
      ${makeCopyBlock('Tech', proj.tech)}
      ${makeCopyBlock('Role', proj.role)}
      ${makeCopyBlock('Description', proj.description, true)}
    </div>`;
  }).join('');
}

function renderSkillsSection(skills: string[]): string {
  if (!skills.length) return `<div class="profile-empty-section">No skills added yet.</div>`;
  return `<div class="profile-skills-wrap">${skills.map((s) => {
    const safe = s.replace(/"/g, '&quot;');
    return `<span class="profile-skill-chip" data-copy="${safe}" role="button" tabindex="0">${s}</span>`;
  }).join('')}</div>`;
}

function wireClickCopy(container: Element): void {
  container.querySelectorAll<HTMLElement>('[data-copy]').forEach((el) => {
    const val = el.dataset['copy'];
    if (!val) return;
    const handler = () => { void copyToClipboard(val).then(() => flashCopied(el)); };
    el.addEventListener('click', handler);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });

  // "Read more / Read less" toggles for long multiline blocks
  container.querySelectorAll<HTMLButtonElement>('.exp-read-more').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // don't trigger copy
      const block = btn.closest<HTMLElement>('.exp-copy-block');
      if (!block) return;
      const expanded = block.classList.toggle('is-expanded');
      btn.textContent = expanded ? 'Read less' : 'Read more';
    });
  });
}

function renderProfileCard(profile: UserProfile): void {
  const PERSON_ICON = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  const BRIEFCASE   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`;
  const GRAD_HAT    = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
  const STAR_ICON   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  const FOLDER_ICON = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;

  const workExps = profile.work_experiences ?? [];
  const projects = profile.projects ?? [];
  const skills   = profile.skills ?? [];

  const hasEmpty = [...PERSONAL_FIELDS, ...JOB_FIELDS, ...EDUCATION_FIELDS]
    .some(({ key }) => !profile[key]);

  applyProfileCardEl.innerHTML = [
    makeSectionHeader(PERSON_ICON, 'Personal'),
    renderFlatSection(PERSONAL_FIELDS, profile),
    makeSectionHeader(BRIEFCASE, 'Job Details'),
    renderFlatSection(JOB_FIELDS, profile),
    makeSectionHeader(GRAD_HAT, 'Education'),
    renderFlatSection(EDUCATION_FIELDS, profile),
    makeSectionHeader(STAR_ICON, `Skills${skills.length ? ` (${skills.length})` : ''}`),
    renderSkillsSection(skills),
    makeSectionHeader(BRIEFCASE, `Work Experience${workExps.length ? ` (${workExps.length})` : ''}`),
    `<div class="profile-exp-list">${renderWorkExperienceSection(workExps)}</div>`,
    makeSectionHeader(FOLDER_ICON, `Projects${projects.length ? ` (${projects.length})` : ''}`),
    `<div class="profile-exp-list">${renderProjectSection(projects)}</div>`,
  ].join('');

  profileIncompleteEl.style.display = hasEmpty ? 'block' : 'none';
  wireClickCopy(applyProfileCardEl);
}

interface DocumentItem { id: string; name: string; filename: string; }

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function loadDocuments(token: string, backendUrl: string): Promise<void> {
  try {
    const json = await fetchJson<{ data: DocumentItem[] }>(`${backendUrl}/api/documents`, token);
    const docs = json.data ?? [];
    resumePickerEl.innerHTML = '<option value="">Don\'t attach a resume</option>';
    docs.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name || d.filename;
      opt.dataset['filename'] = d.filename;
      resumePickerEl.appendChild(opt);
    });
    if (docs.length === 1) resumePickerEl.value = docs[0]!.id;
    resumePickerNoteEl.style.display = docs.length === 0 ? 'block' : 'none';
  } catch (err) {
    console.error('[CRM] Failed to load documents:', err);
  }
}

async function onEnterApplyTab(): Promise<void> {
  if (!currentToken) return;
  autofillResultEl.style.display  = 'none';
  autofillStatusEl.style.display  = 'none';
  autofillSpinnerEl.style.display = 'none';
  autofillBtn.disabled  = false;
  autofillBtn.innerHTML = AUTOFILL_BTN_DEFAULT_HTML;

  // Load profile if not cached
  if (!cachedProfile) {
    applyProfileCardEl.innerHTML = '<div class="apply-profile-loading">Loading profile…</div>';
    try {
      const json = await fetchJson<{ user: UserProfile & { username: string; role: string } }>(
        `${currentBackendUrl}/api/auth/me`, currentToken
      );
      if (json?.user) { cachedProfile = json.user; renderProfileCard(cachedProfile); }
    } catch {
      applyProfileCardEl.innerHTML = '<div class="apply-profile-loading">Failed to load profile.</div>';
    }
  } else {
    renderProfileCard(cachedProfile);
  }

  // Always reload documents (user may have added new ones)
  await loadDocuments(currentToken, currentBackendUrl);
}

const AUTOFILL_BTN_DEFAULT_HTML = `
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
  Autofill This Page`;

const AUTOFILL_BTN_LOADING_HTML = `
  <svg class="btn-spinner" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10" stroke-opacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>
  Filling…`;

function setAutofillLoading(on: boolean): void {
  if (on) {
    autofillBtn.classList.add('btn--loading');
    autofillBtn.innerHTML = AUTOFILL_BTN_LOADING_HTML;
    autofillSpinnerEl.style.display = 'flex';
    autofillStatusEl.style.display  = 'none';
    autofillResultEl.style.display  = 'none';
  } else {
    autofillBtn.classList.remove('btn--loading');
    autofillBtn.innerHTML           = AUTOFILL_BTN_DEFAULT_HTML;
    autofillSpinnerEl.style.display = 'none';
  }
}

function showAutofillStatus(msg: string, type: 'success' | 'error' | 'info'): void {
  autofillStatusEl.textContent = msg;
  autofillStatusEl.className   = `status status--${type}`;
  autofillStatusEl.style.display = 'block';
  if (type !== 'error') setTimeout(() => { autofillStatusEl.style.display = 'none'; }, 4000);
}

function renderAutofillResult(msg: AutofillResultMessage): void {
  autofillResultEl.style.display = 'block';

  if (msg.filled.length === 0) {
    autofillFilledEl.innerHTML = '<span style="font-size:12px;color:#94a3b8">No matching fields found on this page.</span>';
  } else {
    autofillFilledEl.innerHTML = msg.filled
      .map((f) => `<span class="autofill-chip">${FIELD_LABEL_MAP[f] ?? f}</span>`)
      .join('');
  }

  const meaningfulSkips = msg.skipped.filter((f) => {
    const v = cachedProfile ? (cachedProfile as unknown as Record<string, unknown>)[f] : null;
    return !!v;
  });

  if (meaningfulSkips.length > 0) {
    autofillSkippedWrap.style.display = 'block';
    autofillSkippedEl.innerHTML = meaningfulSkips
      .map((f) => `<span class="autofill-chip">${FIELD_LABEL_MAP[f] ?? f}</span>`)
      .join('');
  } else {
    autofillSkippedWrap.style.display = 'none';
  }
}

autofillBtn.addEventListener('click', () => {
  if (!cachedProfile || !currentToken) {
    showAutofillStatus('Profile not loaded yet. Try again.', 'error');
    return;
  }

  // Reset accumulator for this new run
  if (autofillAccTimer) { clearTimeout(autofillAccTimer); autofillAccTimer = null; }
  autofillAccFilled   = [];
  autofillAccSkipped  = [];
  autofillAccPlatform = '';
  autofillAccActive   = true;
  autofillExpectedFrames = 0;
  autofillCompletedFrames = 0;

  setAutofillLoading(true);

  void (async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab  = tabs[0];
      if (!tab?.id) { setAutofillLoading(false); showAutofillStatus('No active tab found', 'error'); return; }

      // Download selected resume if any
      const selectedDocId = resumePickerEl.value;
      let autofillResume: { base64: string; filename: string; mimeType: string } | null = null;

      if (selectedDocId) {
        const selectedOpt = resumePickerEl.options[resumePickerEl.selectedIndex];
        const filename = selectedOpt?.dataset['filename'] ?? 'resume.pdf';
        try {
          const res = await fetch(`${currentBackendUrl}/api/documents/${selectedDocId}/download`, {
            headers: { Authorization: `Bearer ${currentToken}` },
          });
          if (res.ok) {
            const mimeType = res.headers.get('content-type') ?? 'application/pdf';
            const buffer = await res.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
            autofillResume = { base64: btoa(binary), filename, mimeType };
          }
        } catch {
          // resume download failed — continue without it
        }
      }

      await chrome.storage.local.set({ autofillProfile: cachedProfile, autofillResume });

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files:  ['dist/formFiller/index.js'],
      });
      
      autofillExpectedFrames = results.length;
      if (autofillAccActive && autofillCompletedFrames >= autofillExpectedFrames) {
        finishAutofill();
      }
    } catch (err) {
      setAutofillLoading(false);
      showAutofillStatus(`Error: ${String(err)}`, 'error');
    }
  })();
});

// ── Send Email tab — prospect search ─────────────────────────────────────────

interface ProspectResult {
  id: string;
  first_name: string;
  last_name?: string | null;
  email: string;
  company_name?: string | null;
}

let searchDebounce: ReturnType<typeof setTimeout> | null = null;

prospectSearchInputEl.addEventListener('input', () => {
  const q = prospectSearchInputEl.value.trim();
  prospectResultsEl.style.display = 'none';

  if (searchDebounce) clearTimeout(searchDebounce);
  if (q.length < 2) return;

  searchDebounce = setTimeout(() => void runProspectSearch(q), 300);
});

prospectSearchInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    prospectResultsEl.style.display = 'none';
    prospectSearchInputEl.value = '';
  }
});

async function runProspectSearch(q: string): Promise<void> {
  try {
    const res = await fetch(
      `${currentBackendUrl}/api/prospects?search=${encodeURIComponent(q)}&limit=8`,
      { headers: { 'Authorization': `Bearer ${currentToken}` } },
    );
    if (res.status === 401) { chrome.storage.sync.remove('auth'); showLoginGate(); return; }
    if (!res.ok) return;
    const json = await res.json() as { data?: ProspectResult[] };
    renderProspectResults(json.data ?? []);
  } catch {
    // network error — silently ignore
  }
}

function renderProspectResults(prospects: ProspectResult[]): void {
  if (prospects.length === 0) {
    prospectResultsEl.innerHTML = '<div class="prospect-result-empty">No prospects found</div>';
  } else {
    prospectResultsEl.innerHTML = prospects.map((p) => {
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
      const meta = [p.email, p.company_name].filter(Boolean).join(' · ');
      return `<div class="prospect-result-item"
                   data-id="${p.id}"
                   data-name="${name}"
                   data-email="${p.email}">
        <div class="prospect-result-name">${name}</div>
        <div class="prospect-result-meta">${meta}</div>
      </div>`;
    }).join('');

    prospectResultsEl.querySelectorAll<HTMLDivElement>('.prospect-result-item').forEach((item) => {
      item.addEventListener('click', () => {
        selectProspect(item.dataset['id']!, item.dataset['name']!, item.dataset['email']!);
      });
    });
  }
  prospectResultsEl.style.display = 'block';
}

function selectProspect(id: string, name: string, email: string): void {
  pendingProspectId = id;

  recipientAvatar.textContent = (name[0] ?? '').toUpperCase();
  recipientName.textContent   = name;
  recipientEmail.textContent  = email;

  prospectSearchEl.style.display  = 'none';
  sendContent.style.display       = 'flex';
  sendContent.style.flexDirection = 'column';
  sendContent.style.gap           = '9px';

  previewEmailBtn.disabled = !templateSelectEl.value;
}

clearProspectBtn.addEventListener('click', () => {
  resetSendState();
});

// ── Send Email tab — templates & compose ─────────────────────────────────────

let templatesLoaded = false;
const templateMap   = new Map<string, TemplateInfo>();
let pendingProspectId: string | null = null;

function showSendStatus(msg: string, type: 'success' | 'error' | 'info'): void {
  sendStatusEl.textContent = msg;
  sendStatusEl.className   = `status status--${type}`;
  sendStatusEl.style.display = 'block';
  if (type !== 'error') setTimeout(() => { sendStatusEl.style.display = 'none'; }, 3000);
}

function getCustomValues(): Record<string, string> {
  const values: Record<string, string> = {};
  customVarsFields.querySelectorAll<HTMLInputElement>('[data-key]').forEach((el) => {
    if (el.dataset['key']) values[el.dataset['key']] = el.value.trim();
  });
  return values;
}

function resetSendState(): void {
  pendingProspectId = null;

  prospectSearchEl.style.display  = 'block';
  prospectSearchInputEl.value     = '';
  prospectResultsEl.style.display = 'none';
  sendContent.style.display       = 'none';

  templateSelectEl.value          = '';
  customVarsSection.style.display = 'none';
  customVarsFields.innerHTML      = '';
  emailPreviewArea.style.display  = 'none';
  sendStatusEl.style.display      = 'none';
  previewEmailBtn.disabled        = true;
  sendEmailBtn.disabled           = true;
}

function onEnterSendTab(): void {
  void loadTemplates();
}

async function loadTemplates(): Promise<void> {
  if (templatesLoaded) return;
  templateSelectEl.innerHTML = '<option value="">Loading templates…</option>';
  try {
    const res = await fetch(`${currentBackendUrl}/api/templates`, {
      headers: { 'Authorization': `Bearer ${currentToken}` },
    });

    if (res.status === 401) { chrome.storage.sync.remove('auth'); showLoginGate(); return; }

    const json      = await res.json() as { data?: TemplateInfo[] };
    const templates = json.data ?? [];

    if (templates.length === 0) {
      templateSelectEl.innerHTML = '<option value="">No templates — create one in the CRM app</option>';
      return;
    }

    templateMap.clear();
    templates.forEach((t) => templateMap.set(t.id, t));
    templateSelectEl.innerHTML =
      '<option value="">Choose a template…</option>' +
      templates.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
    templatesLoaded = true;

    chrome.storage.local.get(['selectedTemplateId'], (local) => {
      const savedId = local['selectedTemplateId'] as string | undefined;
      if (savedId && templateMap.has(savedId)) {
        templateSelectEl.value = savedId;
        templateSelectEl.dispatchEvent(new Event('change'));
      }
    });
  } catch {
    templateSelectEl.innerHTML = '<option value="">Failed to load templates</option>';
  }
}

templateSelectEl.addEventListener('change', () => {
  const templateId = templateSelectEl.value;
  chrome.storage.local.set({ selectedTemplateId: templateId });

  emailPreviewArea.style.display = 'none';
  sendStatusEl.style.display     = 'none';
  sendEmailBtn.disabled          = true;

  const customVars = templateId
    ? (templateMap.get(templateId)?.variables ?? []).filter((v) => v.source === 'custom')
    : [];

  if (customVars.length > 0) {
    customVarsFields.innerHTML = customVars.map((v) =>
      `<div class="field">` +
      `<label class="label">${v.label}</label>` +
      `<input class="input" data-key="${v.key}" type="text" placeholder="${v.defaultValue ?? ''}" />` +
      `</div>`
    ).join('');
    customVarsSection.style.display = 'block';

    const storageKey = `customVars_${templateId}`;
    chrome.storage.local.get([storageKey], (local) => {
      const saved = (local[storageKey] as Record<string, string> | undefined) ?? {};
      customVarsFields.querySelectorAll<HTMLInputElement>('[data-key]').forEach((el) => {
        const k = el.dataset['key'];
        if (k && saved[k]) el.value = saved[k];
      });
    });

    customVarsFields.querySelectorAll<HTMLInputElement>('[data-key]').forEach((el) => {
      const save = () => chrome.storage.local.set({ [`customVars_${templateId}`]: getCustomValues() });
      el.addEventListener('input', save);
      el.addEventListener('change', save);
    });
  } else {
    customVarsSection.style.display = 'none';
    customVarsFields.innerHTML      = '';
  }

  previewEmailBtn.disabled = !templateId || !pendingProspectId;
});

previewEmailBtn.addEventListener('click', () => {
  const templateId = templateSelectEl.value;
  if (!templateId || !pendingProspectId) return;

  previewEmailBtn.disabled    = true;
  previewEmailBtn.textContent = 'Loading…';
  sendEmailBtn.disabled       = true;
  emailPreviewArea.style.display = 'none';
  sendStatusEl.style.display     = 'none';

  void (async () => {
    try {
      const previewRes = await fetch(`${currentBackendUrl}/api/email/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify({ templateId, prospectId: pendingProspectId, customValues: getCustomValues() }),
      });

      if (previewRes.status === 401) { chrome.storage.sync.remove('auth'); showLoginGate(); return; }

      const previewJson = await previewRes.json() as {
        data?: { subject: string; body: string; html: string };
        error?: string;
      };
      if (!previewRes.ok || !previewJson.data) {
        showSendStatus(previewJson.error ?? `Preview failed (${previewRes.status})`, 'error');
        return;
      }

      emailPreviewSubjectEl.textContent = previewJson.data.subject;
      const doc = emailPreviewFrameEl.contentDocument;
      if (doc) { doc.open(); doc.write(previewJson.data.html); doc.close(); }
      emailPreviewArea.style.display = 'block';
      sendEmailBtn.disabled          = false;
    } catch (err) {
      showSendStatus(`Network error: ${String(err)}`, 'error');
    } finally {
      previewEmailBtn.disabled    = false;
      previewEmailBtn.textContent = 'Preview';
    }
  })();
});

sendEmailBtn.addEventListener('click', () => {
  const templateId = templateSelectEl.value;
  if (!templateId || !pendingProspectId) {
    showSendStatus('Preview the email first', 'error');
    return;
  }

  sendEmailBtn.disabled    = true;
  sendEmailBtn.textContent = 'Sending…';
  previewEmailBtn.disabled = true;
  sendStatusEl.style.display = 'none';

  void (async () => {
    try {
      const res = await fetch(`${currentBackendUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify({ templateId, prospectId: pendingProspectId, customValues: getCustomValues() }),
      });

      if (res.status === 401) { chrome.storage.sync.remove('auth'); showLoginGate(); return; }

      const json = await res.json() as { error?: string };
      if (!res.ok) {
        showSendStatus(json.error ?? `Send failed (${res.status})`, 'error');
        sendEmailBtn.disabled    = false;
        sendEmailBtn.textContent = 'Send Email';
        previewEmailBtn.disabled = false;
        return;
      }

      showSendStatus('Email sent ✓', 'success');
      chrome.storage.local.remove(['selectedTemplateId', `customVars_${templateId}`]);
      resetSendState();
    } catch (err) {
      showSendStatus(`Network error: ${String(err)}`, 'error');
      sendEmailBtn.disabled    = false;
      sendEmailBtn.textContent = 'Send Email';
      previewEmailBtn.disabled = false;
    } finally {
      sendEmailBtn.textContent = 'Send Email';
    }
  })();
});

// ── Quick Email Mode Logic ───────────────────────────────────────────────────

sendModeRadios.forEach((radio) => {
  radio.addEventListener('change', (e) => {
    const mode = (e.target as HTMLInputElement).value;
    if (mode === 'template') {
      templateModeContent.style.display = 'block';
      quickEmailModeContent.style.display = 'none';
    } else {
      templateModeContent.style.display = 'none';
      quickEmailModeContent.style.display = 'block';
    }
  });
});

function showQuickStatus(msg: string, type: 'success' | 'error' | 'info') {
  quickEmailStatusEl.textContent = msg;
  quickEmailStatusEl.className = `status status--${type}`;
  quickEmailStatusEl.style.display = 'block';
}

quickSendEmailBtn.addEventListener('click', () => {
  const email = quickEmailToEl.value.trim();
  const subject = quickEmailSubjectEl.value.trim();
  const body = quickEmailBodyEl.value.trim();

  if (!email || !subject || !body) {
    showQuickStatus('Email, Subject, and Message are required', 'error');
    return;
  }

  quickSendEmailBtn.disabled = true;
  quickSendEmailBtn.textContent = 'Sending…';
  quickEmailStatusEl.style.display = 'none';

  void (async () => {
    try {
      const auth = (await chrome.storage.sync.get('auth'))['auth'] as { token: string } | undefined;
      const res = await fetch(`${currentBackendUrl}/api/email/quick-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}) },
        body: JSON.stringify({ email, subject, body }),
      });

      if (res.status === 401) { chrome.storage.sync.remove('auth'); showLoginGate(); return; }

      const json = await res.json() as { error?: string };
      if (!res.ok) {
        showQuickStatus(json.error ?? `Send failed (${res.status})`, 'error');
        return;
      }

      showQuickStatus('Quick Email sent ✓', 'success');
      quickEmailToEl.value = '';
      quickEmailSubjectEl.value = '';
      quickEmailBodyEl.value = '';
    } catch (err) {
      showQuickStatus(`Network error: ${String(err)}`, 'error');
    } finally {
      quickSendEmailBtn.disabled = false;
      quickSendEmailBtn.textContent = 'Send Now';
    }
  })();
});

quickScheduleEmailBtn.addEventListener('click', () => {
  quickSchedulePicker.style.display = quickSchedulePicker.style.display === 'none' ? 'block' : 'none';
});

quickConfirmScheduleBtn.addEventListener('click', () => {
  const email = quickEmailToEl.value.trim();
  const subject = quickEmailSubjectEl.value.trim();
  const body = quickEmailBodyEl.value.trim();
  const scheduledFor = quickScheduleDateEl.value;

  if (!email || !subject || !body || !scheduledFor) {
    showQuickStatus('All fields and date are required', 'error');
    return;
  }

  quickConfirmScheduleBtn.disabled = true;
  quickConfirmScheduleBtn.textContent = 'Scheduling…';
  quickEmailStatusEl.style.display = 'none';

  void (async () => {
    try {
      const auth = (await chrome.storage.sync.get('auth'))['auth'] as { token: string } | undefined;
      const res = await fetch(`${currentBackendUrl}/api/schedules/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}) },
        body: JSON.stringify({ email, subject, body, scheduledFor }),
      });

      if (res.status === 401) { chrome.storage.sync.remove('auth'); showLoginGate(); return; }

      const json = await res.json() as { error?: string };
      if (!res.ok) {
        showQuickStatus(json.error ?? `Schedule failed (${res.status})`, 'error');
        return;
      }

      showQuickStatus('Quick Email scheduled ✓', 'success');
      quickEmailToEl.value = '';
      quickEmailSubjectEl.value = '';
      quickEmailBodyEl.value = '';
      quickScheduleDateEl.value = '';
      quickSchedulePicker.style.display = 'none';
    } catch (err) {
      showQuickStatus(`Network error: ${String(err)}`, 'error');
    } finally {
      quickConfirmScheduleBtn.disabled = false;
      quickConfirmScheduleBtn.textContent = 'Confirm Schedule';
    }
  })();
});
