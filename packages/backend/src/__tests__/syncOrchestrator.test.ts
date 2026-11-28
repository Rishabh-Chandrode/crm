import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncJobEmailsForUser } from '../services/jobEmailSync/syncOrchestrator.js';
import { pool } from '../db/index.js';
import * as gmailFetcher from '../services/jobEmailSync/gmailFetcher.js';
import * as classifierAndScorer from '../services/jobEmailSync/jobClassifierAndScorer.js';
import * as scraper from '../services/jobEmailSync/jobScraper.js';

vi.mock('../db/index.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../services/pushNotificationService.js', () => ({
  pushNotificationService: {
    notifyJobAdded: vi.fn().mockResolvedValue(0),
    notifyApplicationUpdated: vi.fn().mockResolvedValue(0),
  },
}));

describe('syncOrchestrator - AI Extraction, Confident Company Insertion & Unconfirmed Jobs', () => {
  const userId = '11111111-2222-3333-4444-555555555555';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts new company to DB and creates open job and not_applied application when AI is confident', async () => {
    // 1. User preferences query
    vi.spyOn(pool, 'query').mockImplementation(async (query: any, params?: any) => {
      const q = typeof query === 'string' ? query : query?.text || '';

      if (q.includes('FROM users WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: userId,
              job_email_sync_enabled: true,
              candidate_preferences: {
                target_roles: ['Software Engineer'],
                target_skills: ['TypeScript', 'Node.js'],
                preferred_locations: ['Remote'],
              },
              last_job_email_synced_at: null,
            },
          ],
        } as any;
      }

      // Check existing application
      if (q.includes('SELECT id FROM job_applications')) {
        return { rowCount: 0, rows: [] } as any;
      }

      // Company existence check -> Not in DB
      if (q.includes('SELECT id FROM companies')) {
        return { rowCount: 0, rows: [] } as any;
      }

      // Company insertion -> returns new company ID
      if (q.includes('INSERT INTO companies')) {
        return { rowCount: 1, rows: [{ id: 'company-new-uuid' }] } as any;
      }

      // Job insertion
      if (q.includes('INSERT INTO jobs')) {
        return { rowCount: 1, rows: [{ id: 'job-new-uuid' }] } as any;
      }

      // Job application insertion
      if (q.includes('INSERT INTO job_applications')) {
        return { rowCount: 1, rows: [{ id: 'app-new-uuid' }] } as any;
      }

      // Update last synced
      if (q.includes('UPDATE users SET last_job_email_synced_at')) {
        return { rowCount: 1, rows: [] } as any;
      }

      return { rowCount: 0, rows: [] } as any;
    });

    vi.spyOn(gmailFetcher, 'fetchJobAndStatusEmails').mockResolvedValueOnce([
      {
        id: 'msg-confident-1',
        threadId: 't-1',
        subject: '1 new job for Software Engineer at Stripe',
        from: 'jobalerts-noreply@linkedin.com',
        date: new Date('2026-03-10T10:00:00Z'),
        snippet: 'Stripe is hiring',
        bodyText: 'Stripe is looking for a Software Engineer.',
        bodyHtml: '<a href="https://linkedin.com/jobs/view/101">Software Engineer</a>',
      },
    ]);

    vi.spyOn(classifierAndScorer, 'classifyEmail').mockResolvedValueOnce('job_recommendation');

    vi.spyOn(classifierAndScorer, 'extractJobOpportunitiesWithAi').mockResolvedValueOnce([
      {
        title: 'Software Engineer',
        company: 'Stripe',
        url: 'https://linkedin.com/jobs/view/101',
        platform: 'LinkedIn',
        confidence: 'high',
        isConfident: true,
        isComplete: true,
        reasoning: 'Hiring company Stripe clearly named in email context.',
      },
    ]);

    vi.spyOn(scraper, 'scrapeJobDetails').mockResolvedValueOnce({
      description: 'Design and build resilient payment APIs at Stripe.',
    });

    vi.spyOn(classifierAndScorer, 'scoreJobAgainstPreferences').mockResolvedValueOnce({
      matchScore: 92,
      matchReasons: ['Strong role match'],
      missingSkills: [],
    });

    const result = await syncJobEmailsForUser(userId);

    expect(result.discovered).toBe(1);
    expect(result.skipped).toBe(0);

    const calls = (pool.query as any).mock.calls;
    // Verify company was inserted into DB
    const compInsertCall = calls.find((c: any) => String(c[0]).includes('INSERT INTO companies'));
    expect(compInsertCall).toBeDefined();
    expect(compInsertCall[1]).toEqual(['Stripe', userId]);

    // Verify job was inserted with 'open' status
    const jobInsertCall = calls.find((c: any) => String(c[0]).includes('INSERT INTO jobs'));
    expect(jobInsertCall).toBeDefined();
    expect(jobInsertCall[1][3]).toBe('open');

    // Verify job_application was inserted with 'not_applied' status
    const appInsertCall = calls.find((c: any) => String(c[0]).includes('INSERT INTO job_applications'));
    expect(appInsertCall).toBeDefined();
    expect(appInsertCall[0]).toContain("'not_applied'");
    expect(appInsertCall[1][0]).toBe(userId);
    expect(appInsertCall[1][1]).toBe('company-new-uuid');
    expect(appInsertCall[1][3]).toBe('Stripe');
  });

  it('does NOT insert company to DB and creates unconfirmed job and application when AI details are incomplete or unconfident', async () => {
    vi.spyOn(pool, 'query').mockImplementation(async (query: any) => {
      const q = typeof query === 'string' ? query : query?.text || '';

      if (q.includes('FROM users WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: userId,
              job_email_sync_enabled: true,
              candidate_preferences: null,
              last_job_email_synced_at: null,
            },
          ],
        } as any;
      }

      if (q.includes('SELECT id FROM job_applications')) {
        return { rowCount: 0, rows: [] } as any;
      }

      if (q.includes('INSERT INTO jobs')) {
        return { rowCount: 1, rows: [{ id: 'job-unconfirmed-uuid' }] } as any;
      }

      if (q.includes('INSERT INTO job_applications')) {
        return { rowCount: 1, rows: [{ id: 'app-unconfirmed-uuid' }] } as any;
      }

      if (q.includes('UPDATE users SET last_job_email_synced_at')) {
        return { rowCount: 1, rows: [] } as any;
      }

      return { rowCount: 0, rows: [] } as any;
    });

    vi.spyOn(gmailFetcher, 'fetchJobAndStatusEmails').mockResolvedValueOnce([
      {
        id: 'msg-unconfirmed-1',
        threadId: 't-2',
        subject: 'Hot Tech Jobs Digest',
        from: 'digest@jobportal.com',
        date: new Date('2026-03-10T11:00:00Z'),
        snippet: 'Various openings',
        bodyText: 'We have an opening for Backend Developer at confidential client.',
        bodyHtml: '<a href="https://jobportal.com/job/888">Apply</a>',
      },
    ]);

    vi.spyOn(classifierAndScorer, 'classifyEmail').mockResolvedValueOnce('job_recommendation');

    // AI is unconfident because company is generic/confidential
    vi.spyOn(classifierAndScorer, 'extractJobOpportunitiesWithAi').mockResolvedValueOnce([
      {
        title: 'Backend Developer',
        company: 'Unknown Company',
        url: 'https://jobportal.com/job/888',
        platform: 'Email',
        confidence: 'low',
        isConfident: false,
        isComplete: false,
        reasoning: 'Company name was withheld or ambiguous.',
      },
    ]);

    const result = await syncJobEmailsForUser(userId);

    expect(result.discovered).toBe(1);

    const calls = (pool.query as any).mock.calls;
    // Verify company was NOT inserted
    const compInsertCall = calls.find((c: any) => String(c[0]).includes('INSERT INTO companies'));
    expect(compInsertCall).toBeUndefined();

    // Verify job was inserted with 'unconfirmed' status
    const jobInsertCall = calls.find((c: any) => String(c[0]).includes('INSERT INTO jobs'));
    expect(jobInsertCall).toBeDefined();
    expect(jobInsertCall[1][3]).toBe('unconfirmed');

    // Verify job_application was inserted with 'unconfirmed' status
    const appInsertCall = calls.find((c: any) => String(c[0]).includes('INSERT INTO job_applications'));
    expect(appInsertCall).toBeDefined();
    expect(appInsertCall[0]).toContain("'unconfirmed'");
    expect(appInsertCall[1][0]).toBe(userId);
    expect(appInsertCall[1][1]).toBeNull(); // No company_id created
    expect(appInsertCall[1][3]).toBe('Unknown Company');
    expect(appInsertCall[1][7]).toContain('Unconfirmed opportunity');
  });

  it('updates existing job_application and linked job on interview email even with company suffix differences', async () => {
    vi.spyOn(pool, 'query').mockImplementation(async (query: any, params?: any) => {
      const q = typeof query === 'string' ? query : query?.text || '';

      if (q.includes('FROM users WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{ id: userId, job_email_sync_enabled: true, last_job_email_synced_at: null }],
        } as any;
      }

      if (q.includes('WHERE user_id = $1 AND source_email_id = $2')) {
        return { rowCount: 0, rows: [] } as any;
      }

      if (q.includes('SELECT id, job_id, status, notes, job_title, company_name FROM job_applications')) {
        // Verify core company pattern "%acme%" is passed
        expect(params[3]).toBe('%acme%');
        return {
          rowCount: 1,
          rows: [
            {
              id: 'app-existing-1',
              job_id: 'job-existing-1',
              status: 'applied',
              notes: 'Applied on company site',
              job_title: 'Senior Backend Engineer',
              company_name: 'Acme Corp',
            },
          ],
        } as any;
      }

      return { rowCount: 1, rows: [] } as any;
    });

    vi.spyOn(gmailFetcher, 'fetchJobAndStatusEmails').mockResolvedValueOnce([
      {
        id: 'msg-interview-1',
        threadId: 't-int-1',
        subject: 'Interview Invitation: Senior Backend Engineer at Acme Inc.',
        from: 'recruiting@acme.com',
        date: new Date('2026-03-11T10:00:00Z'),
        snippet: 'We would love to schedule an interview',
        bodyText: 'Hi, we would like to invite you to an interview for Senior Backend Engineer at Acme Inc.',
        bodyHtml: '',
      },
    ]);

    vi.spyOn(classifierAndScorer, 'classifyEmail').mockResolvedValueOnce('application_update');
    vi.spyOn(classifierAndScorer, 'extractApplicationUpdateDetails').mockResolvedValueOnce({
      companyName: 'Acme Inc.',
      jobTitle: 'Senior Backend Engineer',
      status: 'interview',
      note: 'Technical interview invitation received.',
    });

    const result = await syncJobEmailsForUser(userId);
    expect(result.updated).toBe(1);

    const calls = (pool.query as any).mock.calls;
    const appUpdateCall = calls.find((c: any) => String(c[0]).includes('UPDATE job_applications'));
    expect(appUpdateCall).toBeDefined();
    expect(appUpdateCall[1][0]).toBe('interview');
    expect(appUpdateCall[1][2]).toBe('app-existing-1');

    const jobUpdateCall = calls.find((c: any) => String(c[0]).includes('UPDATE jobs SET status'));
    expect(jobUpdateCall).toBeDefined();
    expect(jobUpdateCall[1][0]).toBe('interviewing');
    expect(jobUpdateCall[1][1]).toBe('job-existing-1');

    const insertAppCall = calls.find((c: any) => String(c[0]).includes('INSERT INTO job_applications'));
    expect(insertAppCall).toBeUndefined();
  });

  it('links interview email to an existing saved job in jobs table when no job_applications row exists yet', async () => {
    vi.spyOn(pool, 'query').mockImplementation(async (query: any) => {
      const q = typeof query === 'string' ? query : query?.text || '';

      if (q.includes('FROM users WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{ id: userId, job_email_sync_enabled: true, last_job_email_synced_at: null }],
        } as any;
      }

      if (q.includes('WHERE user_id = $1 AND source_email_id = $2')) {
        return { rowCount: 0, rows: [] } as any;
      }

      if (q.includes('SELECT id, job_id, status, notes, job_title, company_name FROM job_applications')) {
        return { rowCount: 0, rows: [] } as any;
      }

      if (q.includes('FROM jobs j')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'saved-job-99',
              title: 'Full Stack Engineer',
              job_url: 'https://stripe.com/jobs/99',
              company_id: 'comp-stripe',
              company_name: 'Stripe',
            },
          ],
        } as any;
      }

      if (q.includes('INSERT INTO job_applications')) {
        return { rowCount: 1, rows: [{ id: 'app-linked-99' }] } as any;
      }

      return { rowCount: 1, rows: [] } as any;
    });

    vi.spyOn(gmailFetcher, 'fetchJobAndStatusEmails').mockResolvedValueOnce([
      {
        id: 'msg-interview-2',
        threadId: 't-int-2',
        subject: 'Next steps with Stripe',
        from: 'jobs@stripe.com',
        date: new Date('2026-03-11T12:00:00Z'),
        snippet: 'Schedule your technical screen',
        bodyText: 'Let us schedule your screen for Full Stack Engineer.',
        bodyHtml: '',
      },
    ]);

    vi.spyOn(classifierAndScorer, 'classifyEmail').mockResolvedValueOnce('application_update');
    vi.spyOn(classifierAndScorer, 'extractApplicationUpdateDetails').mockResolvedValueOnce({
      companyName: 'Stripe',
      jobTitle: 'Full Stack Engineer',
      status: 'interview',
      note: 'Interview scheduled.',
    });

    const result = await syncJobEmailsForUser(userId);
    expect(result.updated).toBe(1);

    const calls = (pool.query as any).mock.calls;
    const insertAppCall = calls.find((c: any) => String(c[0]).includes('INSERT INTO job_applications'));
    expect(insertAppCall).toBeDefined();
    expect(insertAppCall[1][2]).toBe('saved-job-99'); // Linked to saved job_id
    expect(insertAppCall[1][4]).toBe('Full Stack Engineer'); // Real title, not "Role at Stripe"
    expect(insertAppCall[1][5]).toBe('https://stripe.com/jobs/99'); // Real URL, not "#"

    const jobUpdateCall = calls.find((c: any) => String(c[0]).includes('UPDATE jobs SET status'));
    expect(jobUpdateCall).toBeDefined();
    expect(jobUpdateCall[1][0]).toBe('interviewing');
  });
});
