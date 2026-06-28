import type { FieldType } from './types';

export type FillableEl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;

// Order matters: more-specific patterns must come before broader ones that share keywords.
// e.g. address_line1 must precede location (location has /\baddress\b/ which would false-match
// "Address Line 1" if location were checked first).
export const PATTERNS: Record<FieldType, RegExp[]> = {
  first_name:         [/\bfirst[\s_-]?name\b/i, /\bgiven[\s_-]?name\b/i, /\bfname\b/i],
  last_name:          [/\blast[\s_-]?name\b/i, /\bfamily[\s_-]?name\b/i, /\bsurname\b/i, /\blname\b/i],
  full_name:          [/\bfull[\s_-]?name\b/i, /^name$/i, /\byour[\s_-]?name\b/i, /\bcandidate[\s_-]?name\b/i],
  email:              [/\be[\s_-]?mail\b/i, /\bemail[\s_-]?address\b/i],
  phone:              [/\bphone\b(?![\s_-]*ext)/i, /\bmobile\b/i, /\bcell\b/i, /\btelephone\b/i, /\btel\b/i],
  phone_country_code: [/\bphone[\s_-]?country[\s_-]?code\b/i, /\bdial[\s_-]?code\b/i, /\bcountry[\s_-]?code\b/i, /\bphone[\s_-]?code\b/i, /\bphone[\s_-]?ext(?:ension)?\b/i],
  // address_line1 before location — "Address Line 1" contains "address" which location also matches
  address_line1:      [/\baddress[\s_-]?line[\s_-]?1\b/i, /\baddressLine1\b/i, /\bstreet[\s_-]?address\b/i, /\bstreet[\s_-]?line[\s_-]?1\b/i],
  postal_code:        [/\bpostal[\s_-]?code\b/i, /\bzip[\s_-]?code\b/i, /\bpin[\s_-]?code\b/i, /\bpostalCode\b/i, /\bzip\b/i],
  city:               [/\bcity\b/i, /\btown\b/i, /\blocality\b/i],
  state:              [/\bstate\b/i, /\bprovince\b/i, /\bregion\b/i],
  country:            [/\bcountry\b/i, /\bnation\b/i],
  linkedin_url:       [/\blinkedin\b/i, /\blinked[\s_-]?in\b/i],
  github_url:         [/\bgithub\b/i, /\bgit[\s_-]?hub\b/i],
  website:            [/\bwebsite\b/i, /\bportfolio\b/i, /\bpersonal[\s_-]?url\b/i, /\bpersonal[\s_-]?site\b/i, /\bhomepage\b/i],
  current_company:    [/\bcompany\b/i, /\bemployer\b/i, /\borganization\b/i, /\borganisation\b/i, /\bcurrent[\s_-]?company\b/i, /\bprevious[\s_-]?employer\b/i],
  job_title:          [/\bjob[\s_-]?title\b/i, /\bcurrent[\s_-]?title\b/i, /\bposition\b/i, /\bcurrent[\s_-]?role\b/i, /\bprevious[\s_-]?job[\s_-]?title\b/i],
  work_authorization: [/\bwork[\s_-]?auth/i, /\bauthorized[\s_-]?to[\s_-]?work\b/i, /\bvisa[\s_-]?status\b/i, /\bwork[\s_-]?eligib/i, /\bsponsorship\b/i, /\beligible[\s_-]?to[\s_-]?work\b/i],
  location:           [/\bcurrent[\s_-]?location\b/i, /\blocation\b/i, /\baddress\b/i],
  hometown:           [/\bhometown\b/i, /\bhome[\s_-]?town\b/i, /\bbirth[\s_-]?place\b/i, /\bhome[\s_-]?city\b/i],
  years_of_experience:[/\byears?[\s_-]?of[\s_-]?exp/i, /\btotal[\s_-]?exp/i, /\bwork[\s_-]?exp/i, /\bexperience[\s_-]?years?\b/i],
  notice_period:      [/\bnotice[\s_-]?period\b/i, /\bnotice\b/i, /\bavailability\b/i, /\bjoin[\s_-]?in\b/i],
  current_ctc:        [/\bcurrent[\s_-]?ctc\b/i, /\bcurrent[\s_-]?salary\b/i, /\bcurrent[\s_-]?comp/i, /\bpresent[\s_-]?ctc\b/i],
  expected_ctc:       [/\bexpected[\s_-]?ctc\b/i, /\bexpected[\s_-]?salary\b/i, /\bdesired[\s_-]?salary\b/i, /\bexpected[\s_-]?comp/i],
  education:          [/\beducation\b/i, /\bdegree\b/i, /\bqualification\b/i, /\bhighest[\s_-]?education\b/i],
  college_name:       [/\bcollege\b/i, /\buniversity\b/i, /\binstitution\b/i, /\bschool[\s_-]?name\b/i, /\bschool\b/i, /\balma[\s_-]?mater\b/i],
  graduation_year:    [/\byear[\s_-]?of[\s_-]?comp(?:letion)?\b/i, /\bgraduation[\s_-]?year\b/i, /\bpassing[\s_-]?year\b/i, /\bcompletion[\s_-]?year\b/i, /\bgrad(?:uation)?[\s_-]?yr\b/i],
  gender:             [/\bgender\b/i, /\bsex\b/i],
  veteran_status:     [/\bveteran[\s_-]?status\b/i, /\bveteran\b/i],
};

