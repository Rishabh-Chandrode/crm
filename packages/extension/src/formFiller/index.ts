import type { UserProfile, FieldType, SelectorMap, FillResult } from './types';
import { ALL_FIELD_TYPES } from './types';
import { detectFields, detectResumeInputs } from './detector';
import { fillElement, fillItiPhone, fillResumeInput } from './filler';
import { fill as fillGreenhouse }     from './platforms/greenhouse';
import { SELECTOR_MAP as LEVER }      from './platforms/lever';
import { SELECTOR_MAP as WORKDAY }    from './platforms/workday';
import { SELECTOR_MAP as GENERIC }    from './platforms/generic';
import { fill as fillGoogleForms }    from './platforms/google-forms';

type PlatformInfo =
  | { name: string; kind: 'selector'; map: SelectorMap }
  | { name: string; kind: 'custom'; fill: (profile: UserProfile) => Promise<Omit<FillResult, 'platform'>> | Omit<FillResult, 'platform'> };

function detectPlatform(): PlatformInfo {
  const host = window.location.hostname;
  const path = window.location.pathname;
  if (host.includes('greenhouse.io'))                                      return { name: 'Greenhouse',   kind: 'custom',   fill: fillGreenhouse };
  if (host.includes('lever.co'))                                           return { name: 'Lever',         kind: 'selector', map: LEVER };
  if (host.includes('workday.com') || host.includes('myworkdayjobs.com')) return { name: 'Workday',       kind: 'selector', map: WORKDAY };
  if (host.includes('docs.google.com') && path.includes('/forms/'))       return { name: 'Google Forms',  kind: 'custom',   fill: fillGoogleForms };
  return { name: 'Generic', kind: 'selector', map: GENERIC };
}

function profileValue(profile: UserProfile, type: FieldType): string | null {
  if (type === 'full_name') {
    return [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null;
  }
  return (profile as unknown as Record<string, string | null>)[type] ?? null;
}

async function run(profile: UserProfile): Promise<FillResult> {
  const platform = detectPlatform();

  // Platforms with a custom fill function handle everything themselves
  if (platform.kind === 'custom') {
    const result = await platform.fill(profile);
    return { ...result, platform: platform.name };
  }

  const { map } = platform;

  // Collect elements: selector map first, then generic detector for anything left
  const elements = new Map<FieldType, Element>();

  for (const type of ALL_FIELD_TYPES) {
    const selector = map[type];
    if (selector) {
      const el = document.querySelector(selector);
      if (el) elements.set(type, el);
    }
  }

  const generic = detectFields();
  for (const [type, el] of generic.entries()) {
    if (!elements.has(type)) elements.set(type, el);
  }

  const filled: string[] = [];
  const skipped: string[] = [];

  for (const type of ALL_FIELD_TYPES) {
    const el = elements.get(type);
    if (!el) continue;

    // If both first_name and last_name are found, skip full_name to avoid overlap
    if (type === 'full_name' && elements.has('first_name') && elements.has('last_name')) continue;

    const value = profileValue(profile, type);
    if (!value) { skipped.push(type); continue; }

    let ok: boolean;
    if (type === 'phone' && el instanceof HTMLInputElement) {
      ok = await fillItiPhone(el, value, profileValue(profile, 'phone_country_code'));
    } else {
      ok = await fillElement(el, value);
    }
    (ok ? filled : skipped).push(type);
  }

  return { filled, skipped, platform: platform.name };
}

interface StoredResume { base64: string; filename: string; mimeType: string; }

function extractJobInfo(): { company_name: string; job_title: string; job_url: string; platform: string } {
  const url = window.location.href;
  const hostname = window.location.hostname;

  const h1 = document.querySelector('h1');
  const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content;
  let jobTitle = h1?.textContent?.trim() ?? ogTitle ?? document.title;
  // Strip trailing "| Company" suffixes
  jobTitle = jobTitle.replace(/\s*[-|·—]\s*.+$/, '').trim();

  let company = '';
  let platform = 'Generic';

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
  } else {
    const siteName = document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content;
    company = siteName ?? hostname;
  }

  return {
    company_name: company || 'Unknown Company',
    job_title: jobTitle || 'Unknown Position',
    job_url: url,
    platform,
  };
}

function setupSubmitDetector(): void {
  let tracked = false;

  const send = (): void => {
    if (tracked) return;
    tracked = true;
    void chrome.runtime.sendMessage({ action: 'applicationSubmitted', ...extractJobInfo() });
  };

  // Native form submit (works on Greenhouse, some Lever variants)
  document.addEventListener('submit', send, { capture: true });

  // Button clicks for AJAX forms — find all submit-like buttons
  document.querySelectorAll<HTMLElement>('button[type="submit"], input[type="submit"]').forEach(btn => {
    btn.addEventListener('click', send, { capture: true });
  });

  // Buttons whose label says "Submit" or "Apply"
  document.querySelectorAll<HTMLElement>('button, [role="button"]').forEach(btn => {
    const text = (btn.textContent ?? '').trim().toLowerCase();
    if (/\b(submit|apply)\b/.test(text)) {
      btn.addEventListener('click', send, { capture: true });
    }
  });
}

chrome.storage.local.get(['autofillProfile', 'autofillResume'], (stored) => {
  const profile = stored['autofillProfile'] as UserProfile | undefined;
  const resume  = stored['autofillResume']  as StoredResume | null | undefined;

  if (!profile) {
    void chrome.runtime.sendMessage({ action: 'autofillResult', filled: [], skipped: [], platform: 'unknown', error: 'No profile data' });
    return;
  }

  run(profile).then(result => {
    // Fill resume file inputs after text fields
    if (resume) {
      const inputs = detectResumeInputs();
      for (const input of inputs) {
        const ok = fillResumeInput(input, resume.base64, resume.filename, resume.mimeType);
        if (ok) result.filled.push('resume');
      }
    }
    void chrome.runtime.sendMessage({ action: 'autofillResult', ...result });
    // Set up submit detection so the application is tracked on form submission
    setupSubmitDetector();
  });
});
