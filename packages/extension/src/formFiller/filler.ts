/**
 * Fill a phone input that is wrapped by an intl-tel-input (iti) widget.
 *
 * The core problem with AngularJS + iti:
 *   - Angular's iti directive watches ng-model and calls iti.setNumber(modelValue)
 *     on every change.
 *   - iti only re-detects the country when the number starts with '+'.
 *   - If modelValue is just the local number (e.g. "8815877699", no '+'), iti
 *     interprets it in the context of the CURRENT country, which resets to the
 *     iti default (+246 in this case) when country detection fails.
 *
 * The stable-state strategy:
 *   1. Call iti.setNumber('+918815877699') — the '+' prefix makes iti detect India
 *      and set the flag. The input now shows just "8815877699".
 *   2. Fire input/change events so Angular reads "8815877699" and updates ng-model.
 *   3. Angular's watcher fires and calls setNumber('8815877699') — but iti only
 *      changes country for '+'-prefixed numbers. Current country (India) is kept.
 *   → Stable fixed point: country = India, model = "8815877699". ✓
 *
 * We inject a <script> tag to run this in the page's JS world (content scripts
 * can't access window.intlTelInputGlobals). Angular's $timeout(fn, 0, false) is
 * used to schedule setNumber after all pending digests have settled.
 */
export async function fillItiPhone(
  input: HTMLInputElement,
  fullPhone: string,
  rawCountryCode: string | null,
): Promise<boolean> {
  const itiWrapper = input.closest<HTMLElement>('.iti');
  if (!itiWrapper) {
    return fillTextLike(input, fullPhone);
  }

  // Derive dial-code digits: prefer explicit "+91" → "91"; else extract from "+918…"
  const fromCc = (rawCountryCode ?? '').replace(/^\+/, '').trim();
  const fromPhone = (fullPhone.match(/^\+(\d{1,4})/) ?? [])[1] ?? '';
  const dialCode = fromCc || fromPhone;

  // Strip country-code prefix to get just the local number
  let localNumber = fullPhone;
  if (dialCode && fullPhone.startsWith('+' + dialCode)) {
    localNumber = fullPhone.slice(1 + dialCode.length);
  } else if (fullPhone.startsWith('+')) {
    localNumber = fullPhone.replace(/^\+\d{1,4}/, '').trim();
  }

  if (!dialCode) {
    return fillTextLike(input, localNumber || fullPhone);
  }

  const fullIntlNumber = `+${dialCode}${localNumber}`;
  const dataId = input.dataset['intlTelInputId'];

  // Find the matching li for the country in the iti dropdown
  const liItems = Array.from(itiWrapper.querySelectorAll<HTMLElement>('li.iti__country[data-dial-code]'));
  const matchingLi = liItems.find(li => li.dataset['dialCode'] === dialCode);
  const iso2 = matchingLi?.dataset['countryCode'];

  // Detect AngularJS by looking for ng-model attributes in the DOM.
  // Angular's iti directive watches ng-model and calls setNumber(localNumber) on
  // every model change. Since a bare local number (no '+') doesn't carry a country
  // prefix, iti can't detect the country and resets to the default (+246). On Angular
  // pages we must use script injection with $timeout so the iti API is called from
  // the page's JS context AFTER all digest cycles settle.
  //
  // On non-Angular pages (React, Vue, vanilla) there is no such reset loop, so a
  // direct dropdown click is sufficient — and critically, it is CSP-safe (no inline
  // script injection required).
  const isAngularPage = !!document.querySelector('[ng-model], [data-ng-model], [ng-app], [data-ng-app]');

  if (isAngularPage && dataId !== undefined && iso2) {
    // Angular path: inject a <script> tag into the page's JS world.
    // setNumber(fullIntlNumber) runs first (establishes correct country from + prefix).
    // Then input/change events fire so Angular reads the local number and updates
    // ng-model. Angular's iti watcher calls setNumber(localNumber) — but iti only
    // re-detects country for '+'-prefixed numbers, so the country stays correct.
    const script = document.createElement('script');
    script.textContent = `(function(){try{` +
      `var el=document.querySelector('input[data-intl-tel-input-id="${dataId}"]');` +
      `if(!el)return;` +
      `var g=window.intlTelInputGlobals||window.intlTelInput;` +
      `var inst=g&&g.getInstance&&g.getInstance(el);` +
      `if(!inst)return;` +
      `function doSet(){` +
        `inst.setNumber('${fullIntlNumber}');` +
        `el.dispatchEvent(new Event('input',{bubbles:true}));` +
        `el.dispatchEvent(new Event('change',{bubbles:true}));` +
      `}` +
      `try{` +
        `var inj=window.angular&&angular.element(document.body).injector();` +
        `var $t=inj&&inj.get('$timeout');` +
        `if($t){$t(doSet,0,false);return;}` +
      `}catch(e2){}` +
      `setTimeout(doSet,50);` +
      `}catch(e){}})();`;
    document.documentElement.appendChild(script);
    script.remove();
    await wait(600); // wait for $timeout(0) + Angular digest to complete
    return true;
  }

  // Non-Angular path (React, Vue, vanilla JS) or Angular fallback.
  // Select the country FIRST while the input is still empty, then fill the number.
  // Reason: Greenhouse (and similar React apps) attach a `countrychange` handler that
  // reformats whatever is already in the input when the country changes. If the local
  // number "8815877699" is already present when India is selected, the handler prepends
  // a trunk prefix and turns it into "08815877699". Selecting the country first (on an
  // empty input) means countrychange fires with nothing to reformat, and the subsequent
  // fillTextLike sets the number in the already-correct context.
  if (iso2) {
    const toggleBtn = itiWrapper.querySelector<HTMLElement>('.iti__selected-country');
    if (toggleBtn) {
      toggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      const dropdown = itiWrapper.querySelector<HTMLElement>('.iti__dropdown-content');
      if (dropdown) {
        for (let i = 0; i < 6; i++) {
          await wait(100);
          if (!dropdown.classList.contains('iti__hide')) break;
        }

        if (!dropdown.classList.contains('iti__hide')) {
          const exactLi = dropdown.querySelector<HTMLElement>(`li[data-country-code="${iso2}"]`);
          if (exactLi) {
            exactLi.scrollIntoView({ block: 'nearest' });
            exactLi.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            await wait(200); // wait for countrychange handlers to settle before filling
          }
        }
      }
    }
  }

  fillTextLike(input, localNumber || fullPhone);
  return true;
}

