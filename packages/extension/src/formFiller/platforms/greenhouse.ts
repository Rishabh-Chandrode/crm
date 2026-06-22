import type { UserProfile, FieldType, FillResult } from '../types';
import { ALL_FIELD_TYPES } from '../types';
import { fillElement, fillItiPhone } from '../filler';

interface FieldConfig {
  type: FieldType;
  // querySelectorAll selector — every matched element is filled
  selector?: string;
  // Every <label> whose text matches any pattern → fill its associated input.
  // Multiple elements per type are intentional (e.g. phone country picker AND
  // "country where you currently reside" both get filled from profile.country).
  labelPatterns?: RegExp[];
}

const FIELDS: FieldConfig[] = [
  { type: 'first_name',        selector: '#first_name' },
  { type: 'last_name',         selector: '#last_name' },
  { type: 'email',             selector: '#email' },
  { type: 'phone',             selector: '#phone' },
  { type: 'phone_country_code', selector: '#phone_country_code, select[name="phone_country_code"]' },
  // #candidate-location is a city/location search combobox. Try both profile fields
  // so it works whether the user stored their value in `location` or `city`.
  { type: 'location',          selector: '#candidate-location' },
  { type: 'city',              selector: '#candidate-location' },
  { type: 'linkedin_url',      selector: 'input[name*="linkedin"], input[id*="linkedin"]' },
  { type: 'github_url',        selector: 'input[name*="github"],  input[id*="github"]' },
  { type: 'website',           selector: 'input[name*="website"], input[id*="website"], input[name*="portfolio"]' },
  // "Country" label appears in two contexts on Greenhouse: the phone country picker
  // (inside .phone-input) and occasionally as a separate residence field.
  // Using labelPatterns fills whichever is present from profile.country.
  { type: 'country',           labelPatterns: [/\bcountry\b/i] },
  { type: 'work_authorization', labelPatterns: [/authorized to work/i, /work authoriz/i, /sponsorship/i] },
  { type: 'job_title',         labelPatterns: [/job title/i] },
  { type: 'current_company',   labelPatterns: [/employer/i] },
  { type: 'education',         labelPatterns: [/degree/i] },
  { type: 'college_name',      labelPatterns: [/school/i, /university/i, /college/i] },
  { type: 'veteran_status',    labelPatterns: [/veteran[\s_-]?status/i, /\bveteran\b/i] },
];

function profileValue(profile: UserProfile, type: FieldType): string | null {
  if (type === 'full_name') {
    return [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null;
  }
  return (profile as unknown as Record<string, string | null>)[type] ?? null;
}

// Return every element whose associated <label> text matches any of the patterns.
function findByLabel(patterns: RegExp[]): Element[] {
  const found: Element[] = [];
  for (const label of Array.from(document.querySelectorAll('label'))) {
    const text = label.textContent ?? '';
    if (!patterns.some(p => p.test(text))) continue;
    const el = label.htmlFor ? document.getElementById(label.htmlFor) : null;
    if (el && !found.includes(el)) found.push(el);
  }
  return found;
}

export async function fill(profile: UserProfile): Promise<Omit<FillResult, 'platform'>> {
  const filled: string[]  = [];
  const skipped: string[] = [];
  const seen = new Set<FieldType>();

  for (const { type, selector, labelPatterns } of FIELDS) {
    const value = profileValue(profile, type);
    if (!value) continue;

    // Collect all elements to fill — duplicates across selector + label are de-duped
    const elements: Element[] = [];
    if (selector) {
      elements.push(...Array.from(document.querySelectorAll(selector)));
    }
    if (labelPatterns) {
      for (const el of findByLabel(labelPatterns)) {
        if (!elements.includes(el)) elements.push(el);
      }
    }

    if (elements.length === 0) {
      skipped.push(type);
      seen.add(type);
      continue;
    }

    let anyFilled = false;
    for (const el of elements) {
      let ok: boolean;
      if (type === 'phone' && el instanceof HTMLInputElement) {
        // Use iti-aware filling: selects the country flag/code dropdown then fills local number
        ok = await fillItiPhone(el, value, profileValue(profile, 'phone_country_code'));
      } else {
        ok = await fillElement(el, value);
      }
      if (ok) anyFilled = true;
    }
    // Report each FieldType once regardless of how many elements were filled
    (anyFilled ? filled : skipped).push(type);
    seen.add(type);
  }

  // Report profile fields with values that weren't targeted by any config entry
  for (const type of ALL_FIELD_TYPES) {
    if (!seen.has(type)) {
      const value = profileValue(profile, type);
      if (value) skipped.push(type);
    }
  }

  return { filled, skipped };
}
