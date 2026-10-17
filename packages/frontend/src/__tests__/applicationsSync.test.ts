import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../lib/api';
import type { CandidatePreferences, JobEmailSyncResult } from '../lib/types';

describe('Applications Sync & Preferences API Client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'crm_token=mock-token; path=/',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('calls POST /api/applications/sync-emails and returns JobEmailSyncResult', async () => {
    const mockResult: { data: JobEmailSyncResult } = {
      data: {
        discovered: 3,
        updated: 1,
        scanned: 10,
        skipped: 6,
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });
    global.fetch = mockFetch;

    const res = await api.applications.syncEmails();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/applications/sync-emails');
    expect(options.method).toBe('POST');
    expect(res.data.discovered).toBe(3);
    expect(res.data.updated).toBe(1);
  });

  it('calls GET /api/applications/preferences', async () => {
    const mockPreferences: { data: CandidatePreferences } = {
      data: {
        target_roles: ['Full Stack Engineer'],
        target_skills: ['React', 'TypeScript'],
        preferred_locations: ['Remote'],
        remote_only: true,
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPreferences,
    });
    global.fetch = mockFetch;

    const res = await api.applications.getPreferences();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/applications/preferences');
    expect(res.data.target_roles).toContain('Full Stack Engineer');
  });

  it('calls PUT /api/applications/preferences with body payload', async () => {
    const updated: CandidatePreferences = {
      target_roles: ['Backend Engineer'],
      target_skills: ['Go', 'PostgreSQL'],
      preferred_locations: ['Remote'],
      remote_only: true,
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: updated }),
    });
    global.fetch = mockFetch;

    const res = await api.applications.updatePreferences(updated);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/applications/preferences');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body)).toEqual(updated);
    expect(res.data.target_roles).toContain('Backend Engineer');
  });

  it('includes min_match_score in query params when listing applications', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ applications: [], total: 0 }),
    });
    global.fetch = mockFetch;

    await api.applications.list({ min_match_score: 80 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('min_match_score=80');
  });
});