// Simulate a real user typing into an input: fires the full mouse → focus →
// keyboard → input → change → blur event sequence that React, Vue, Angular, and
// vanilla JS forms all expect.
//
// Why native setter + InputEvent instead of execCommand:
//   execCommand('insertText') is deprecated and unreliable in sandboxed contexts.
//   The native setter bypasses React's synthetic event proxy; pairing it with a
//   bubbling InputEvent is what React 16/17/18 all listen for to update state.
export async function simulateInput(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<boolean> {
  // 1. Mouse events — activates the field the same way a real click does
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, buttons: 1 }));
  el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true }));
  el.focus();
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  await new Promise<void>(r => setTimeout(r, 30));

  // 2. Ctrl+A — select existing content so the insert replaces it
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true, cancelable: true }));
  if ('select' in el && typeof el.select === 'function') el.select();
  el.dispatchEvent(new KeyboardEvent('keyup',   { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true }));

  // 3. beforeinput — signals to the framework what is about to be inserted
  el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));

  // 4. Native value setter — writes the value outside React's proxy so the DOM
  //    reflects the new value before the synthetic events fire
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) nativeSetter.call(el, value); else el.value = value;

  // 5. input — primary event React/Vue/Angular/Svelte all use for controlled inputs
  el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));

  // 6. change — some libraries (and vanilla JS) only listen to change, not input
  el.dispatchEvent(new Event('change', { bubbles: true }));

  // 7. Tab keydown + synthetic blur
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
  el.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Tab', code: 'Tab', keyCode: 9, bubbles: true }));
  el.blur();
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

  // 8. Click document.body so the browser moves focus away naturally.
  //    Workday's form library tracks "touched" state via real focus-out events on
  //    the document; a synthetic blur on the element alone is not enough — an
  //    external click is what actually flips the field from "untouched" to "touched"
  //    and clears the required-field validation error on submit.
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  document.body.click();

  await new Promise<void>(r => setTimeout(r, 50));
  return el.value === value;
}

