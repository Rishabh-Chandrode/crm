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

export async function fillElement(el: Element, value: string): Promise<boolean> {
  if (!value) return false;

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

  if (options.length === 0) return false;

  let match = options.find(opt => (opt.textContent ?? '').toLowerCase().trim() === lower);
  if (!match) {
    match = options.find(opt => {
      const t = (opt.textContent ?? '').toLowerCase().trim();
      return t.includes(lower) || lower.includes(t);
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
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur',   { bubbles: true }));
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
