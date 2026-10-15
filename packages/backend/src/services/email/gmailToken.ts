import { pool } from '../../db/index.js';
import { CONFIG } from '../../config.js';

/** Refresh a stored access token when it will expire inside this window. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface GmailTokenUpdate {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

interface StoredGmailRow {
  gmail_refresh_token: string | null;
  gmail_access_token: string | null;
  gmail_access_token_expires_at: Date | string | null;
}

export async function exchangeGmailRefreshToken(refreshToken: string): Promise<GmailTokenUpdate> {
  const body = new URLSearchParams({
    client_id: CONFIG.googleClientId.trim(),
    client_secret: CONFIG.googleClientSecret.trim(),
    refresh_token: refreshToken.trim(),
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await res.json() as GoogleTokenResponse;
  if (!res.ok || !data.access_token) {
    const reason = data.error_description || data.error || `HTTP ${res.status}`;
    const err = new Error(`Failed to refresh Google access token: ${reason}`) as Error & { code?: string };
    err.code = data.error;
    throw err;
  }

  const expiresIn = data.expires_in ?? 3600;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token?.trim() || refreshToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}

export async function saveGmailToken(userId: string, token: GmailTokenUpdate): Promise<void> {
  await pool.query(
    `UPDATE users
     SET gmail_access_token = $1,
         gmail_access_token_expires_at = $2,
         gmail_refresh_token = $3,
         gmail_token_error = NULL,
         updated_at = NOW()
     WHERE id = $4`,
    [token.accessToken, token.expiresAt, token.refreshToken, userId]
  );
}

/**
 * Returns a usable Gmail access token for this user.
 * Exchanges the refresh token when the access token is missing or about to expire,
 * and stores a rotated refresh token when Google issues one.
 */
export async function ensureFreshGmailToken(userId: string, force = false): Promise<GmailTokenUpdate | null> {
  const result = await pool.query<StoredGmailRow>(
    `SELECT gmail_refresh_token, gmail_access_token, gmail_access_token_expires_at
     FROM users WHERE id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row?.gmail_refresh_token) return null;

  const expiresAt = row.gmail_access_token_expires_at
    ? new Date(row.gmail_access_token_expires_at)
    : null;
  const stillValid = !force
    && !!row.gmail_access_token
    && !!expiresAt
    && expiresAt.getTime() > Date.now() + REFRESH_BUFFER_MS;

  if (stillValid && row.gmail_access_token && expiresAt) {
    return {
      accessToken: row.gmail_access_token,
      refreshToken: row.gmail_refresh_token,
      expiresAt,
    };
  }

  try {
    const fresh = await exchangeGmailRefreshToken(row.gmail_refresh_token);
    await saveGmailToken(userId, fresh);
    return fresh;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE users SET gmail_token_error = $1, updated_at = NOW() WHERE id = $2`,
      [message, userId]
    );
    throw err;
  }
}

/** Refresh Gmail tokens that are missing or will expire before the next scheduler tick. */
export async function refreshDueGmailTokens(): Promise<number> {
  const due = await pool.query<{ id: string }>(
    `SELECT id FROM users
     WHERE gmail_refresh_token IS NOT NULL
       AND (
         gmail_access_token IS NULL
         OR gmail_access_token_expires_at IS NULL
         OR gmail_access_token_expires_at <= NOW() + INTERVAL '45 minutes'
       )`
  );

  let refreshed = 0;
  for (const user of due.rows) {
    try {
      const token = await ensureFreshGmailToken(user.id, true);
      if (token) refreshed += 1;
    } catch (err) {
      console.error(`[Scheduler] Gmail token refresh failed for ${user.id}:`, err);
    }
  }
  return refreshed;
}
