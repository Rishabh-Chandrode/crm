import type { UserProfile, FillResult, FieldType } from '../types';
import { fillElement, fillWorkdayListbox, simulateInput } from '../filler';
import { detectAllFields, getLabelText, PATTERNS, matchesAny } from '../detector';
import type { FillableEl } from '../detector';

// Workday ATS: *.myworkdayjobs.com / *.workday.com
//
// Workday uses React with data-automation-id attributes on most inputs.
// Dropdowns are custom listboxes (button[aria-haspopup="listbox"]).
// Stable selectors: data-automation-id > name attr > aria-label / label text.
//
// The application form has up to 4 steps:
//   1. My Information  – name, email, phone, address, links, EEO
//   2. My Experience   – work experience entries, education
//   3. Application Questions – custom per-posting listbox questions
//   4. Review

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function q<T extends Element>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

/** Like q() but returns the LAST match — needed when multiple expanded entries share the same name/selector. */
function qlast<T extends Element>(selector: string): T | null {
  const all = document.querySelectorAll<T>(selector);
  return all.length > 0 ? (all[all.length - 1] ?? null) : null;
}

// ─── Step detection ───────────────────────────────────────────────────────────

/**
 * Detect which Workday application step is currently rendered.
 * Uses DOM-presence checks rather than URL or breadcrumb text.
 */
function detectStep(): 'info' | 'experience' | 'questions' | 'review' {
  // Step 1: legal name inputs OR address/contact fields (autofillWithResume flow skips name inputs)
  if (
    q('input[name="legalName--firstName"], input[data-automation-id="legalNameSection_firstName"]') ||
    q('input[name="addressLine1"], input[name="addressLine1Local"], input[name="cityLocal"], input[name="city"]') ||
    q('input[name="phone-number"], input[data-automation-id="phone-number"]')
  ) {
    return 'info';
  }
  // Step 2: work-experience / education / certifications "Add" buttons
  if (q('button[data-automation-id="add-button"]')) {
    return 'experience';
  }
  // Step 3: application-question text visible in body
  if (/legally authorized|sponsorship for|years of relevant/i.test(document.body.innerText)) {
    return 'questions';
  }
  return 'review';
}

// ─── Label-based helpers ──────────────────────────────────────────────────────

/**
 * Find a Workday listbox button whose associated label text matches any pattern.
 * Workday buttons carry aria-labelledby pointing to a label element, or their
 * parent container holds a <label>/<span> sibling.
 */
function findListboxByLabel(patterns: RegExp[]): HTMLButtonElement | null {
  for (const btn of Array.from(
    document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="listbox"]')
  )) {
    // 1. aria-labelledby → look up the label element
    const labelledById = btn.getAttribute('aria-labelledby');
    if (labelledById) {
      const labelEl = document.getElementById(labelledById);
      const text = labelEl?.textContent ?? '';
      if (text && patterns.some(p => p.test(text))) return btn;
    }

    // 2. aria-label directly on the button
    const ariaLabel = btn.getAttribute('aria-label') ?? '';
    if (ariaLabel && patterns.some(p => p.test(ariaLabel))) return btn;

    // 3. Walk up to nearest form-field-like ancestor and look for a label/span sibling
    let el: Element | null = btn.parentElement;
    for (let i = 0; i < 4 && el; i++, el = el.parentElement) {
      const label = el.querySelector<HTMLElement>('label, [data-automation-id$="Label"]');
      if (label && !label.contains(btn)) {
        const text = label.textContent ?? '';
        if (text && patterns.some(p => p.test(text))) return btn;
      }
    }
  }
  return null;
}

/**
 * Fill a radio-button group (Yes/No) whose question label matches any pattern.
 * Workday work-authorization questions are often rendered as radio inputs.
 */
