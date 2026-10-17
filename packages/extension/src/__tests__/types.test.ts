import { describe, it, expect } from 'vitest';
import * as extensionTypes from '../types';
import {
  getGmailSearchUrl,
  type ScrapeMessage,
  type AutofillResultMessage,
  type UserProfile,
  type ProspectData,
  type Job,
  type JobStatus,
  type VariableSource,
  type Document,
  type DocumentDailySync,
  type EnrichmentResult,
} from '../types';

describe('Extension Data Shapes & Message Contracts', () => {
  it('keeps enrichment results able to carry a person name', () => {
    const result: EnrichmentResult = {
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@acme.com',
      job_title: 'Recruiter',
      company_name: 'Acme',
      linkedin_url: 'https://www.linkedin.com/in/jane-doe',
    };
    expect(result.first_name).toBe('Jane');
    expect(result.last_name).toBe('Doe');
  });

  it('leaves failed-send dismissals on the server', () => {
    expect('EmailSend' in extensionTypes).toBe(false);
  });

  it('validates VariableSource contract including sender', () => {
    const src: VariableSource = 'sender';
    expect(src).toBe('sender');
  });

  it('validates PendingProspect and LinkedInProspectResult contracts', () => {
    const pending: extensionTypes.PendingProspect = {
      id: 'p-1',
      user_id: 'u-1',
      linkedin_url: 'https://linkedin.com/in/test',
      first_name: 'Test',
      last_name: 'User',
      company_name: 'Acme',
      job_title: 'Engineer',
      notes: null,
      dismissed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const result: extensionTypes.LinkedInProspectResult = {
      pendingProspect: pending,
      created: true,
      manual_required: true,
      message: 'Manual entry required',
    };
    expect(result.manual_required).toBe(true);
    expect(result.pendingProspect?.first_name).toBe('Test');

    const lookupRes: extensionTypes.ProspectLookupResult = {
      data: null,
      pending,
    };
    expect(lookupRes.pending?.id).toBe('p-1');

    const quickAddRes: extensionTypes.QuickAddProspectResult = {
      data: {
        id: 'p-new',
        first_name: 'Test',
        last_name: 'User',
        email: 'test@acme.com',
        created_at: new Date(),
        updated_at: new Date(),
      },
      pending_dismissed: true,
    };
    expect(quickAddRes.pending_dismissed).toBe(true);
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

  it('validates ScrapeMessage with optional email and gender', () => {
    const msg: ScrapeMessage = {
      action: 'scraped',
      firstName: 'Alice',
      lastName: 'Smith',
      company: 'Google',
      jobTitle: 'Staff Engineer',
      gender: 'female',
      linkedinUrl: 'https://www.linkedin.com/in/alicesmith',
      email: 'alice@google.com',
    };

    expect(msg.email).toBe('alice@google.com');
    expect(msg.gender).toBe('female');
  });

  it('validates TemplateVariable with customizable salutation fields', () => {
    const v: import('../types').TemplateVariable = {
      key: 'salutation',
      label: 'Salutation',
      source: 'prospect',
      field: 'salutation',
      maleValue: 'Sir',
      femaleValue: "Ma'am",
      defaultValue: "Sir/Ma'am",
    };

    expect(v.maleValue).toBe('Sir');
    expect(v.femaleValue).toBe("Ma'am");
    expect(v.defaultValue).toBe("Sir/Ma'am");
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
      target_roles: ['SDE'],
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

  it('validates Document structure with optional Drive metadata', () => {
    const doc: Document = {
      id: 'doc-1',
      name: 'My Resume',
      filename: 'resume.pdf',
      drive_url: 'https://docs.google.com/document/d/123/edit',
      drive_synced_at: '2026-08-23T20:00:00Z',
      drive_sync_error: null,
      size: 1024,
    };

    expect(doc.name).toBe('My Resume');
    expect(doc.drive_url).toBe('https://docs.google.com/document/d/123/edit');
    expect(doc.size).toBe(1024);
  });

  it('describes the daily document refetch preference', () => {
    const pref: DocumentDailySync = { enabled: false, last_synced_at: null };
    expect(pref.enabled).toBe(false);
    expect(pref.last_synced_at).toBeNull();
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

  it('validates CandidatePreferences and JobApplication match fields contract', () => {
    const prefs: extensionTypes.CandidatePreferences = {
      target_roles: ['Staff Engineer'],
      target_skills: ['TypeScript', 'Node.js'],
      preferred_locations: ['Remote'],
      remote_only: true,
      min_experience_years: 3,
    };
    expect(prefs.target_roles).toContain('Staff Engineer');
    expect(prefs.remote_only).toBe(true);

    const appWithScore: extensionTypes.JobApplication = {
      id: 'app-score-1',
      user_id: 'user-1',
      company_name: 'Stripe',
      job_title: 'Backend Engineer',
      job_url: 'https://stripe.com/jobs/1',
      platform: 'LinkedIn',
      status: 'not_applied',
      notes: null,
      applied_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      match_score: 92,
      match_reasons: ['Role matches', 'Skills match'],
      missing_skills: [],
      source_email_id: 'msg-123',
    };
    expect(appWithScore.match_score).toBe(92);
    expect(appWithScore.match_reasons?.length).toBe(2);
  });

  it('validates SystemLog and SystemLogLevel contracts in extension types', () => {
    const level: extensionTypes.SystemLogLevel = 'error';
    const log: extensionTypes.SystemLog = {
      id: 'log-1',
      level,
      message: 'Test log',
      source: 'extension',
      created_at: new Date().toISOString(),
    };
    expect(log.level).toBe('error');
    expect(log.source).toBe('extension');
  });

  it('validates JobApplicationStatus contract including ineligible', () => {
    const status: extensionTypes.JobApplicationStatus = 'ineligible';
    expect(status).toBe('ineligible');
  });

  it('validates LlmConfigSettings and LlmProviderType contracts in Trinity sync', () => {
    const provider: extensionTypes.LlmProviderType = 'gemini';
    const config: extensionTypes.LlmConfigSettings = {
      enabled: true,
      provider,
      model: 'gemini-3.8-flash',
      temperature: 0.2,
      maxTokens: 2048,
      hasGeminiKey: true,
      hasOpenAiKey: false,
      geminiApiKeyMasked: '••••••••Ab8R',
    };
    expect(config.enabled).toBe(true);
    expect(config.provider).toBe('gemini');
    expect(config.model).toBe('gemini-3.8-flash');
  });

  it('validates PushNotification contracts in Trinity sync', () => {
    const keys: extensionTypes.PushSubscriptionKeys = {
      p256dh: 'BNc...',
      auth: 'xyz...',
    };
    const subPayload: extensionTypes.SubscribePushPayload = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys,
      userAgent: 'Mozilla/5.0 Chrome/120.0.0.0',
    };
    const notif: extensionTypes.PushNotificationPayload = {
      title: 'Scheduled Email Failed',
      body: 'Gmail authorization expired',
      url: '/settings?tab=gmail',
      tag: 'gmail-token-expired',
      actions: [{ action: 'reconnect_gmail', title: 'Reconnect Gmail' }],
    };
    expect(subPayload.endpoint).toContain('fcm.googleapis.com');
    expect(subPayload.keys.p256dh).toBe('BNc...');
    expect(notif.title).toBe('Scheduled Email Failed');
    expect(notif.actions?.[0]?.action).toBe('reconnect_gmail');
  });
});