export function fillResumeInput(el: HTMLInputElement, base64: string, filename: string, mimeType: string): boolean {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], filename, { type: mimeType });
    const dt = new DataTransfer();
    dt.items.add(file);
    el.files = dt.files;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fillWorkdayListbox(btn: HTMLButtonElement, value: string): Promise<boolean> {
  // Normalize text for comparison: strip diacritics so "Karnātaka" matches "Karnataka",
  // "Gujarāt" matches "Gujarat", etc.
  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  const normValue = normalize(value);

  // Open the dropdown
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  btn.click();

  // Workday sets aria-controls on the button pointing to the listbox id.
  const listboxId = btn.getAttribute('aria-controls');

  // Find the open dropdown's options.
  //
  // Workday has TWO [role="listbox"] elements in the DOM simultaneously:
  //   1. UL[data-automation-id="selectedItemList"] — the selected-pill display area.
  //      Its children have role="presentation", not role="option". SKIP THIS ONE.
  //   2. UL (no data-automation-id, random id like "a2kd1") — the actual open dropdown.
  //      Its LI children all carry role="option". THIS is what we want.
  //
  // document.querySelector('[role="listbox"]') always returns #1 first, which is why
  // the old code found 0 or 1 wrong options and closed the dropdown immediately.
  //
  // Additionally, some Workday versions use data-automation-id="promptOption" on options
  // inside a data-automation-id="popupContent" portal. Handle both.
  const OPTION_SEL = '[role="option"], [data-automation-id="promptOption"]';

  const findOptions = (): HTMLElement[] => {
    // 1. Prefer the listbox identified by aria-controls (most precise)
    if (listboxId) {
      const lb = document.getElementById(listboxId);
      if (lb) {
        const opts = Array.from(lb.querySelectorAll<HTMLElement>(OPTION_SEL));
        if (opts.length) return opts;
      }
    }

    // 2. Walk ALL [role="listbox"] elements, skipping the selectedItemList pill container.
    //    Pick the first one that has actual option children.
    for (const lb of Array.from(document.querySelectorAll<HTMLElement>('[role="listbox"]'))) {
      if (lb.getAttribute('data-automation-id') === 'selectedItemList') continue;
      const opts = Array.from(lb.querySelectorAll<HTMLElement>(OPTION_SEL));
      if (opts.length) return opts;
    }

    // 3. Modern Workday portal: popupContent wraps promptOption elements
    const popup = document.querySelector('[data-automation-id="popupContent"]');
    if (popup) {
      const opts = Array.from(popup.querySelectorAll<HTMLElement>(OPTION_SEL));
      if (opts.length) return opts;
    }

    // 4. Last resort: bare promptOption elements anywhere in the document
    return Array.from(document.querySelectorAll<HTMLElement>('[data-automation-id="promptOption"]'));
  };

  let options: HTMLElement[] = [];
  for (let i = 0; i < 20; i++) {
    await wait(200);
    options = findOptions();
    if (options.length > 0) break;
  }

  if (options.length === 0) { document.body.click(); return false; }

  // Match with diacritic-normalized text comparison.
  // Exact match first, then substring (handles "Karnataka" ↔ "Karnātaka").
  let match = options.find(opt => normalize(opt.textContent ?? '') === normValue);
  if (!match) {
    match = options.find(opt => {
      const t = normalize(opt.textContent ?? '');
      return t.includes(normValue) || normValue.includes(t);
    });
  }

  if (match) {
    // Fire the full pointer event sequence Workday's React handlers expect.
    match.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true, cancelable: true }));
    match.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
    match.dispatchEvent(new MouseEvent('mousedown',  { bubbles: true, cancelable: true, button: 0 }));
    match.dispatchEvent(new MouseEvent('mouseup',    { bubbles: true, cancelable: true, button: 0 }));
    match.click();
    await wait(300);
    return true;
  }

  document.body.click();
  return false;
}

