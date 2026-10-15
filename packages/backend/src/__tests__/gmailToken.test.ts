import { afterEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../db/index.js';
import {
  ensureFreshGmailToken,
  exchangeGmailRefreshToken,
  refreshDueGmailTokens,
} from '../services/email/gmailToken.js';

describe('Gmail OAuth token refresh', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exchanges a refresh token and keeps a rotated refresh token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'access-new',
        expires_in: 3600,
        refresh_token: 'refresh-rotated',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const token = await exchangeGmailRefreshToken('refresh-old');

    expect(token.accessToken).toBe('access-new');
    expect(token.refreshToken).toBe('refresh-rotated');
    expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const body = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=refresh-old');
  });

  it('throws when Google rejects the refresh token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
    }));

    await expect(exchangeGmailRefreshToken('dead')).rejects.toThrow(/expired or revoked/);
  });

  it('reuses an access token that is still valid', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    vi.spyOn(pool, 'query').mockResolvedValueOnce({
      rows: [{
        gmail_refresh_token: 'refresh-1',
        gmail_access_token: 'access-1',
        gmail_access_token_expires_at: expiresAt,
      }],
    } as never);

    const token = await ensureFreshGmailToken('user-1');

    expect(token?.accessToken).toBe('access-1');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('stores a new access token and rotated refresh token when the current one is expiring', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'access-2', expires_in: 3600, refresh_token: 'refresh-2' }),
    }));
    const query = vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({
        rows: [{
          gmail_refresh_token: 'refresh-1',
          gmail_access_token: 'access-1',
          gmail_access_token_expires_at: new Date(Date.now() + 60 * 1000),
        }],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const token = await ensureFreshGmailToken('user-1');

    expect(token?.accessToken).toBe('access-2');
    expect(token?.refreshToken).toBe('refresh-2');
    expect(String(query.mock.calls[1]?.[0])).toContain('gmail_access_token');
    expect(query.mock.calls[1]?.[1]?.[0]).toBe('access-2');
    expect(query.mock.calls[1]?.[1]?.[2]).toBe('refresh-2');
    expect(query.mock.calls[1]?.[1]?.[3]).toBe('user-1');
  });

  it('records a token error and rethrows when refresh fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant', error_description: 'revoked' }),
    }));
    const query = vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({
        rows: [{ gmail_refresh_token: 'refresh-1', gmail_access_token: null, gmail_access_token_expires_at: null }],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await expect(ensureFreshGmailToken('user-1', true)).rejects.toThrow(/revoked/);
    expect(String(query.mock.calls[1]?.[0])).toContain('gmail_token_error');
  });

  it('refreshes every user whose access token is due', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'access-3', expires_in: 3600 }),
    }));
    vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({ rows: [{ id: 'user-9' }] } as never)
      .mockResolvedValueOnce({
        rows: [{ gmail_refresh_token: 'refresh-9', gmail_access_token: null, gmail_access_token_expires_at: null }],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await expect(refreshDueGmailTokens()).resolves.toBe(1);
  });
});
