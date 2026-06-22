import type { UserProfile, FieldType, FillResult } from '../types';
import { ALL_FIELD_TYPES } from '../types';

// Ordered list of (pattern → FieldType) pairs for matching question headings
const QUESTION_PATTERNS: [RegExp, FieldType][] = [
  [/\bfirst[\s_-]?name\b/i,              'first_name'],
  [/\blast[\s_-]?name\b/i,               'last_name'],
  [/\bfull[\s_-]?name\b/i,               'full_name'],
  [/^name$/i,                             'full_name'],
  [/\byour[\s_-]?name\b/i,               'full_name'],
  [/\be[\s_-]?mail\b/i,                  'email'],
  [/\bphone[\s_-]?country[\s_-]?code\b/i, 'phone_country_code'],
  [/\bdial[\s_-]?code\b/i,               'phone_country_code'],
  [/\bcountry[\s_-]?code\b/i,            'phone_country_code'],
  [/\bphone\b/i,                          'phone'],
  [/\bmobile\b/i,                         'phone'],
  [/\bcurrent[\s_-]?location\b/i,         'location'],
  [/\blocation\b/i,                       'location'],
  [/\bhometown\b/i,                       'hometown'],
  [/\bhome[\s_-]?city\b/i,               'hometown'],
  [/\blinkedin\b/i,                       'linkedin_url'],
  [/\bgithub\b/i,                         'github_url'],
  [/\bwebsite\b/i,                        'website'],
  [/\bportfolio\b/i,                      'website'],
  [/\btotal[\s_-]?years?[\s_-]?of[\s_-]?exp/i, 'years_of_experience'],
  [/\byears?[\s_-]?of[\s_-]?exp/i,       'years_of_experience'],
  [/\bnotice[\s_-]?period\b/i,            'notice_period'],
  [/\bcurrent[\s_-]?ctc\b/i,             'current_ctc'],
  [/\bcurrent[\s_-]?salary\b/i,          'current_ctc'],
  [/\bexpected[\s_-]?ctc\b/i,            'expected_ctc'],
  [/\bexpected[\s_-]?salary\b/i,         'expected_ctc'],
  [/\beducation\b/i,                      'education'],
  [/\bdegree\b/i,                         'education'],
  [/\bcollege[\s_-]?name\b/i,            'college_name'],
  [/\buniversity\b/i,                     'college_name'],
  [/\bcollege\b/i,                        'college_name'],
  [/\bjob[\s_-]?title\b/i,               'job_title'],
  [/\bcurrent[\s_-]?company\b/i,         'current_company'],
  [/\bcompany\b/i,                        'current_company'],
  [/\bwork[\s_-]?auth/i,                 'work_authorization'],
  [/\bcity\b/i,                           'city'],
  [/\bstate\b/i,                          'state'],
  [/\bcountry\b/i,                        'country'],
];

function getQuestionText(container: Element): string {
  // Google Forms heading text lives in role=heading > span.M7eMe
  const heading = container.querySelector('[role="heading"]');
  if (!heading) return '';
  const span = heading.querySelector('.M7eMe');
  return (span ?? heading).textContent?.trim() ?? '';
}

function classifyQuestion(text: string): FieldType | null {
  for (const [re, type] of QUESTION_PATTERNS) {
    if (re.test(text)) return type;
  }
  return null;
}

