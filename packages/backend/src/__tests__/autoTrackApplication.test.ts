import { describe, it, expect, vi, beforeEach } from 'vitest';
import { maybeCreateApplicationFromEmail } from '../services/autoTrackApplication.js';
import { pool } from '../db/index.js';

describe('Auto-Track Job Applications from Sent Email', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when jobUrl is not present in custom values', async () => {
    const querySpy = vi.spyOn(pool, 'query');
    await maybeCreateApplicationFromEmail('user-1', { role: 'Engineer' });
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('skips creation if application with same job_url already exists for user', async () => {
    vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [{ id: 'app-already-exists' }],
    } as any);

    const querySpy = vi.spyOn(pool, 'query');
    await maybeCreateApplicationFromEmail('user-1', {
      jobUrl: 'https://jobs.lever.co/company/123',
    });

    // Checked existing, found 1, returned without inserting
    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(querySpy.mock.calls[0][0]).toContain('SELECT id FROM job_applications');
  });

  it('creates new application and company when jobUrl and companyName provided', async () => {
    const querySpy = vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({ rows: [] } as any) // existing app check -> none
      .mockResolvedValueOnce({ rows: [] } as any) // company exists check -> none
      .mockResolvedValueOnce({ rows: [{ id: 'c-new' }] } as any) // insert company
      .mockResolvedValueOnce({ rows: [{ id: 'app-new' }] } as any); // insert application

    await maybeCreateApplicationFromEmail('user-1', {
      jobUrl: 'https://jobs.lever.co/company/123',
      companyName: 'OpenAI',
      jobTitle: 'Research Scientist',
      platform: 'Lever',
    });

    expect(querySpy).toHaveBeenCalledTimes(4);
    // 4th call is application insert
    expect(querySpy.mock.calls[3][1]).toContain('OpenAI');
    expect(querySpy.mock.calls[3][1]).toContain('Research Scientist');
    expect(querySpy.mock.calls[3][1]).toContain('https://jobs.lever.co/company/123');
  });
});
