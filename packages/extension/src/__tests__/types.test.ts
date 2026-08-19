import { describe, it, expect } from 'vitest';
import type {
  ScrapeMessage,
  AutofillResultMessage,
  UserProfile,
  ProspectData,
} from '../types';

describe('Extension Data Shapes & Message Contracts', () => {
  it('validates ScrapeMessage structure', () => {
    const msg: ScrapeMessage = {
      action: 'scraped',
      firstName: 'Alice',
      lastName: 'Smith',
      company: 'Google',
      jobTitle: 'Staff Engineer',
      linkedinUrl: 'https://www.linkedin.com/in/alicesmith',
    };

    expect(msg.action).toBe('scraped');
    expect(msg.firstName).toBe('Alice');
  });

  it('validates AutofillResultMessage structure', () => {
    const msg: AutofillResultMessage = {
      action: 'autofillResult',
      platform: 'greenhouse',
      filled: ['first_name', 'last_name', 'email'],
      skipped: ['veteran_status'],
    };

    expect(msg.action).toBe('autofillResult');
    expect(msg.filled.length).toBe(3);
  });

  it('maps UserProfile into ProspectData format', () => {
    const profile: UserProfile = {
      first_name: 'Bob',
      last_name: 'Taylor',
      email: 'bob@example.com',
      phone: '1234567890',
      phone_country_code: '+1',
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
      address_line1: '123 Main St',
      postal_code: '94105',
      linkedin_url: 'https://linkedin.com/in/bob',
      github_url: null,
      website: null,
      current_company: 'Acme',
      job_title: 'Engineer',
      work_authorization: 'Citizen',
      location: 'SF, CA',
      hometown: null,
      years_of_experience: '5',
      notice_period: 'Immediate',
      current_ctc: null,
      expected_ctc: null,
      education: 'BS CS',
      college_name: 'UC Berkeley',
      graduation_year: '2020',
      gender: null,
      veteran_status: null,
      skills: ['TypeScript', 'React'],
      projects: null,
      work_experiences: null,
    };

    const prospect: ProspectData = {
      firstName: profile.first_name ?? '',
      lastName: profile.last_name ?? '',
      email: profile.email ?? '',
      company: profile.current_company ?? '',
      jobTitle: profile.job_title ?? '',
      linkedinUrl: profile.linkedin_url ?? '',
    };

    expect(prospect.firstName).toBe('Bob');
    expect(prospect.company).toBe('Acme');
  });
});