export function matchesAny(text: string, type: FieldType): boolean {
  return PATTERNS[type].some((r) => r.test(text));
}

export function getLabelText(el: FillableEl): string {
  const aria = el.getAttribute('aria-label') ?? '';
  if (aria) return aria;

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy.trim().split(/\s+/)
      .map(id => document.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ')
      .trim();
    if (text) return text;
  }

  if (el.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.textContent ?? '';
  }

  // Walk up to a form-group-like ancestor and find a label inside it
  const ancestor = el.closest(
    '.field, .form-group, .form-field, .input-group, [class*="field"], [class*="form-group"], [class*="form-row"]'
  );
  if (ancestor) {
    const label = ancestor.querySelector('label, [class*="label"]');
    if (label && !label.contains(el)) return label.textContent ?? '';
  }

  return '';
}

export function classifyElement(el: FillableEl): FieldType | null {
  const asInput = el as Partial<HTMLInputElement>;
  const candidates = [
    asInput.name ?? '',
    el.id ?? '',
    asInput.placeholder ?? '',
    getLabelText(el),
  ].join(' ');

  for (const type of Object.keys(PATTERNS) as FieldType[]) {
    if (matchesAny(candidates, type)) return type;
  }
  return null;
}

const RESUME_LABEL_PATTERNS = [/\bresume\b/i, /\bcv\b/i, /\bcurriculum[\s_-]?vitae\b/i, /\bupload[\s_-]?(?:your\s+)?(?:resume|cv)\b/i, /\battach[\s_-]?(?:your\s+)?(?:resume|cv)\b/i];

export function detectResumeInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter(el => {
    // Standard: name, id, data-automation-id, aria/label text
    const candidates = [
      el.name ?? '',
      el.id ?? '',
      el.getAttribute('data-automation-id') ?? '',
      getLabelText(el as FillableEl),
    ].join(' ');
    if (RESUME_LABEL_PATTERNS.some(r => r.test(candidates))) return true;

    // Workday / custom portals: walk up to find a nearby section heading (h2–h6, legend)
    // e.g. Workday has <h4>Resume/CV</h4> above the file input with no <label> association.
    let parent: Element | null = el.parentElement;
    for (let i = 0; i < 8 && parent; i++, parent = parent.parentElement) {
      for (const h of Array.from(parent.querySelectorAll('h2,h3,h4,h5,h6,legend'))) {
        if (!h.contains(el) && RESUME_LABEL_PATTERNS.some(r => r.test(h.textContent ?? ''))) {
          return true;
        }
      }
    }
    return false;
  });
}

const FORM_ELEMENT_QUERY =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
  ':not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="image"]),' +
  'textarea, select,' +
  'button[aria-haspopup="listbox"],' +
  'mat-select, [role="combobox"]:not(input):not(select):not(textarea)';

export function detectFields(): Map<FieldType, FillableEl> {
  const result = new Map<FieldType, FillableEl>();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(FORM_ELEMENT_QUERY))) {
    const type = classifyElement(el as FillableEl);
    if (type && !result.has(type)) {
      result.set(type, el);
    }
  }
  return result;
}

// Like detectFields but returns ALL matching elements per type.
// Needed when a form shows duplicate "Local" + "English" variants of the same field
// (e.g. Workday's addressLine1 + addressLine1Local, cityLocal + city).
export function detectAllFields(): Map<FieldType, FillableEl[]> {
  const result = new Map<FieldType, FillableEl[]>();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(FORM_ELEMENT_QUERY))) {
    const type = classifyElement(el as FillableEl);
    if (!type) continue;
    const list = result.get(type) ?? [];
    list.push(el as FillableEl);
    result.set(type, list);
  }
  return result;
}
