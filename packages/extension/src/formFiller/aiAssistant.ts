import { getLabelText, type FillableEl } from './detector';
import { fillElement } from './filler';
import type {
  AiAutofillFieldQuery,
  AiAutofillFieldAnswer,
  AiAutofillRequest,
  AiAutofillResponse,
} from '../types';

export type InteractiveTarget = Element | HTMLInputElement[];

export interface ExtractedAiFields {
  queries: AiAutofillFieldQuery[];
  targetMap: Map<string, InteractiveTarget>;
  labelMap: Map<string, string>;
}

/**
 * Scrapes job description, title, and company from page DOM for LLM grounding.
 */
export function extractPageJobContext(): {
  job_title: string;
  company_name: string;
  job_description: string;
} {
  const h1 = document.querySelector('h1');
  const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content;
  let jobTitle = h1?.textContent?.trim() ?? ogTitle ?? document.title;
  jobTitle = jobTitle
    .replace(/^Apply\s+(?:for\s+)?/i, '')
    .replace(/^Job\s+Application\s+for\s+/i, '')
    .replace(/\s*[-|·—]\s*.+$/, '')
    .trim();

  let company = '';
  const siteName = document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content;
  if (siteName) {
    company = siteName;
  } else {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    const main = parts.length >= 2 ? parts[parts.length - 2] : hostname;
    if (main && !['jobs', 'careers', 'apply', 'app', 'hire', 'work', 'www'].includes(main)) {
      company = main.charAt(0).toUpperCase() + main.slice(1);
    }
  }

  // Find job description snippet
  const descEl = document.querySelector(
    '[class*="job-description"], [class*="description"], [data-automation-id="jobPostingDescription"], #job-description, article, main'
  );
  const jobDescription = descEl?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 3000) ?? '';

  return {
    job_title: jobTitle,
    company_name: company,
    job_description: jobDescription,
  };
}

/**
 * Discovers unfilled or custom screening questions that heuristic regex passed over.
 */
export function detectUnfilledQuestions(alreadyFilled: Set<Element>): ExtractedAiFields {
  const queries: AiAutofillFieldQuery[] = [];
  const targetMap = new Map<string, InteractiveTarget>();
  const labelMap = new Map<string, string>();

  let counter = 0;

  // 1. Unfilled Textareas (Cover letter snippets, "Why this company?", screening essays)
  const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea'));
  for (const ta of textareas) {
    if (alreadyFilled.has(ta) || ta.disabled || ta.readOnly || ta.value.trim().length > 0) continue;
    const label = getLabelText(ta as FillableEl) || ta.placeholder || ta.name || ta.id;
    if (!label || label.trim().length < 3) continue;

    const id = ta.id || ta.name || `ai_ta_${counter++}`;
    queries.push({
      id,
      name: ta.name,
      label: label.trim(),
      type: 'textarea',
      placeholder: ta.placeholder || undefined,
    });
    targetMap.set(id, ta);
    labelMap.set(id, label.trim());
  }

  // 2. Unfilled Select Dropdowns (Screening question options)
  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>('select'));
  for (const sel of selects) {
    if (alreadyFilled.has(sel) || sel.disabled) continue;

    // Check if it already has a meaningful selected option
    const selectedText = sel.selectedOptions?.[0]?.textContent?.trim() ?? '';
    const hasValue = sel.value && !/^(select|choose|please\s+select|none)$/i.test(selectedText);
    if (hasValue) continue;

    const options = Array.from(sel.options)
      .map((opt) => opt.textContent?.trim() ?? '')
      .filter((text) => text && !/^(select|choose|please\s+select)$/i.test(text));

    if (options.length === 0) continue;

    const label = getLabelText(sel as FillableEl) || sel.name || sel.id;
    if (!label || label.trim().length < 2) continue;

    const id = sel.id || sel.name || `ai_sel_${counter++}`;
    queries.push({
      id,
      name: sel.name,
      label: label.trim(),
      type: 'select',
      options,
    });
    targetMap.set(id, sel);
    labelMap.set(id, label.trim());
  }

  // 3. Unchecked Radio Button Groups (Yes/No screening questions, legal questions)
  const allRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  const radioGroups = new Map<string, HTMLInputElement[]>();

  for (const radio of allRadios) {
    if (alreadyFilled.has(radio) || radio.disabled) continue;
    const groupName = radio.name || radio.getAttribute('data-group') || 'group_' + counter++;
    if (!radioGroups.has(groupName)) {
      radioGroups.set(groupName, []);
    }
    radioGroups.get(groupName)!.push(radio);
  }

  for (const [groupName, radios] of radioGroups.entries()) {
    // If any radio in this group is already checked, skip
    if (radios.some((r) => r.checked)) continue;

    const first = radios[0]!;
    // Label can come from fieldset legend or parent container
    const fieldset = first.closest('fieldset');
    const legend = fieldset?.querySelector('legend')?.textContent?.trim();
    const groupLabel = legend || getLabelText(first as FillableEl) || first.name;

    if (!groupLabel || groupLabel.trim().length < 3) continue;

    const options = radios.map((r) => {
      const optLabel = getLabelText(r as FillableEl) || r.value || '';
      return optLabel.trim();
    });

    const id = `ai_radio_${groupName}`;
    queries.push({
      id,
      name: groupName,
      label: groupLabel.trim(),
      type: 'radio',
      options,
    });
    targetMap.set(id, radios);
    labelMap.set(id, groupLabel.trim());
  }

  // 4. Remaining unclassified text / number / url inputs
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[type="text"], input[type="number"], input[type="url"], input:not([type])'
    )
  );

  for (const inp of inputs) {
    if (
      alreadyFilled.has(inp) ||
      inp.disabled ||
      inp.readOnly ||
      inp.value.trim().length > 0
    ) {
      continue;
    }

    // Skip search bars, passwords, tokens, captchas
    const attrStr = `${inp.id} ${inp.name} ${inp.placeholder} ${inp.className}`.toLowerCase();
    if (
      /search|csrf|token|captcha|filter|password/i.test(attrStr) ||
      inp.type === 'hidden' ||
      inp.getAttribute('aria-hidden') === 'true' ||
      inp.style.display === 'none' ||
      inp.style.visibility === 'hidden'
    ) {
      continue;
    }

    const label = getLabelText(inp as FillableEl) || inp.placeholder || inp.name;
    if (!label || label.trim().length < 2) continue;

    const id = inp.id || inp.name || `ai_inp_${counter++}`;
    queries.push({
      id,
      name: inp.name,
      label: label.trim(),
      type: 'text',
      placeholder: inp.placeholder || undefined,
    });
    targetMap.set(id, inp);
    labelMap.set(id, label.trim());
  }

  return { queries, targetMap, labelMap };
}