async function fillRadioByLabel(
  patterns: RegExp[],
  value: string,
): Promise<boolean> {
  const lower = value.toLowerCase().trim();
  for (const fieldset of Array.from(
    document.querySelectorAll<HTMLElement>('fieldset, [role="group"]')
  )) {
    const legend = fieldset.querySelector('legend, [role="group"] > *:first-child');
    const legendText = legend?.textContent ?? '';
    if (!patterns.some(p => p.test(legendText))) continue;

    const radios = Array.from(fieldset.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    for (const radio of radios) {
      const label = radio.closest('label') ??
        (radio.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(radio.id)}"]`) : null);
      const labelText = (label?.textContent ?? '').toLowerCase().trim();
      if (labelText === lower || labelText.includes(lower) || lower.includes(labelText)) {
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(100);
        return true;
      }
    }
  }
  return false;
}

// ─── Degree normalization ─────────────────────────────────────────────────────

/**
 * Map common degree abbreviations / informal names to Workday's exact dropdown option text.
 * The Cisco/Workday dropdown has 34 options — common Indian engineering degrees must be
 * remapped because "B.Tech" and "Bachelor of Technology" are not listed.
 */
function normalizeWorkdayDegree(raw: string): string {
  // Collapse dots and spaces so "B.Tech" → "btech", "M.E." → "me", etc.
  const key = raw.toLowerCase().trim().replace(/[.\s]+/g, '');
  const MAP: Record<string, string> = {
    // Bachelor of Engineering
    'btech':                  'Bachelor of Engineering',
    'be':                     'Bachelor of Engineering',
    'bacheloroftech':         'Bachelor of Engineering',
    'bachelorofengineering':  'Bachelor of Engineering',
    'bacheloroftechnology':   'Bachelor of Engineering',
    // Bachelor of Science
    'bsc':                    'Bachelor of Science',
    'bachelorofscience':      'Bachelor of Science',
    // Bachelor of Arts
    'ba':                     'Bachelor of Arts',
    'bachelorofarts':         'Bachelor of Arts',
    // Bachelor of Business Administration
    'bba':                    'Bachelor of Business Administration',
    // Bachelor of Education
    'bed':                    'Bachelor of Education',
    'bachelorofeducation':    'Bachelor of Education',
    // Master of Engineering
    'mtech':                  'Master of Engineering',
    'me':                     'Master of Engineering',
    'masteroftech':           'Master of Engineering',
    'masterofengineering':    'Master of Engineering',
    'masteroftechnology':     'Master of Engineering',
    // Master of Science
    'msc':                    'Master of Science',
    'ms':                     'Master of Science',
    'masterofscience':        'Master of Science',
    // Master of Business Administration
    'mba':                    'Master of Business Administration',
    // Master of Arts
    'ma':                     'Master of Arts',
    'masterofarts':           'Master of Arts',
    // Master of Education
    'med':                    'Master of Education',
    'masterofeducation':      'Master of Education',
    // Doctoral
    'phd':                    'Doctor of Philosophy',
    'doctorofphilosophy':     'Doctor of Philosophy',
    'md':                     'Doctor of Medicine (MD)',
    'jd':                     'Juris Doctorate',
    'edd':                    'Doctor of Education',
    'doctorofeducation':      'Doctor of Education',
    // Secondary
    'highschool':             'High School Diploma',
    'highschooldiploma':      'High School Diploma',
    'ged':                    'General Equivalency Diploma (GED)',
    // International equivalents (common in India)
    'mca':                    "Master's equivalent (international or other)",
    'bca':                    "Bachelor's equivalent (international or other)",
  };
  return MAP[key] ?? raw; // fall back to original value for exact Workday option names
}

// ─── Workday React fiber helpers ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

/**
 * Walk the React fiber tree upward from `el` to find Workday's custom field
 * context provider.  The context carries:
 *   • value       – current field / entry value object
 *   • setValue(v) – React state updater (triggers re-render + validation)
 *   • clearFieldErrors() – removes validation error badges
 */
function findWorkdayCtx(el: Element): AnyObj | null {
  const fiberKey = Object.keys(el).find(
    k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'),
  );
  if (!fiberKey) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = (el as AnyObj)[fiberKey];
  while (node) {
    // tag 10 = ContextProvider in React's internal fiber tag enum
    if (node.tag === 10 && typeof node.memoizedProps?.value?.setValue === 'function') {
      return node.memoizedProps.value as AnyObj;
    }
    node = node.return;
  }
  return null;
}

/**
 * Fill a Workday text input by calling its React fiber onInput handler DIRECTLY.
 *
 * Why not execCommand / dispatchEvent?
 *   - execCommand requires the browser tab to have focus; the extension popup steals it
 *     so execCommand is a no-op and the fallback nativeEvent(isTrusted=false) is
 *     ignored by Workday's onInput handler.
 *
 * How this works:
 *   1. Set the DOM value via the native prototype setter (so event.target.value is correct)
 *   2. Grab the onInput function straight from the React fiber's memoizedProps
 *   3. Call it directly — it's just a JS function; no isTrusted involved
 *   4. Call onBlur the same way so Workday marks the field as "touched" (validation fires)
 *
 * Workday's onInput handler reads event.target.value and calls its internal state
 * setter, which updates validation state and the React context for that entry.
 */
function fillWorkdayInput(input: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  if (!value) return false;

  // 1. Write value to the DOM so event.target.value is correct when the handler reads it
  const proto = input instanceof HTMLInputElement
    ? HTMLInputElement.prototype
    : HTMLTextAreaElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) nativeSetter.call(input, value); else input.value = value;

  // 2. Fire DOM events first — React's event delegation intercepts these at the root
  //    and updates the controlled component state before fiber handlers run.
  input.dispatchEvent(new InputEvent('input',  { bubbles: true, cancelable: true, data: value, inputType: 'insertText' }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  // 3. Also call fiber handlers directly — fkit uses onChange / onInput / onBlur
  //    depending on the field type. Try all of them.
  const fiberKey = Object.keys(input).find(
    k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'),
  );
  if (fiberKey) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiber = (input as AnyObj)[fiberKey] as any;
    const props = fiber?.memoizedProps ?? {};
    const fakeInput = { target: input, currentTarget: input, nativeEvent: new Event('input') };
    const fakeBlur  = { target: input, currentTarget: input, nativeEvent: new Event('blur') };
    for (const key of ['onChange', 'onInput']) {
      if (typeof props[key] === 'function') {
        try { props[key](fakeInput); } catch { /* ignore */ }
      }
    }
    if (typeof props['onBlur'] === 'function') {
      try { props['onBlur'](fakeBlur); } catch { /* ignore */ }
    }
  }

  // 4. Blur the element so Workday's field-level validation marks it as touched
  input.blur();
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  return true;
}

/**
 * Walk the React fiber tree upward from a Workday date spinbutton (`dateSectionMonth-input`
 * / `dateSectionYear-input`) to find the `vp` component that owns the `enteredDate`
 * hook state.
 *
 * Returns the React useState dispatch for that hook, which accepts an updater function:
 *   dispatch(prev => ({ ...prev, enteredDate: { mm: '09', dd: '', yyyy: '2024' } }))
 *
 * This directly mutates the date picker's internal React state, bypassing the need for
 * trusted keyboard events.
 */
function findWorkdayDateDispatch(
  dateInput: Element,
): ((updater: (prev: AnyObj) => AnyObj) => void) | null {
  const fiberKey = Object.keys(dateInput).find(
    k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'),
  );
  if (!fiberKey) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = (dateInput as AnyObj)[fiberKey];
  let depth = 0;
  while (node && depth < 50) {
    // Walk the memoizedState linked list (hooks) on this fiber node
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hs: any = node.memoizedState;
    let hi = 0;
    while (hs && hi < 12) {
      const m = hs.memoizedState;
      if (
        m !== null &&
        typeof m === 'object' &&
        'enteredDate' in m &&
        'fieldOrder' in m &&
        typeof hs.queue?.dispatch === 'function'
      ) {
        return hs.queue.dispatch as (updater: (prev: AnyObj) => AnyObj) => void;
      }
      hs = hs.next;
      hi++;
    }
    node = node.return;
    depth++;
  }
  return null;
}

// ─── Step 2 helpers ───────────────────────────────────────────────────────────

/**
 * Fill a Workday MM/YYYY date field by opening the month-picker calendar and
 * clicking the correct year + month tile. This is the most reliable approach
 * because it uses real DOM clicks rather than synthetic events or fiber hacks.
 *
 * @param dateWrapperId  The id of the dateInputWrapper div, e.g. "workExperience-6--startDate"
 * @param mm             Two-digit month string, e.g. "06"
 * @param yyyy           Four-digit year string, e.g. "2022"
 */
async function fillWorkdayDateViaPicker(
  dateWrapperId: string,
  mm: string,
  yyyy: string,
): Promise<boolean> {
  if (!mm && !yyyy) return false;

  const wrapper = document.getElementById(dateWrapperId);
  if (!wrapper) return false;

  const calBtn = wrapper.querySelector<HTMLElement>('[data-automation-id="dateIcon"]');
  if (!calBtn) return false;

  calBtn.click();
  await wait(400);

  // The month picker renders outside the wrapper — search the whole document
  const getPicker = () => document.querySelector<HTMLElement>('[data-automation-id="monthPicker"]');
  let picker = getPicker();
  // Retry a few times in case the picker is slow to appear
  for (let i = 0; i < 8 && !picker; i++) { await wait(150); picker = getPicker(); }
  if (!picker) return false;

  const targetYear = parseInt(yyyy || '0', 10);
  const targetMonth = parseInt(mm || '0', 10);

  // Navigate to the correct year
  for (let attempts = 0; attempts < 20; attempts++) {
    const label = picker.querySelector<HTMLElement>('[data-automation-id="monthPickerSpinnerLabel"]');
    const currentYear = parseInt(label?.textContent?.trim() ?? '0', 10);
    if (currentYear === targetYear) break;

    const btn = picker.querySelector<HTMLElement>(
      currentYear < targetYear
        ? '[data-automation-id="monthPickerRightSpinner"]'
        : '[data-automation-id="monthPickerLeftSpinner"]',
    );
    if (!btn) break;
    btn.click();
    await wait(150);
    picker = getPicker() ?? picker;
  }

  // Click the target month tile
  if (targetMonth > 0) {
    const tile = picker.querySelector<HTMLElement>(
      `li[data-uxi-monthpicker-month="${targetMonth}"] [data-automation-id="monthPickerTileLabel"]`,
    );
    if (tile) {
      tile.click();
      await wait(200);
      return true;
    }
  }

  // Close picker if we couldn't select
  document.body.click();
  return false;
}

/**
 * Find the "Add" button inside or immediately after a section heading.
 * Falls back to positional index if heading match fails.
 */
function findSectionAddButton(sectionTitle: string): HTMLButtonElement | null {
  for (const h of Array.from(document.querySelectorAll<HTMLElement>('h2,h3,h4,h5,h6'))) {
    if (h.textContent?.trim() !== sectionTitle) continue;
    // Walk up to find a container that owns an add-button
    let el: Element | null = h.parentElement;
    for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
      const btn = el.querySelector<HTMLButtonElement>('button[data-automation-id="add-button"]');
      if (btn) return btn;
    }
    break;
  }
  return null;
}

