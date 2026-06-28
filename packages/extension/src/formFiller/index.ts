import type { UserProfile, FieldType, SelectorMap, FillResult, WorkExperienceEntry } from './types';
import { ALL_FIELD_TYPES } from './types';
import { detectFields, detectResumeInputs } from './detector';
import { fillElement, fillItiPhone, fillResumeInput } from './filler';
import { fill as fillGreenhouse }     from './platforms/greenhouse';
import { SELECTOR_MAP as LEVER }      from './platforms/lever';
import { fill as fillWorkday }        from './platforms/workday';
import { SELECTOR_MAP as GENERIC }    from './platforms/generic';
import { fill as fillGoogleForms }    from './platforms/google-forms';

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type PlatformInfo =
  | { name: string; kind: 'selector'; map: SelectorMap }
  | { name: string; kind: 'custom'; fill: (profile: UserProfile) => Promise<Omit<FillResult, 'platform'>> | Omit<FillResult, 'platform'> };

function detectPlatform(): PlatformInfo {
  const host = window.location.hostname;
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  if (host.includes('greenhouse.io'))                                      return { name: 'Greenhouse',   kind: 'custom',   fill: fillGreenhouse };
  if (host.includes('lever.co'))                                           return { name: 'Lever',         kind: 'selector', map: LEVER };
  if (host.includes('workday.com') || host.includes('myworkdayjobs.com')) return { name: 'Workday',       kind: 'custom',   fill: fillWorkday };
  if (host.includes('docs.google.com') && path.includes('/forms/'))       return { name: 'Google Forms',  kind: 'custom',   fill: fillGoogleForms };

  // Greenhouse embed detection: company career pages embed Greenhouse via gh_jid param
  // or by injecting the Greenhouse application form directly into their own domain.
  if (params.has('gh_jid') || document.querySelector('#greenhouse_application, form[action*="greenhouse"]')) {
    return { name: 'Greenhouse', kind: 'custom', fill: fillGreenhouse };
  }

  return { name: 'Generic', kind: 'selector', map: GENERIC };
}

// Parse a date string (YYYY-MM-DD, YYYY-MM, "Mon YYYY", "YYYY") into { year, month, day }.
function parseDate(raw: string): { year: number; month: number; day: number } | null {
  const s = raw.trim();
  // ISO full: 2021-06-15
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { year: +m[1]!, month: +m[2]!, day: +m[3]! };
  // ISO partial: 2021-06
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return { year: +m[1]!, month: +m[2]!, day: 1 };
  // "Jun 2021" or "June 2021"
  m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const mo = new Date(`${m[1]} 1, ${m[2]}`).getMonth() + 1;
    if (!isNaN(mo)) return { year: +m[2]!, month: mo, day: 1 };
  }
  // Just a year: 2021
  m = s.match(/^(\d{4})$/);
  if (m) return { year: +m[1]!, month: 1, day: 1 };
  return null;
}

