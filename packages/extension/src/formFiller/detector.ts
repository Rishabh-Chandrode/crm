import type { FieldType } from './types';

export type FillableEl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;

const PATTERNS: Record<FieldType, RegExp[]> = {
  first_name:         [/\bfirst[\s_-]?name\b/i, /\bgiven[\s_-]?name\b/i, /\bfname\b/i],
  last_name:          [/\blast[\s_-]?name\b/i, /\bfamily[\s_-]?name\b/i, /\bsurname\b/i, /\blname\b/i],
  full_name:          [/\bfull[\s_-]?name\b/i, /^name$/i, /\byour[\s_-]?name\b/i, /\bcandidate[\s_-]?name\b/i],
  email:              [/\be[\s_-]?mail\b/i, /\bemail[\s_-]?address\b/i],
  phone:              [/\bphone\b/i, /\bmobile\b/i, /\bcell\b/i, /\btelephone\b/i, /\btel\b/i],
  phone_country_code: [/\bphone[\s_-]?country[\s_-]?code\b/i, /\bdial[\s_-]?code\b/i, /\bcountry[\s_-]?code\b/i, /\bphone[\s_-]?code\b/i],
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
  gender:             [/\bgender\b/i, /\bsex\b/i],
  veteran_status:     [/\bveteran[\s_-]?status\b/i, /\bveteran\b/i],
};

function matchesAny(text: string, type: FieldType): boolean {
  return PATTERNS[type].some((r) => r.test(text));
}

function getLabelText(el: FillableEl): string {
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

function classifyElement(el: FillableEl): FieldType | null {
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
    const asInput = el as Partial<HTMLInputElement>;
    const candidates = [
      asInput.name ?? '',
      el.id ?? '',
      getLabelText(el as FillableEl),
    ].join(' ');
    return RESUME_LABEL_PATTERNS.some(r => r.test(candidates));
  });
}

export function detectFields(): Map<FieldType, FillableEl> {
  const result = new Map<FieldType, FillableEl>();
  const QUERY =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
    ':not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="image"]),' +
    'textarea, select,' +
    // Angular Material selects and other custom comboboxes
    'mat-select, [role="combobox"]:not(input):not(select):not(textarea)';

  for (const el of Array.from(document.querySelectorAll<HTMLElement>(QUERY))) {
    const type = classifyElement(el as FillableEl);
    if (type && !result.has(type)) {
      result.set(type, el);
    }
  }

  return result;
}
