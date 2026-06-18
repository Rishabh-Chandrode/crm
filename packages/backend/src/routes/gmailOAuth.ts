import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db/index.js';
import { CONFIG } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';

const router: ReturnType<typeof Router> = Router();

const GMAIL_SCOPES = [
  'https://mail.google.com/',
  'openid',
  'email',
  'profile',
].join(' ');

// GET /api/auth/gmail/connect
// Returns the Google OAuth2 URL the frontend should redirect the user to.
router.get('/connect', authMiddleware, (req, res) => {
  if (!CONFIG.googleClientId || !CONFIG.googleClientSecret) {
    res.status(503).json({ error: 'Google OAuth is not configured on this server' });
    return;
  }

  // Sign state with JWT so the callback can verify it and identify the user
  const state = jwt.sign({ userId: req.user!.id }, CONFIG.jwtSecret, { expiresIn: '10m' });

  const params = new URLSearchParams({
    client_id: CONFIG.googleClientId,
    redirect_uri: CONFIG.googleRedirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES,
    access_type: 'offline',
    prompt: 'consent',   // always prompt so Google always returns a refresh_token
    state,
  });

  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

// GET /api/auth/gmail/callback
// Google redirects here after the user approves. Not protected by authMiddleware
// because there's no Authorization header — user identity comes from the state JWT.
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

  let userId: string;
  try {
    const payload = jwt.verify(state, CONFIG.jwtSecret) as { userId: string };
    userId = payload.userId;
  } catch {
    res.redirect(`${CONFIG.frontendUrl}/settings?gmail=error&reason=invalid_state`);
    return;
  }

  try {
    // Exchange authorization code for tokens
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

    // Fetch the user's Gmail address from Google
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
});

// DELETE /api/auth/gmail/disconnect
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

export default router;