/**
 * Parse a date string to [month (2-digit string), year (4-digit string)].
 * Handles: "YYYY-MM", "YYYY-MM-DD", "MM/YYYY".
 */
function parseExpDate(dateStr: string | null | undefined): [string, string] {
  if (!dateStr) return ['', ''];
  const s = dateStr.trim();
  // ISO: YYYY-MM or YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso?.[1] && iso[2]) return [iso[2], iso[1]];
  // MM/YYYY
  const slashMY = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMY?.[1] && slashMY[2]) return [slashMY[1].padStart(2, '0'), slashMY[2]];
  // Year only
  const yearOnly = s.match(/^(\d{4})$/);
  if (yearOnly?.[1]) return ['', yearOnly[1]];
  return ['', ''];
}

/**
 * Fill a Workday date spinbutton input (month or year) by:
 *   1. Setting the DOM value via the native setter
 *   2. Calling the React fiber's onChange/onInput handler directly (no isTrusted needed)
 *   3. Firing a Tab keydown + blur so Workday commits the value
 *
 * execCommand is NOT used here because it requires trusted events (isTrusted:true),
 * which content scripts can't produce. Calling the fiber handler directly bypasses
 * the isTrusted check entirely.
 */
async function fillDatePart(input: HTMLInputElement, value: string): Promise<void> {
  if (!value) return;

  // 1. Set DOM value
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (nativeSetter) nativeSetter.call(input, value); else input.value = value;

  // 2. Call fiber onChange / onInput directly
  const fiberKey = Object.keys(input).find(
    k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'),
  );
  if (fiberKey) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiber = (input as AnyObj)[fiberKey] as any;
    const onChange = fiber?.memoizedProps?.onChange;
    const onInput  = fiber?.memoizedProps?.onInput;
    const fakeEvt  = { target: input, currentTarget: input, nativeEvent: new Event('input') };
    if (typeof onChange === 'function') { try { onChange(fakeEvt); } catch { /* ignore */ } }
    if (typeof onInput  === 'function') { try { onInput(fakeEvt);  } catch { /* ignore */ } }
  }

  // 3. Tab keydown + blur so Workday's date picker commits the entered value
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
  input.blur();
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  await wait(150);
}