export async function fillElement(el: Element, value: string): Promise<boolean> {
  if (!value) return false;

  // Workday custom listbox dropdowns (button[aria-haspopup="listbox"])
  if (el instanceof HTMLButtonElement && el.getAttribute('aria-haspopup') === 'listbox') {
    return fillWorkdayListbox(el, value);
  }
  if (isMatSelect(el)) {
    return fillMatSelect(el as HTMLElement, value);
  }
  if (el instanceof HTMLSelectElement) {
    return fillSelect(el, value);
  }
  // React Select and other custom comboboxes backed by a real <input>
  if (el instanceof HTMLInputElement && el.getAttribute('role') === 'combobox') {
    return fillReactSelect(el, value);
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return fillTextLike(el, value);
  }
  return false;
}

function isMatSelect(el: Element): boolean {
  return el.tagName.toLowerCase() === 'mat-select' ||
    (el.getAttribute('role') === 'combobox' && !el.matches('input, select, textarea'));
}

async function fillMatSelect(el: HTMLElement, value: string): Promise<boolean> {
  const lower = value.toLowerCase().trim();

  el.click();
  await wait(200);

  // Options are rendered in a CDK overlay portal at the top of the body
  const options = Array.from(document.querySelectorAll<HTMLElement>('mat-option, [role="option"]'));
  if (options.length === 0) {
    // Close and bail
    document.body.click();
    return false;
  }

  // Exact text match first, then partial
  let match = options.find(opt => (opt.textContent ?? '').toLowerCase().trim() === lower);
  if (!match) {
    match = options.find(opt => {
      const t = (opt.textContent ?? '').toLowerCase().trim();
      return t.includes(lower) || lower.includes(t);
    });
  }

  if (match) {
    match.click();
    return true;
  }

  // No match — close the dropdown
  document.body.click();
  return false;
}

// Known city aliases: old/colloquial name → official name used by job-board APIs.
const CITY_ALIASES: Record<string, string> = {
  'gurgaon':   'Gurugram',
  'bombay':    'Mumbai',
  'calcutta':  'Kolkata',
  'madras':    'Chennai',
  'bangalore': 'Bengaluru',
  'mysore':    'Mysuru',
  'baroda':    'Vadodara',
  'poona':     'Pune',
};

