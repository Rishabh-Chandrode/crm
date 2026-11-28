import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../lib/api';

describe('Frontend API Client (src/lib/api.ts)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Clear cookies before each test
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('injects Authorization bearer token from document.cookie crm_token', async () => {
    document.cookie = 'crm_token=mock-jwt-token-xyz; path=/';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: '1', username: 'alice' } }),
    });
    global.fetch = mockFetch;

    await api.auth.me();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/auth/me');
    expect(options.headers).toHaveProperty('Authorization', 'Bearer mock-jwt-token-xyz');
  });

  it('unwraps successful JSON responses', async () => {
    const mockCompanies = [{ id: '1', name: 'Stripe' }];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCompanies,
    });

    const result = await api.companies.list();
    expect(result).toEqual(mockCompanies);
  });

  it('throws structured error on 400 with field validations', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'Validation failed',
        fields: { email: 'Invalid email address', password: 'Too short' },
      }),
    });

    await expect(api.auth.login('user', 'pass')).rejects.toThrowError(
      /email: Invalid email address/
    );
  });

  it('throws standard error message when API responds with error string', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid credentials' }),
    });

    await expect(api.auth.login('baduser', 'badpass')).rejects.toThrowError('Invalid credentials');
  });

  it('calls prospects.lookup with query params and returns result', async () => {
    const mockLookup = { data: { id: 'p-1', first_name: 'Jane' }, pending: null };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockLookup,
    });
    global.fetch = mockFetch;

    const res = await api.prospects.lookup({ linkedin_url: 'https://linkedin.com/in/jane' });
    expect(res).toEqual(mockLookup);
    expect(mockFetch.mock.calls[0]?.[0]).toContain('/prospects/lookup?linkedin_url=https%3A%2F%2Flinkedin.com%2Fin%2Fjane');
  });

  it('calls prospects.fromLinkedIn with linkedin_url and name', async () => {
    const mockResult = { created: true, data: { id: 'p-1', first_name: 'Jane', last_name: 'Doe' } };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });
    global.fetch = mockFetch;

    const res = await api.prospects.fromLinkedIn({
      linkedin_url: 'https://linkedin.com/in/jane-doe',
      name: 'Jane Doe',
    });

    expect(res).toEqual(mockResult);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/prospects/from-linkedin');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      linkedin_url: 'https://linkedin.com/in/jane-doe',
      name: 'Jane Doe',
    });
  });

  it('calls autofill.aiFill with POST request and returns answers', async () => {
    const mockResponse = {
      success: true,
      answers: [{ id: 'q1', value: 'Yes', optionIndex: 0 }],
      modelUsed: 'gemini',
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
    global.fetch = mockFetch;

    const res = await api.autofill.aiFill({
      job_title: 'Software Engineer',
      fields: [{ id: 'q1', label: 'Eligible?', type: 'select', options: ['Yes', 'No'] }],
    });

    expect(res).toEqual(mockResponse);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/autofill/ai-fill');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      job_title: 'Software Engineer',
      fields: [{ id: 'q1', label: 'Eligible?', type: 'select', options: ['Yes', 'No'] }],
    });
  });

  it('calls admin.monitoring and returns overview data', async () => {
    const mockOverview = { data: { users: { total: 5 }, cronJobs: [], sourceTelemetry: [], recentErrors: [] } };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockOverview,
    });
    global.fetch = mockFetch;

    const res = await api.admin.monitoring();
    expect(res).toEqual(mockOverview);
    expect(mockFetch.mock.calls[0]?.[0]).toContain('/admin/monitoring');
  });
});
