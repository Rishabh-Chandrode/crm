import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectUnfilledQuestions,
  applyAiAnswers,
  extractPageJobContext,
  queryAiAutofillBackend,
} from '../formFiller/aiAssistant';
import type { AiAutofillFieldAnswer } from '../types';

describe('AI Form Assistant Module', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('extractPageJobContext', () => {
    it('extracts job title, company name, and job description snippet from DOM', () => {
      document.body.innerHTML = `
        <header>
          <h1>Apply for Senior Frontend Engineer | Stripe</h1>
        </header>
        <main>
          <div class="job-description">
            We are looking for a Senior Frontend Engineer to build world-class financial interfaces using React and TypeScript.
          </div>
        </main>
      `;

      const ctx = extractPageJobContext();
      expect(ctx.job_title).toBe('Senior Frontend Engineer');
      expect(ctx.job_description).toContain('Senior Frontend Engineer to build world-class financial interfaces');
    });
  });

  describe('detectUnfilledQuestions', () => {
    it('discovers custom textareas, selects, radio groups, and text inputs', () => {
      document.body.innerHTML = `
        <form id="screening-form">
          <!-- Standard field already filled -->
          <label for="fname">First Name</label>
          <input id="fname" value="John" type="text" />

          <!-- Custom textarea question -->
          <label for="why_company">Why are you interested in this position?</label>
          <textarea id="why_company" name="why_company"></textarea>

          <!-- Screening dropdown -->
          <label for="work_auth">Work Authorization</label>
          <select id="work_auth" name="work_auth">
            <option value="">Please Select</option>
            <option value="citizen">US Citizen</option>
            <option value="sponsorship">Requires Sponsorship</option>
          </select>

          <!-- Radio button group -->
          <fieldset>
            <legend>Are you 18 years of age or older?</legend>
            <label><input type="radio" name="age_18" value="yes" /> Yes</label>
            <label><input type="radio" name="age_18" value="no" /> No</label>
          </fieldset>

          <!-- Additional custom text input -->
          <label for="portfolio_notes">Portfolio Notes</label>
          <input id="portfolio_notes" name="portfolio_notes" type="text" placeholder="Link to case study" />
        </form>
      `;

      const alreadyFilled = new Set<Element>();
      const fnameInput = document.getElementById('fname')!;
      alreadyFilled.add(fnameInput);

      const { queries, targetMap } = detectUnfilledQuestions(alreadyFilled);

      expect(queries).toHaveLength(4);

      const taQuery = queries.find((q) => q.type === 'textarea');
      expect(taQuery).toBeDefined();
      expect(taQuery?.label).toContain('Why are you interested');

      const selQuery = queries.find((q) => q.type === 'select');
      expect(selQuery).toBeDefined();
      expect(selQuery?.options).toEqual(['US Citizen', 'Requires Sponsorship']);

      const radioQuery = queries.find((q) => q.type === 'radio');
      expect(radioQuery).toBeDefined();
      expect(radioQuery?.label).toContain('18 years of age');

      const textQuery = queries.find((q) => q.id === 'portfolio_notes');
      expect(textQuery).toBeDefined();
      expect(textQuery?.label).toBe('Portfolio Notes');

      expect(targetMap.has(taQuery!.id)).toBe(true);
      expect(targetMap.has(selQuery!.id)).toBe(true);
      expect(targetMap.has(radioQuery!.id)).toBe(true);
      expect(targetMap.has('portfolio_notes')).toBe(true);
    });

    it('ignores elements that are already filled or checked', () => {
      document.body.innerHTML = `
        <form>
          <label for="ta_filled">Bio</label>
          <textarea id="ta_filled">Already has content</textarea>

          <label for="sel_filled">Status</label>
          <select id="sel_filled">
            <option value="active" selected>Active</option>
          </select>

          <fieldset>
            <legend>Checked Radio</legend>
            <label><input type="radio" name="r1" value="yes" checked /> Yes</label>
            <label><input type="radio" name="r1" value="no" /> No</label>
          </fieldset>
        </form>
      `;

      const { queries } = detectUnfilledQuestions(new Set());
      expect(queries).toHaveLength(0);
    });
  });

  describe('applyAiAnswers', () => {
    it('applies values to textareas, selects, and radio buttons in DOM', async () => {
      document.body.innerHTML = `
        <form>
          <label for="essay">Why Us?</label>
          <textarea id="essay"></textarea>

          <label for="auth_select">Authorization</label>
          <select id="auth_select">
            <option value="">Choose</option>
            <option value="citizen">US Citizen</option>
            <option value="visa">Visa Required</option>
          </select>

          <fieldset>
            <legend>Relocate?</legend>
            <label id="rel_y_lbl"><input type="radio" id="rel_y" name="relocate" value="yes" /> Yes</label>
            <label id="rel_n_lbl"><input type="radio" id="rel_n" name="relocate" value="no" /> No</label>
          </fieldset>
        </form>
      `;

      const essay = document.getElementById('essay') as HTMLTextAreaElement;
      const select = document.getElementById('auth_select') as HTMLSelectElement;
      const radioYes = document.getElementById('rel_y') as HTMLInputElement;
      const radioNo = document.getElementById('rel_n') as HTMLInputElement;

      const targetMap = new Map();
      targetMap.set('essay_id', essay);
      targetMap.set('auth_id', select);
      targetMap.set('reloc_id', [radioYes, radioNo]);

      const labelMap = new Map();
      labelMap.set('essay_id', 'Why Us?');
      labelMap.set('auth_id', 'Authorization');
      labelMap.set('reloc_id', 'Relocate?');

      const answers: AiAutofillFieldAnswer[] = [
        {
          id: 'essay_id',
          value: 'I love building software at scale.',
        },
        {
          id: 'auth_id',
          value: 'US Citizen',
          optionIndex: 0,
        },
        {
          id: 'reloc_id',
          value: 'Yes',
          optionIndex: 0,
        },
      ];

      const filled = await applyAiAnswers(answers, targetMap, labelMap);

      expect(filled).toHaveLength(3);
      expect(filled).toContain('✨ Why Us?');
      expect(filled).toContain('✨ Authorization');
      expect(filled).toContain('✨ Relocate?');

      expect(essay.value).toBe('I love building software at scale.');
      expect(select.value).toBe('citizen');
      expect(radioYes.checked).toBe(true);
      expect(radioNo.checked).toBe(false);
    });
  });

  describe('queryAiAutofillBackend', () => {
    it('sends POST request with auth header and returns response json', async () => {
      const mockResponse = {
        success: true,
        answers: [{ id: 'q1', value: 'Answer 1' }],
        modelUsed: 'gemini',
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await queryAiAutofillBackend('http://localhost:3001', 'mock-token', {
        fields: [{ id: 'q1', label: 'Question 1', type: 'text' }],
      });

      expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3001/api/autofill/ai-fill', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-token',
        },
        body: expect.any(String),
      });

      expect(result.success).toBe(true);
      expect(result.answers).toEqual(mockResponse.answers);
    });

    it('throws error when server responds with non-200 HTTP code', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await expect(
        queryAiAutofillBackend('http://localhost:3001', 'mock-token', { fields: [] })
      ).rejects.toThrow('HTTP 500');
    });
  });
});