/**
 * Dispatches values into DOM elements according to AI responses.
 */
export async function applyAiAnswers(
  answers: AiAutofillFieldAnswer[],
  targetMap: Map<string, InteractiveTarget>,
  labelMap: Map<string, string>
): Promise<string[]> {
  const filledLabels: string[] = [];

  for (const answer of answers) {
    const target = targetMap.get(answer.id);
    if (!target) continue;

    const label = labelMap.get(answer.id) || answer.id;
    let success = false;

    if (Array.isArray(target)) {
      // Radio button group
      const radios = target;
      if (answer.optionIndex !== undefined && radios[answer.optionIndex]) {
        radios[answer.optionIndex]!.click();
        radios[answer.optionIndex]!.dispatchEvent(new Event('change', { bubbles: true }));
        success = true;
      } else {
        const lowerVal = (answer.value ?? '').toLowerCase().trim();
        const matchedRadio = radios.find((r) => {
          const rText = (getLabelText(r as FillableEl) || r.value || '').toLowerCase().trim();
          return rText === lowerVal || rText.includes(lowerVal) || lowerVal.includes(rText);
        });
        if (matchedRadio) {
          matchedRadio.click();
          matchedRadio.dispatchEvent(new Event('change', { bubbles: true }));
          success = true;
        }
      }
    } else {
      // Input, Textarea, or Select
      success = await fillElement(target, answer.value);
    }

    if (success) {
      filledLabels.push(`✨ ${label}`);
    }
  }

  return filledLabels;
}

/**
 * Calls backend API to resolve form queries.
 */
export async function queryAiAutofillBackend(
  backendUrl: string,
  token: string,
  req: AiAutofillRequest
): Promise<AiAutofillResponse> {
  const cleanUrl = backendUrl.replace(/\/$/, '');
  const res = await fetch(`${cleanUrl}/api/autofill/ai-fill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    throw new Error(`AI Autofill server returned HTTP ${res.status}`);
  }

  return (await res.json()) as AiAutofillResponse;
}
