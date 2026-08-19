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
});