function profileValue(profile: UserProfile, type: FieldType): string | null {
  if (type === 'full_name') {
    return [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null;
  }
  return (profile as unknown as Record<string, string | null>)[type] ?? null;
}

function fillTextInput(input: HTMLInputElement, value: string): boolean {
  input.focus();
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (nativeSetter) nativeSetter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event('input',  { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur',   { bubbles: true }));
  return true;
}

function fillRadioGroup(container: Element, value: string): boolean {
  const lower = value.toLowerCase().trim();
  const allRadios = Array.from(container.querySelectorAll<HTMLElement>('[role="radio"]'));
  if (!allRadios.length) return false;

  // Only match named options — never auto-select the "__other_option__" catch-all
  const named = allRadios.filter(r => r.getAttribute('data-value') !== '__other_option__');

  // Exact match on data-value or aria-label
  for (const radio of named) {
    const dv    = (radio.getAttribute('data-value') ?? '').toLowerCase().trim();
    const label = (radio.getAttribute('aria-label')  ?? '').toLowerCase().trim();
    if (dv === lower || label === lower) { radio.click(); return true; }
  }

  // Contains match
  for (const radio of named) {
    const dv    = (radio.getAttribute('data-value') ?? '').toLowerCase().trim();
    const label = (radio.getAttribute('aria-label')  ?? '').toLowerCase().trim();
    if (dv.includes(lower) || lower.includes(dv) || label.includes(lower) || lower.includes(label)) {
      radio.click();
      return true;
    }
  }

  // No named option matched — click "Other" and fill its text input
  const otherRadio = container.querySelector<HTMLElement>('[role="radio"][data-value="__other_option__"]');
  if (otherRadio) {
    otherRadio.click();
    const otherInput = container.querySelector<HTMLInputElement>('input.Hvn9fb, input[aria-label="Other response"]');
    if (otherInput) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) nativeSetter.call(otherInput, value);
      else otherInput.value = value;
      otherInput.dispatchEvent(new Event('input',  { bubbles: true }));
      otherInput.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }

  return false;
}

export function fill(profile: UserProfile): Omit<FillResult, 'platform'> {
  const filled: string[] = [];
  const skipped: string[] = [];

  // Track which field types have already been matched so we don't double-fill
  const seen = new Set<FieldType>();

  const containers = Array.from(document.querySelectorAll('.geS5n, .freebirdFormviewerViewItemsItemItem'));

  // Pre-scan: determine which field types actually exist in this form.
  // We only skip full_name if the form has BOTH first_name and last_name questions.
  const formTypes = new Set<FieldType>();
  for (const container of containers) {
    const t = classifyQuestion(getQuestionText(container));
    if (t) formTypes.add(t);
  }

  for (const container of containers) {
    const questionText = getQuestionText(container);
    if (!questionText) continue;

    const type = classifyQuestion(questionText);
    if (!type || seen.has(type)) continue;

    // Skip full_name only when the form has dedicated first + last name fields
    if (type === 'full_name' && formTypes.has('first_name') && formTypes.has('last_name')) {
      seen.add(type);
      continue;
    }

    const value = profileValue(profile, type);
    if (!value) {
      skipped.push(type);
      seen.add(type);
      continue;
    }

    // Check for radio group FIRST — radio containers embed text inputs for the
    // "Other" option, so querying for text inputs would hit those by mistake.
    const hasRadios = container.querySelector('[role="radio"]');
    if (hasRadios) {
      const ok = fillRadioGroup(container, value);
      (ok ? filled : skipped).push(type);
      seen.add(type);
      continue;
    }

    // Try textarea
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    if (textarea) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeSetter) nativeSetter.call(textarea, value);
      else textarea.value = value;
      textarea.dispatchEvent(new Event('input',  { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      filled.push(type);
      seen.add(type);
      continue;
    }

    // Try standard text input (whsOnd is Google Forms' main text input class)
    const input = container.querySelector<HTMLInputElement>('input.whsOnd, input[type="email"]');
    if (input) {
      const ok = fillTextInput(input, value);
      (ok ? filled : skipped).push(type);
      seen.add(type);
      continue;
    }

    skipped.push(type);
    seen.add(type);
  }

  // Report field types that weren't found at all
  for (const type of ALL_FIELD_TYPES) {
    if (!seen.has(type)) {
      const value = profileValue(profile, type);
      if (value) skipped.push(type);
    }
  }

  return { filled, skipped };
}
