import { describe, it, expect } from 'vitest';
import {
  getGmailSearchUrl,
  type ScrapeMessage,
  type AutofillResultMessage,
  type UserProfile,
  type ProspectData,
  type Job,
  type JobStatus,
  type VariableSource,
} from '../types';

describe('Extension Data Shapes & Message Contracts', () => {
  it('validates VariableSource contract including sender', () => {
    const src: VariableSource = 'sender';
    expect(src).toBe('sender');
  });
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

  it('validates ScrapeMessage with optional email', () => {
    const msg: ScrapeMessage = {
      action: 'scraped',
      firstName: 'Alice',
      lastName: 'Smith',
      company: 'Google',
      jobTitle: 'Staff Engineer',
      linkedinUrl: 'https://www.linkedin.com/in/alicesmith',
      email: 'alice@google.com',
    };

    expect(msg.email).toBe('alice@google.com');
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

  it('validates Job and JobStatus contracts', () => {
    const status: JobStatus = 'open';
    const sampleJob: Job = {
      id: 'job-1',
      title: 'Senior Software Engineer',
      job_url: 'https://careers.google.com/jobs/123',
      company_id: 'comp-1',
      status,
      notes: 'Referral requested',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(sampleJob.status).toBe('open');
    expect(sampleJob.title).toBe('Senior Software Engineer');
  });

  it('validates JobApplication contract including optional company_id', () => {
    const sampleApp: import('../types').JobApplication = {
      id: 'app-1',
      user_id: 'u-1',
      job_id: 'job-1',
      company_id: 'comp-1',
      company_name: 'Airtel',
      job_title: 'Staff Engineer',
      job_url: 'https://airtel.in/jobs/1',
      platform: 'Direct',
      status: 'not_applied',
      notes: null,
      applied_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(sampleApp.company_name).toBe('Airtel');
    expect(sampleApp.company_id).toBe('comp-1');
  });

  it('validates getGmailSearchUrl utility', () => {
    expect(
      getGmailSearchUrl({
        to: 'recruiter@stripe.com',
        subject: 'Intro',
        messageId: '1953258c7075c328',
      })
    ).toBe('https://mail.google.com/mail/u/0/#all/1953258c7075c328');

    expect(
      getGmailSearchUrl({
        to: 'recruiter@stripe.com',
        subject: 'Intro',
        messageId: '<msg-1@mail.gmail.com>',
      })
    ).toBe('https://mail.google.com/mail/u/0/#search/rfc822msgid%3Amsg-1%40mail.gmail.com');

    expect(getGmailSearchUrl({ to: 'recruiter@stripe.com', subject: 'Intro' })).toBe(
      'https://mail.google.com/mail/u/0/#search/to%3Arecruiter%40stripe.com%20subject%3A(%22Intro%22)'
    );

    expect(getGmailSearchUrl({ subject: 'Intro' })).toBe(
      'https://mail.google.com/mail/u/0/#search/subject%3A(%22Intro%22)'
    );
  });
});
