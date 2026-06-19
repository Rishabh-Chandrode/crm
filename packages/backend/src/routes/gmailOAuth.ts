import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { pool } from '../db/index.js';
import { CONFIG } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import type { User } from '../types/index.js';

const router: ReturnType<typeof Router> = Router();

const GMAIL_SCOPES = [
  'https://mail.google.com/',
  'openid',
  'email',
  'profile',
].join(' ');

// GET /api/auth/gmail/connect
router.get('/connect', authMiddleware, (req, res) => {
  if (!CONFIG.googleClientId || !CONFIG.googleClientSecret) {
    res.status(503).json({ error: 'Google OAuth is not configured on this server' });
    return;
  }

  const state = jwt.sign(
    { flow: 'gmail', userId: req.user!.id },
    CONFIG.jwtSecret,
    { expiresIn: '10m' }
  );

  const params = new URLSearchParams({
    client_id: CONFIG.googleClientId,
    redirect_uri: CONFIG.googleRedirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

// GET /api/auth/gmail/callback
// Shared callback for both the Gmail-connect flow and the Google-login flow.
// The `flow` field in the state JWT determines which path to take.
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    res.redirect(`${CONFIG.frontendUrl}/settings?gmail=error&reason=${encodeURIComponent(error)}`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${CONFIG.frontendUrl}/settings?gmail=error&reason=missing_params`);
    return;
  }

  let payload: { flow?: string; userId?: string };
  try {
    payload = jwt.verify(state, CONFIG.jwtSecret) as typeof payload;
  } catch {
    res.redirect(`${CONFIG.frontendUrl}/settings?gmail=error&reason=invalid_state`);
    return;
  }

  if (payload.flow === 'login') {
    await handleLoginCallback(code, res);
  } else {
    await handleGmailCallback(code, payload.userId, res);
  }
});

async function handleLoginCallback(
  code: string,
  res: import('express').Response
): Promise<void> {
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CONFIG.googleClientId,
        client_secret: CONFIG.googleClientSecret,
        redirect_uri: CONFIG.googleRedirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json() as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || tokens.error || !tokens.access_token) {
      const reason = tokens.error_description ?? tokens.error ?? 'token_exchange_failed';
      res.redirect(`${CONFIG.frontendUrl}/login?google_error=${encodeURIComponent(reason)}`);
      return;
    }

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleUser = await userInfoRes.json() as {
      sub?: string;
      email?: string;
      given_name?: string;
      family_name?: string;
    };

    if (!googleUser.sub || !googleUser.email) {
      res.redirect(`${CONFIG.frontendUrl}/login?google_error=no_email`);
      return;
    }

    let user = (await pool.query<User>(
      `SELECT id, username, email, role FROM users
       WHERE google_id = $1 OR (LOWER(email) = LOWER($2) AND is_active = TRUE)
       LIMIT 1`,
      [googleUser.sub, googleUser.email]
    )).rows[0];

    if (user) {
      await pool.query(
        `UPDATE users SET google_id = COALESCE(google_id, $1), updated_at = NOW() WHERE id = $2`,
        [googleUser.sub, user.id]
      );
    } else {
      const base = googleUser.email.split('@')[0]!.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      let username = base;
      let attempt = 0;
      while (true) {
        const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (!exists.rowCount || exists.rowCount === 0) break;
        attempt++;
        username = `${base}${attempt}`;
      }

      const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);

      const created = await pool.query<User>(
        `INSERT INTO users (username, email, password_hash, role, google_id, first_name, last_name)
         VALUES ($1, $2, $3, 'user', $4, $5, $6)
         RETURNING id, username, email, role`,
        [username, googleUser.email, passwordHash, googleUser.sub, googleUser.given_name ?? null, googleUser.family_name ?? null]
      );
      user = created.rows[0]!;
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      CONFIG.jwtSecret,
      { expiresIn: CONFIG.jwtExpiresIn } as jwt.SignOptions
    );

    res.redirect(`${CONFIG.frontendUrl}/login?google_token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error('Google login callback error:', err);
    res.redirect(`${CONFIG.frontendUrl}/login?google_error=server_error`);
  }
}

async function handleGmailCallback(
  code: string,
  userId: string | undefined,
  res: import('express').Response
): Promise<void> {
  if (!userId) {
    res.redirect(`${CONFIG.frontendUrl}/settings?gmail=error&reason=invalid_state`);
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CONFIG.googleClientId,
        client_secret: CONFIG.googleClientSecret,
        redirect_uri: CONFIG.googleRedirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json() as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || tokens.error || !tokens.refresh_token) {
      const reason = tokens.error_description ?? tokens.error ?? 'token_exchange_failed';
      res.redirect(`${CONFIG.frontendUrl}/settings?gmail=error&reason=${encodeURIComponent(reason)}`);
      return;
    }

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoRes.json() as { email?: string };

    await pool.query(
      `UPDATE users SET gmail_user = $1, gmail_refresh_token = $2, updated_at = NOW() WHERE id = $3`,
      [userInfo.email ?? null, tokens.refresh_token, userId]
    );

    res.redirect(`${CONFIG.frontendUrl}/settings?gmail=connected`);
  } catch (err) {
    console.error('Gmail OAuth callback error:', err);
    res.redirect(`${CONFIG.frontendUrl}/settings?gmail=error&reason=server_error`);
  }
}

// DELETE /api/auth/gmail/disconnect — clears OAuth tokens
router.delete('/disconnect', authMiddleware, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE users SET gmail_user = NULL, gmail_refresh_token = NULL, updated_at = NOW() WHERE id = $1`,
      [req.user!.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/gmail/app-password — save app password credentials
router.post('/app-password', authMiddleware, async (req, res, next) => {
  try {
    const body = req.body as { gmail_user?: unknown; app_password?: unknown };
    const gmailUser   = typeof body.gmail_user   === 'string' ? body.gmail_user.trim()   : '';
    const appPassword = typeof body.app_password === 'string' ? body.app_password.trim() : '';

    if (!gmailUser || !appPassword) {
      res.status(400).json({ error: 'gmail_user and app_password are required' });
      return;
    }

    await pool.query(
      `UPDATE users SET gmail_user = $1, gmail_app_password = $2, updated_at = NOW() WHERE id = $3`,
      [gmailUser, appPassword, req.user!.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/gmail/app-password — remove app password credentials
router.delete('/app-password', authMiddleware, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE users SET gmail_app_password = NULL, updated_at = NOW() WHERE id = $1`,
      [req.user!.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
