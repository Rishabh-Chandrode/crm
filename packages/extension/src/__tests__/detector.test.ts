import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyElement,
  matchesAny,
  detectFields,
  detectResumeInputs,
} from '../formFiller/detector';

describe('Form Filler Field Detector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('matchesAny', () => {
    it('matches first_name pattern variations', () => {
      expect(matchesAny('first_name', 'first_name')).toBe(true);
      expect(matchesAny('fname', 'first_name')).toBe(true);
      expect(matchesAny('given name', 'first_name')).toBe(true);
      expect(matchesAny('random', 'first_name')).toBe(false);
    });

    it('matches email address variations', () => {
      expect(matchesAny('email', 'email')).toBe(true);
      expect(matchesAny('email_address', 'email')).toBe(true);
      expect(matchesAny('e-mail', 'email')).toBe(true);
    });

    it('matches address_line1 and postal_code', () => {
      expect(matchesAny('street_address', 'address_line1')).toBe(true);
      expect(matchesAny('addressLine1', 'address_line1')).toBe(true);
      expect(matchesAny('zip_code', 'postal_code')).toBe(true);
      expect(matchesAny('pin_code', 'postal_code')).toBe(true);
    });
  });

  describe('classifyElement and detectFields', () => {
    it('correctly classifies form inputs from DOM attributes and labels', () => {
      document.body.innerHTML = `
        <form id="job-app">
          <label for="f1">First Name</label>
          <input id="f1" name="first_name" type="text" />

          <label for="f2">Last Name</label>
          <input id="f2" name="last_name" type="text" />

          <input id="f3" name="email" placeholder="Your email address" type="email" />
          <input id="f4" name="resume_file" type="file" aria-label="Upload your resume / CV" />
        </form>
      `;

      const f1 = document.getElementById('f1') as HTMLInputElement;
      const f2 = document.getElementById('f2') as HTMLInputElement;
      const f3 = document.getElementById('f3') as HTMLInputElement;

      expect(classifyElement(f1)).toBe('first_name');
      expect(classifyElement(f2)).toBe('last_name');
      expect(classifyElement(f3)).toBe('email');

      const fields = detectFields();
      expect(fields.get('first_name')).toBe(f1);
      expect(fields.get('last_name')).toBe(f2);
      expect(fields.get('email')).toBe(f3);

      const resumeInputs = detectResumeInputs();
      expect(resumeInputs.length).toBe(1);
      expect(resumeInputs[0].id).toBe('f4');
    });
  });
});