async function fillReactSelect(el: HTMLInputElement, value: string): Promise<boolean> {
  const lower = value.toLowerCase().trim();

  // iti phone dropdowns render their country list as [role="option"] elements in the
  // DOM at all times (even when the dropdown is visually hidden). Without this filter,
  // querySelectorAll('[role="option"]') instantly returns 200+ iti country items,
  // the matching loop never finds a city name among country names, and the async
  // typing fallback is never reached.
  const getOptions = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
      .filter(opt => !opt.classList.contains('iti__country'));

  const control = el.closest<HTMLElement>('[class*="control"]') ?? el.closest<HTMLElement>('[class*="container"]');
  const toggleBtn = control?.querySelector<HTMLElement>('button[aria-label*="Toggle"], button[aria-label*="toggle"], button[aria-label*="open"], button[aria-label*="Open"]');

  if (toggleBtn) {
    toggleBtn.click();
  } else if (control) {
    control.click();
  } else {
    el.focus();
    el.click();
  }

  // Poll for options from the fully-open list (no typing needed for sync selects)
  let options = getOptions();
  for (let i = 0; i < 5; i++) {
    await wait(120);
    options = getOptions();
    if (options.length > 0) break;
  }

  // Fallback: type the value to trigger async/search selects (e.g. Greenhouse city field).
  // selectAll before insertText ensures any stale value from a previous autofill run is
  // replaced, not appended (execCommand inserts at cursor position otherwise).
  // Wait up to 3000ms for the async API call to return results.
  let didType = false;
  if (options.length === 0) {
    didType = true;
    el.focus();
    document.execCommand('selectAll', false, undefined);
    const didInsert = document.execCommand('insertText', false, value);
    if (!didInsert) {
      // execCommand failed — native setter always replaces the full value, no append risk
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) nativeSetter.call(el, value);
      el.dispatchEvent(new InputEvent('input', { data: value, inputType: 'insertText', bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    for (let i = 0; i < 15; i++) {
      await wait(200);
      options = getOptions();
      if (options.length > 0) break;
    }
  }

  // If the typed query returned nothing, retry with a known alias (e.g. "Gurgaon" → "Gurugram").
  if (options.length === 0 && didType) {
    const alias = CITY_ALIASES[lower];
    if (alias) {
      el.focus();
      document.execCommand('selectAll', false, undefined);
      const didInsert = document.execCommand('insertText', false, alias);
      if (!didInsert) {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(el, alias);
        el.dispatchEvent(new InputEvent('input', { data: alias, inputType: 'insertText', bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      for (let i = 0; i < 15; i++) {
        await wait(200);
        options = getOptions();
        if (options.length > 0) break;
      }
    }
  }

  if (options.length === 0) return false;

  let match = options.find(opt => (opt.textContent ?? '').toLowerCase().trim() === lower);
  if (!match) {
    // Only allow option-contains-value (e.g. "United States of America" for "United States"),
    // not value-contains-option (which fires for short option texts like "In" matching "India").
    match = options.find(opt => {
      const t = (opt.textContent ?? '').toLowerCase().trim();
      return t.includes(lower);
    });
  }
  // For async search (we typed a query), the API already ranked results by relevance.
  // If our text match fails (e.g. profile has "Gurgaon" but API returns "Gurugram,
  // Haryana, India"), accept the first option rather than leaving the field empty.
  if (!match && didType) {
    match = options[0];
  }

  if (match) {
    if (didType) {
      // Async search: keyboard navigation is more reliable than synthetic mouse events.
      // ArrowDown focuses the first option; pressing it (idx+1) times reaches our match.
      const idx = options.indexOf(match);
      el.focus();
      for (let i = 0; i <= idx; i++) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        await wait(30);
      }
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    } else {
      // Sync select (all options shown via toggle): mouse click works fine.
      match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      match.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true, button: 0 }));
      match.click();
    }
    await wait(100);
    return true;
  }

  el.blur();
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return false;
}

function fillTextLike(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  // Focus first so the element is the active target for execCommand.
  el.focus();

  // Primary: execCommand('insertText') triggers the browser's native text-insertion
  // pipeline. React 16/17/18 delegates events to the root container and reads
  // event.target.value from this pipeline — this is what makes controlled inputs
  // update their internal state, unlike a bare Event('input') which React can ignore.
  document.execCommand('selectAll', false);
  const inserted = document.execCommand('insertText', false, value);

  if (!inserted || el.value !== value) {
    // execCommand unavailable (e.g. some sandboxed frames) — fall back to native setter
    // + InputEvent (more specific than Event; carries inputType + data properties that
    // React's newer event system checks).
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) nativeSetter.call(el, value); else el.value = value;
    el.dispatchEvent(new InputEvent('input', {
      bubbles: true, cancelable: true, data: value, inputType: 'insertText',
    }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Call the real DOM blur() (not just dispatch a blur event) so Workday's
  // field-level validation listeners fire and mark the field as touched/dirty.
  el.blur();
  return true;
}

function fillSelect(el: HTMLSelectElement, value: string): boolean {
  const lower = value.toLowerCase().trim();
  for (const opt of Array.from(el.options)) {
    const v = opt.value.toLowerCase().trim();
    const t = (opt.textContent ?? '').toLowerCase().trim();
    if (v === lower || t === lower) {
      el.value = opt.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  for (const opt of Array.from(el.options)) {
    const v = opt.value.toLowerCase().trim();
    const t = (opt.textContent ?? '').toLowerCase().trim();
    if (v.includes(lower) || t.includes(lower) || lower.includes(v) || lower.includes(t)) {
      el.value = opt.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  return false;
}
