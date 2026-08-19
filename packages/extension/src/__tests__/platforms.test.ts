import { describe, it, expect, beforeEach } from 'vitest';
import { fill as fillGreenhouse } from '../formFiller/platforms/greenhouse';
import type { UserProfile } from '../types';

describe('Job Application Platform Form Fillers', () => {
  const mockProfile: UserProfile = {
    first_name: 'David',
    last_name: 'Miller',
    email: 'david@example.com',
    phone: '5551234567',
    phone_country_code: '+1',
    city: 'Seattle',
    state: 'WA',
    country: 'United States',
    address_line1: '456 Pine St',
    postal_code: '98101',
    linkedin_url: 'https://linkedin.com/in/davidmiller',
    github_url: 'https://github.com/davidmiller',
    website: 'https://davidmiller.dev',
    current_company: 'Microsoft',
    job_title: 'Principal Software Engineer',
    work_authorization: 'Authorized',
    location: 'Seattle, WA',
    hometown: null,
    years_of_experience: '10',
    notice_period: '2 weeks',
    current_ctc: null,
    expected_ctc: null,
    education: 'BS Computer Science',
    college_name: 'University of Washington',
    graduation_year: '2014',
    gender: null,
    veteran_status: null,
    skills: ['Node.js', 'React'],
    projects: null,
    work_experiences: null,
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    document.execCommand = ((_cmd: string, _showUI?: boolean, _value?: string) => true) as any;
  });

  describe('Greenhouse Platform Filler', () => {
    it('populates standard Greenhouse form fields from user profile', async () => {
      document.body.innerHTML = `
        <form id="application_form">
          <input id="first_name" type="text" />
          <input id="last_name" type="text" />
          <input id="email" type="email" />
          <input id="phone" type="tel" />
          <input id="candidate-location" type="text" />
          <input id="job_application_answers_attributes_0_text_value" name="job_application[answers_attributes][0][text_value]" type="text" />
          <label for="job_application_answers_attributes_0_text_value">LinkedIn Profile</label>
        </form>
      `;

      const result = await fillGreenhouse(mockProfile);

      expect(result.filled).toContain('first_name');
      expect(result.filled).toContain('last_name');
      expect(result.filled).toContain('email');
      expect(result.filled).toContain('location');

      const fn = document.getElementById('first_name') as HTMLInputElement;
      const ln = document.getElementById('last_name') as HTMLInputElement;
      const em = document.getElementById('email') as HTMLInputElement;

      expect(fn.value).toBe('David');
      expect(ln.value).toBe('Miller');
      expect(em.value).toBe('david@example.com');
    });
  });
});