// Fill the MUI Popover calendar (rdp-root) date picker.
// Each <td role="gridcell"> carries data-day="YYYY-MM-DD" and data-outside="true" for
// days that belong to adjacent months. Navigation buttons use exact aria-label text.
async function fillDatePickerButton(btn: HTMLElement, raw: string): Promise<boolean> {
  const parsed = parseDate(raw);
  if (!parsed) return false;

  const targetISO      = `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
  const targetMonthISO = targetISO.substring(0, 7); // "YYYY-MM"

  btn.click();
  await wait(400);

  const findCal = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('.MuiPopover-paper .rdp-root') ??
    document.querySelector<HTMLElement>('.rdp-root');

  let cal = findCal();
  if (!cal) return false;

  // Navigate up to 4 years (48 months) toward the target month, then click the day.
  for (let i = 0; i < 48; i++) {
    // Check if the target day is visible as a current-month cell (not an outside-month day)
    const cell = cal.querySelector<HTMLElement>(`td[data-day="${targetISO}"]:not([data-outside])`);
    if (cell) {
      const dayBtn = cell.querySelector<HTMLElement>('button');
      if (dayBtn) { dayBtn.click(); await wait(200); return true; }
    }

    // Determine current month from any non-outside cell's data-day attribute
    const anyCell = cal.querySelector<HTMLElement>('td[data-day]:not([data-outside])');
    if (!anyCell) break;
    const currentMonthISO = anyCell.getAttribute('data-day')!.substring(0, 7); // "YYYY-MM"

    if (currentMonthISO === targetMonthISO) break; // right month but day not found (shouldn't happen)

    const goNext = currentMonthISO < targetMonthISO;
    const navBtn = cal.querySelector<HTMLElement>(
      goNext
        ? 'button[aria-label="Go to the Next Month"]'
        : 'button[aria-label="Go to the Previous Month"]'
    );
    if (!navBtn) break;
    navBtn.click();
    await wait(300);
    cal = findCal() ?? cal;
  }

  // Could not select the date — close the calendar by clicking the trigger again
  btn.click();
  return false;
}

// Find the date picker buttons and "Till Date" checkbox for an indexed experience section.
// Walks up from any named input until reaching a container that holds both the exp inputs
// and at least one date picker button, then queries within that container.
function findExpDatePickers(expIndex: number): {
  fromBtn: HTMLElement | null;
  toBtn: HTMLElement | null;
  tillCheckbox: HTMLInputElement | null;
} {
  const anyInput = document.querySelector<HTMLElement>(`[name^="applicant_exp[${expIndex}]"]`);
  if (!anyInput) return { fromBtn: null, toBtn: null, tillCheckbox: null };

  let container: HTMLElement | null = anyInput.parentElement;
  while (container) {
    const hasInput   = container.querySelector(`[name^="applicant_exp[${expIndex}]"]`) !== null;
    const hasDateBtn = container.querySelector('[role="button"][aria-haspopup="dialog"]') !== null;
    if (hasInput && hasDateBtn) break;
    container = container.parentElement;
  }

  if (!container) return { fromBtn: null, toBtn: null, tillCheckbox: null };

  const dateBtns    = Array.from(container.querySelectorAll<HTMLElement>('[role="button"][aria-haspopup="dialog"]'));
  const tillCheckbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
  return { fromBtn: dateBtns[0] ?? null, toBtn: dateBtns[1] ?? null, tillCheckbox };
}

async function fillWorkExperienceSections(profile: UserProfile): Promise<string[]> {
  const filled: string[] = [];
  const experiences = profile.work_experiences;
  if (!experiences?.length) return filled;

  // Count how many indexed experience sections exist in the DOM
  const getExpIndices = (): number[] => {
    const indices = new Set<number>();
    document.querySelectorAll<HTMLElement>('[name^="applicant_exp["]').forEach(el => {
      const m = el.getAttribute('name')?.match(/applicant_exp\[(\d+)\]/);
      if (m?.[1] !== undefined) indices.add(parseInt(m[1]));
    });
    return Array.from(indices).sort((a, b) => a - b);
  };

  if (getExpIndices().length === 0) return filled; // page doesn't use this pattern

  // Find the "+" add button by walking up from any experience input to the section
  const findAddBtn = (): HTMLElement | null => {
    const firstInput = document.querySelector('[name^="applicant_exp["]');
    if (!firstInput) return null;
    let el: Element | null = firstInput;
    while (el) {
      // Look for a button inside a title/header sibling of the grid list
      const titleBtn = el.querySelector<HTMLElement>('[class*="_title_"] button, [class*="title-"] button');
      if (titleBtn) return titleBtn;
      el = el.parentElement;
    }
    return null;
  };

  // Add extra sections until we have enough for all experiences
  let indices = getExpIndices();
  for (let i = indices.length; i < experiences.length; i++) {
    const addBtn = findAddBtn();
    if (!addBtn) break;
    addBtn.click();
    await wait(700);
    const next = getExpIndices();
    if (next.length <= indices.length) break;
    indices = next;
  }

  indices = getExpIndices();

  for (let i = 0; i < Math.min(experiences.length, indices.length); i++) {
    const idx = indices[i]!;
    const exp: WorkExperienceEntry = experiences[i]!;

    const sel = (field: string) =>
      document.querySelector<HTMLInputElement>(`[name="applicant_exp[${idx}].${field}"]`);

    const companyInput = sel('PREV_COMPANY_NAME');
    const titleInput   = sel('JOB_TITLE');
    const descInput    = sel('JOB_DESCRIPTION');

    if (companyInput && exp.company) {
      await fillElement(companyInput, exp.company);
      filled.push(`work_exp_${i}_company`);
    }
    if (titleInput && exp.title) {
      await fillElement(titleInput, exp.title);
      filled.push(`work_exp_${i}_title`);
    }
    if (descInput && exp.description) {
      await fillElement(descInput, exp.description);
      filled.push(`work_exp_${i}_description`);
    }

    // Dates
    const { fromBtn, toBtn, tillCheckbox } = findExpDatePickers(idx);
    if (fromBtn && exp.start_date) {
      const ok = await fillDatePickerButton(fromBtn, exp.start_date);
      if (ok) filled.push(`work_exp_${i}_start_date`);
    }
    if (!exp.end_date) {
      // Current position — check the "Till Date / Present" checkbox
      if (tillCheckbox && !tillCheckbox.checked) {
        (tillCheckbox.closest('label') as HTMLElement | null)?.click();
        if (!tillCheckbox.checked) tillCheckbox.click();
        filled.push(`work_exp_${i}_till_date`);
      }
    } else if (toBtn) {
      const ok = await fillDatePickerButton(toBtn, exp.end_date);
      if (ok) filled.push(`work_exp_${i}_end_date`);
    }
  }

  return filled;
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

  // Fill multiple indexed work experience sections (e.g. applicant_exp[N].FIELD pattern)
  const expFilled = await fillWorkExperienceSections(profile);
  filled.push(...expFilled);

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
