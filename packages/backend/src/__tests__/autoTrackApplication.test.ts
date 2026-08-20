import { describe, it, expect, vi, beforeEach } from 'vitest';
import { maybeCreateApplicationFromEmail, inferJobMetadataFromUrl } from '../services/autoTrackApplication.js';
import { pool } from '../db/index.js';

describe('Auto-Track Job Applications from Sent Email', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('inferJobMetadataFromUrl parses known job boards and slugs', () => {
    expect(inferJobMetadataFromUrl('https://jobs.lever.co/stripe/senior-backend-engineer')).toEqual({
      company_name: 'Stripe',
      job_title: 'Senior Backend Engineer',
      platform: 'Lever',
    });

    expect(inferJobMetadataFromUrl('https://boards.greenhouse.io/airbnb/jobs/12345')).toEqual({
      company_name: 'Airbnb',
      job_title: undefined,
      platform: 'Greenhouse',
    });

    expect(inferJobMetadataFromUrl('https://meta.wd5.myworkdayjobs.com/careers/job/123')).toEqual({
      company_name: 'Meta',
      job_title: undefined,
      platform: 'Workday',
    });
  });

  it('does nothing when jobUrl is not present in custom values', async () => {
    const querySpy = vi.spyOn(pool, 'query');
    await maybeCreateApplicationFromEmail('user-1', { role: 'Engineer' });
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('skips creation without updates if application already exists with valid data', async () => {
    vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [{ id: 'app-already-exists', company_name: 'Stripe', job_title: 'Software Engineer' }],
    } as any);

    const querySpy = vi.spyOn(pool, 'query');
    await maybeCreateApplicationFromEmail('user-1', {
      jobUrl: 'https://jobs.lever.co/stripe/123',
    });

    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(querySpy.mock.calls[0][0]).toContain('SELECT id, company_name, job_title FROM job_applications');
  });

  it('updates existing record if it was previously Unknown and new data resolves company/title', async () => {
    vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({
        rows: [{ id: 'app-1', company_name: 'Unknown', job_title: 'Unknown' }],
      } as any)
      .mockResolvedValueOnce({ rowCount: 1 } as any);

    const querySpy = vi.spyOn(pool, 'query');
    await maybeCreateApplicationFromEmail(
      'user-1',
      { jobUrl: 'https://jobs.lever.co/company/123' },
      { companyName: 'Datadog', jobTitle: 'DevOps Engineer' },
    );

    expect(querySpy).toHaveBeenCalledTimes(2);
    expect(querySpy.mock.calls[1][0]).toContain('UPDATE job_applications');
    expect(querySpy.mock.calls[1][1]).toContain('Datadog');
    expect(querySpy.mock.calls[1][1]).toContain('DevOps Engineer');
  });

  it('creates new application and company using fallback context when custom values omit them', async () => {
    const querySpy = vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({ rows: [] } as any) // existing app check -> none
      .mockResolvedValueOnce({ rows: [] } as any) // company exists check -> none
      .mockResolvedValueOnce({ rows: [{ id: 'c-new' }] } as any) // insert company
      .mockResolvedValueOnce({ rows: [{ id: 'app-new' }] } as any); // insert application

    await maybeCreateApplicationFromEmail(
      'user-1',
      { jobUrl: 'https://careers.google.com/jobs/123' },
      { companyName: 'Google', jobTitle: 'Staff Engineer', platform: 'Direct' },
    );

    expect(querySpy).toHaveBeenCalledTimes(4);
    expect(querySpy.mock.calls[2][1]).toContain('Google');
    expect(querySpy.mock.calls[3][1]).toContain('Google');
    expect(querySpy.mock.calls[3][1]).toContain('Staff Engineer');
    expect(querySpy.mock.calls[3][1]).toContain('Direct');
  });

  it('creates new application and company when jobUrl and companyName provided in customValues', async () => {
    const querySpy = vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({ rows: [] } as any) // existing app check -> none
      .mockResolvedValueOnce({ rows: [] } as any) // company exists check -> none
      .mockResolvedValueOnce({ rows: [{ id: 'c-new' }] } as any) // insert company
      .mockResolvedValueOnce({ rows: [{ id: 'app-new' }] } as any); // insert application

    await maybeCreateApplicationFromEmail('user-1', {
      jobUrl: 'https://jobs.lever.co/openai/123',
      companyName: 'OpenAI',
      jobTitle: 'Research Scientist',
      platform: 'Lever',
    });

    expect(querySpy).toHaveBeenCalledTimes(4);
    // 4th call is application insert
    expect(querySpy.mock.calls[3][1]).toContain('OpenAI');
    expect(querySpy.mock.calls[3][1]).toContain('Research Scientist');
    expect(querySpy.mock.calls[3][1]).toContain('https://jobs.lever.co/openai/123');
  });
});