// ─── Profile value lookup ─────────────────────────────────────────────────────

function profileVal(profile: UserProfile, type: FieldType): string | null {
  if (type === 'full_name') {
    return [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null;
  }
  return (profile as unknown as Record<string, string | null>)[type] ?? null;
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────
//
// Label-based approach: discover all visible form elements, classify each by its
// label text, then fill using simulateInput (text inputs) or fillWorkdayListbox
// (Workday's custom listbox dropdowns).
//
// This handles any Workday form variant without hardcoded selectors:
//   • Standard apply flow
//   • autofillWithResume flow (skips legal-name section)
//   • Bilingual forms with Local + English duplicate fields (both get filled)

async function fillStep1(
  profile: UserProfile,
  filled: string[],
  skipped: string[],
): Promise<void> {

  // ── Phone device type: set to Mobile before filling phone number ──────────
  // Do this first via data-automation-id (stable Workday attribute) so the phone
  // field type is configured before we fill the number itself.
  const phoneTypeBtn = q<HTMLButtonElement>(
    'button[data-automation-id="phone-device-type"][aria-haspopup="listbox"],' +
    'button[name="phoneType"][aria-haspopup="listbox"]',
  );
  if (phoneTypeBtn) {
    await fillWorkdayListbox(phoneTypeBtn, 'Mobile');
  }

  // ── Phone country code: Workday's flag-dropdown is not label-discoverable ─
  if (profile.phone_country_code || profile.country) {
    const codeValue = profile.phone_country_code ?? profile.country;
    const phoneCodeBtn = q<HTMLButtonElement>(
      'button[data-automation-id="countryPhoneCode"][aria-haspopup="listbox"],' +
      'button[name="countryPhoneCode"][aria-haspopup="listbox"]',
    );
    if (phoneCodeBtn && codeValue) {
      const ok = await fillWorkdayListbox(phoneCodeBtn, codeValue);
      (ok ? filled : skipped).push('phone_country_code');
    }
  }

  // ── Work authorization ────────────────────────────────────────────────────
  // Rendered as a listbox OR radio buttons — neither is reliably label-classified
  // by the generic detector, so handle it explicitly here.
  if (profile.work_authorization) {
    const authPatterns = [
      /authorized[\s\S]*?work/i,
      /legally[\s\S]*?work/i,
      /work\s*authoriz/i,
      /visa\s*status/i,
      /eligible[\s\S]*?work/i,
    ];
    const authBtn = findListboxByLabel(authPatterns);
    if (authBtn) {
      const ok = await fillWorkdayListbox(authBtn, profile.work_authorization);
      (ok ? filled : skipped).push('work_authorization');
    } else {
      const ok = await fillRadioByLabel(authPatterns, profile.work_authorization);
      (ok ? filled : skipped).push('work_authorization');
    }
  }

  // ── EEO / Diversity listboxes (label-identified) ──────────────────────────
  if (profile.gender) {
    const btn = findListboxByLabel([/\bgender\b/i, /\bsex\b/i]);
    if (btn) {
      const ok = await fillWorkdayListbox(btn, profile.gender);
      (ok ? filled : skipped).push('gender');
    }
  }
  if (profile.veteran_status) {
    const btn = findListboxByLabel([/\bveteran\b/i, /\bprotected veteran\b/i]);
    if (btn) {
      const ok = await fillWorkdayListbox(btn, profile.veteran_status);
      (ok ? filled : skipped).push('veteran_status');
    }
  }

  // ── Label-based discovery for all remaining text inputs ───────────────────
  //
  // detectAllFields() scans every visible input/select/textarea, reads its
  // associated label text, and classifies it using PATTERNS regex matching.
  // It returns ALL elements per field type — so both "Address Line 1" and
  // "Address Line 1 - Local" inputs are filled with the same value.
  //
  // Fields already handled above (phone_country_code, work_authorization, gender,
  // veteran_status) are in the filled/skipped arrays; we skip re-filling them.
  const alreadyHandled = new Set([
    'phone_country_code', 'work_authorization', 'gender', 'veteran_status',
  ]);

  const allFields = detectAllFields();

  for (const [fieldType, elements] of allFields) {
    if (alreadyHandled.has(fieldType)) continue;

    const value = profileVal(profile, fieldType);
    if (!value) { skipped.push(fieldType); continue; }

    let anyOk = false;
    for (const el of elements) {
      // Workday custom listbox dropdown button
      if (el instanceof HTMLButtonElement && el.getAttribute('aria-haspopup') === 'listbox') {
        const ok = await fillWorkdayListbox(el, value);
        if (ok) anyOk = true;
        continue;
      }
      // Standard select
      if (el instanceof HTMLSelectElement) {
        const ok = await fillElement(el, value);
        if (ok) anyOk = true;
        continue;
      }
      // Text input or textarea — use full mouse+keyboard event simulation
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const ok = await simulateInput(el, value);
        if (ok) anyOk = true;
        continue;
      }
      // Fallback for custom comboboxes
      const ok = await fillElement(el, value);
      if (ok) anyOk = true;
    }

    (anyOk ? filled : skipped).push(fieldType);
  }

  // Close any dropdown that was left open by the last listbox fill, and ensure
  // the page registers all fields as touched so submit validation passes.
  await wait(200);
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  document.body.click();
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────

async function fillStep2(
  profile: UserProfile,
  filled: string[],
  skipped: string[],
): Promise<void> {

  // ── Work Experience ───────────────────────────────────────────────────────
  const experiences = profile.work_experiences;
  if (experiences && experiences.length > 0) {

    // ── Delete excess empty entries from prior runs ──────────────────────
    // If the user ran autofill before, extra Add clicks left orphan empty entries
    // that would fail validation. Remove them (only if their context value is empty).
    const getEntryInputs = () =>
      Array.from(document.querySelectorAll<HTMLInputElement>('input[name="jobTitle"]'));

    let existingInputs = getEntryInputs();
    while (existingInputs.length > experiences.length) {
      const last = existingInputs[existingInputs.length - 1];
      if (!last) break;
      const ctx = findWorkdayCtx(last);
      const isEmpty = !ctx?.value?.jobTitle && !last.value;
      if (!isEmpty) break; // don't delete entries that already have content

      // Find the delete button scoped to this entry's container
      // Workday wraps each entry in a section with a data-automation-id delete button
      let container: Element | null = last;
      for (let up = 0; up < 12 && container; up++) {
        const delBtn = container.querySelector<HTMLButtonElement>(
          'button[data-automation-id="delete"], button[aria-label*="Delete" i], button[aria-label*="Remove" i]',
        );
        if (delBtn) { delBtn.click(); break; }
        container = container.parentElement;
      }
      await wait(500);
      const after = getEntryInputs();
      if (after.length === existingInputs.length) break; // click had no effect — stop
      existingInputs = after;
    }

    // ── Add / fill each entry ─────────────────────────────────────────────
    for (let i = 0; i < experiences.length; i++) {
      const exp = experiences[i];
      if (!exp) continue;

      // Only click Add if we don't already have enough entries
      existingInputs = getEntryInputs();
      if (existingInputs.length <= i) {
        const addBtn =
          findSectionAddButton('Work Experience') ??
          q<HTMLButtonElement>('button[data-automation-id="add-button"]');
        if (!addBtn) { skipped.push('work_exp_' + i); break; }
        addBtn.click();
        await wait(1000);
        existingInputs = getEntryInputs();
      }

      const jtInput = existingInputs[i];
      if (!jtInput) { skipped.push('work_exp_' + i); continue; }

      // Extract Workday's internal entry ID (e.g. "workExperience-22--jobTitle" → "22")
      const entryIdM = jtInput.id.match(/workExperience-(\d+)/);
      const entryId = entryIdM?.[1] ?? null;

      // ── Text fields via fiber onInput/onBlur handlers ────────────────
      // fillWorkdayInput calls fiber.memoizedProps.onInput + onBlur directly.
      // These handlers update BOTH the local workExperience display context AND
      // Workday's global submitAtom (what Save & Continue validates).
      // ctx.setValue only updates the display context — hence the prior failures.
      if (exp.title) {
        fillWorkdayInput(jtInput, exp.title);
        await wait(80);
        filled.push('work_title_' + i);
      }

      const coInput = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[name="companyName"]'),
      )[i] ?? null;
      if (coInput && exp.company) {
        fillWorkdayInput(coInput, exp.company);
        await wait(80);
        filled.push('work_company_' + i);
      } else if (exp.company) {
        skipped.push('work_company_' + i);
      }

      const locInput = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[name="location"]'),
      )[i] ?? null;
      if (locInput && exp.location) {
        fillWorkdayInput(locInput, exp.location);
        await wait(80);
        filled.push('work_location_' + i);
      } else if (exp.location) {
        skipped.push('work_location_' + i);
      }

      // currentlyWorkHere checkbox — click the DOM checkbox directly
      if (!exp.end_date) {
        const cwhInput =
          Array.from(document.querySelectorAll<HTMLInputElement>('input[name="currentlyWorkHere"]'))[i]
          ?? qlast<HTMLInputElement>('input[name="currentlyWorkHere"]');
        if (cwhInput && !cwhInput.checked) {
          cwhInput.click();
          cwhInput.dispatchEvent(new Event('change', { bubbles: true }));
          await wait(200);
          filled.push('work_current_' + i);
        }
      }

      // Allow React to re-render after setValue (endDate section may appear/disappear)
      await wait(200);

      // ── Start date via month picker UI ──────────────────────────────
      const [startMM, startYYYY] = parseExpDate(exp.start_date);
      if (startMM || startYYYY) {
        const startWrapperId = entryId
          ? `workExperience-${entryId}--startDate`
          : null;
        const ok = startWrapperId
          ? await fillWorkdayDateViaPicker(startWrapperId, startMM, startYYYY)
          : false;
        (ok ? filled : skipped).push('work_start_' + i);
      } else {
        skipped.push('work_start_' + i);
      }

      // ── End date via month picker UI ─────────────────────────────────
      if (exp.end_date) {
        const [endMM, endYYYY] = parseExpDate(exp.end_date);
        await wait(250);
        const endWrapperId = entryId
          ? `workExperience-${entryId}--endDate`
          : null;
        const ok = endWrapperId
          ? await fillWorkdayDateViaPicker(endWrapperId, endMM, endYYYY)
          : false;
        (ok ? filled : skipped).push('work_end_' + i);
      }

      // ── Role description ─────────────────────────────────────────────
      if (exp.description) {
        const descTA = (
          entryId
            ? document.querySelector<HTMLTextAreaElement>(
                `[id*="workExperience-${entryId}"][id*="roleDescription"]`,
              )
            : Array.from(
                document.querySelectorAll<HTMLTextAreaElement>('[id*="roleDescription"]'),
              )[i]
        ) ?? null;
        if (descTA) {
          const ok = await fillElement(descTA, exp.description);
          (ok ? filled : skipped).push('work_desc_' + i);
        } else {
          skipped.push('work_desc_' + i);
        }
      }

      await wait(200);
    }
  } else {
    skipped.push('work_experiences');
  }

  // ── Education ─────────────────────────────────────────────────────────────
  if (profile.college_name || profile.education) {
    // Only add a new education entry if none exists yet
    const existingEduSchool = document.querySelectorAll(
      'input[id*="education"][id*="--school"], input[id*="--school"]',
    );
    const needAdd = existingEduSchool.length === 0;

    const eduAddBtn = needAdd ? findSectionAddButton('Education') : null;
    if (needAdd && !eduAddBtn) {
      skipped.push('education');
      if (profile.college_name) skipped.push('college_name');
    } else {
      if (needAdd && eduAddBtn) {
        eduAddBtn.click();
        await wait(700);
      }

      // School name — try fiber context first, fall back to fillElement
      if (profile.college_name) {
        const schoolInput = qlast<HTMLInputElement>(
          'input[id*="education"][id*="--school"], input[id*="--school"]',
        );
        if (schoolInput) {
          fillWorkdayInput(schoolInput, profile.college_name!);
          filled.push('college_name');
        } else {
          skipped.push('college_name');
        }
      }

      // Degree listbox (button[name="degree"])
      if (profile.education) {
        const degreeBtn = qlast<HTMLButtonElement>(
          'button[name="degree"][aria-haspopup="listbox"]',
        );
        if (degreeBtn) {
          const degreeValue = normalizeWorkdayDegree(profile.education);
          const ok = await fillWorkdayListbox(degreeBtn, degreeValue);
          (ok ? filled : skipped).push('education');
        } else {
          skipped.push('education');
        }
      }
    }
  }

  // ── Skills combobox ───────────────────────────────────────────────────────
  // Workday renders skills as a tag-style combobox: type → suggestions appear → click option.
  const skills = profile.skills;
  if (skills && skills.length > 0) {
    const skillsInput = document.querySelector<HTMLInputElement>(
      'input[id*="skills"][placeholder="Search"], input[id*="skill"][placeholder="Search"]',
    );
    if (skillsInput) {
      for (const skill of skills) {
        skillsInput.focus();
        await wait(100);

        // Type the skill to trigger suggestions
        document.execCommand('selectAll', false);
        document.execCommand('insertText', false, skill);
        skillsInput.dispatchEvent(new Event('input', { bubbles: true }));

        // Wait for option list to appear (network autocomplete)
        let opts: HTMLElement[] = [];
        for (let i = 0; i < 15; i++) {
          await wait(250);
          opts = Array.from(document.querySelectorAll<HTMLElement>(
            '[role="option"], [data-automation-id="promptOption"]',
          )).filter(o =>
            o.getAttribute('data-automation-id') !== 'selectedItemList' &&
            !o.closest('[data-automation-id="selectedItemList"]'),
          );
          if (opts.length > 0) break;
        }

        if (opts.length === 0) {
          // No match from autocomplete — clear and move on
          skillsInput.focus();
          document.execCommand('selectAll', false);
          document.execCommand('insertText', false, '');
          skipped.push('skill:' + skill);
          continue;
        }

        // Prefer exact match, then prefix, then first result
        const lower = skill.toLowerCase().trim();
        const match =
          opts.find(o => o.textContent?.toLowerCase().trim() === lower) ??
          opts.find(o => o.textContent?.toLowerCase().trim().startsWith(lower)) ??
          opts[0]!;

        match.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true }));
        match.dispatchEvent(new MouseEvent('mousedown',  { bubbles: true, button: 0 }));
        match.dispatchEvent(new MouseEvent('mouseup',    { bubbles: true, button: 0 }));
        match.click();
        await wait(300);
        filled.push('skill:' + skill);

        // Clear input before next skill
        skillsInput.focus();
        document.execCommand('selectAll', false);
        document.execCommand('insertText', false, '');
        await wait(100);
      }
    } else {
      skipped.push('skills');
    }
  }
}

// ─── Step 3 ───────────────────────────────────────────────────────────────────

async function fillStep3(
  profile: UserProfile,
  filled: string[],
  skipped: string[],
): Promise<void> {
  // Application question listboxes have no stable data-automation-id on this form.
  // They appear in a fixed order: auth → sponsorship → years of experience.
  // Filter out utility-menu buttons (language/settings dropdowns in the header).
  const qBtns = Array.from(
    document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="listbox"]'),
  ).filter(b => b.getAttribute('data-automation-id') !== 'utilityMenuButton');

  // ── Button 0: "Are you legally authorized to work...?" ───────────────────
  if (qBtns[0]) {
    const raw = (profile.work_authorization ?? '').toLowerCase();
    // "Yes" if profile says yes/authorized/citizen/permanent resident
    const answer = /^yes$|authorized|eligible|citizen|permanent/i.test(raw) ? 'Yes' : 'No';
    const ok = await fillWorkdayListbox(qBtns[0], answer);
    (ok ? filled : skipped).push('work_authorization_q');
  } else {
    skipped.push('work_authorization_q');
  }

  // ── Button 1: "Will you require sponsorship...?" ─────────────────────────
  if (qBtns[1]) {
    // "Yes" only if work_authorization hints at a visa/sponsorship situation
    const raw = (profile.work_authorization ?? '').toLowerCase();
    const answer = /visa|sponsor|h1b|opt\b|cpt\b|f-?1/i.test(raw) ? 'Yes' : 'No';
    const ok = await fillWorkdayListbox(qBtns[1], answer);
    (ok ? filled : skipped).push('sponsorship_q');
  } else {
    skipped.push('sponsorship_q');
  }

  // ── Button 2: "How many years of relevant work experience...?" ────────────
  // Options on Cisco form: "0-1 year", "2-3 years", "4+ years"
  if (qBtns[2]) {
    const yoeStr = profile.years_of_experience;
    if (yoeStr) {
      const yoe = parseInt(yoeStr, 10);
      let option: string;
      if (isNaN(yoe) || yoe <= 1) option = '0-1 year';
      else if (yoe <= 3)           option = '2-3 years';
      else                         option = '4+ years';
      const ok = await fillWorkdayListbox(qBtns[2], option);
      (ok ? filled : skipped).push('years_of_experience_q');
    } else {
      skipped.push('years_of_experience_q');
    }
  } else {
    skipped.push('years_of_experience_q');
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function fill(profile: UserProfile): Promise<Omit<FillResult, 'platform'>> {
  const filled: string[] = [];
  const skipped: string[] = [];

  const step = detectStep();

  if (step === 'info') {
    await fillStep1(profile, filled, skipped);
  } else if (step === 'experience') {
    await fillStep2(profile, filled, skipped);
  } else if (step === 'questions') {
    await fillStep3(profile, filled, skipped);
  }
  // 'review' – nothing to fill; user confirms and submits manually

  return { filled, skipped };
}

// Keep SELECTOR_MAP export so the import in index.ts still compiles.
export const SELECTOR_MAP = {};
