import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { CONFIG } from '../config.js';

const router: ReturnType<typeof Router> = Router();

// Request Gmail scopes alongside login so one consent screen handles both.
// If the user approves, we log them in AND connect Gmail automatically.
const LOGIN_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://mail.google.com/',
].join(' ');

router.get('/connect', (req, res) => {
  if (!CONFIG.googleClientId || !CONFIG.googleClientSecret) {
    res.status(503).json({ error: 'Google OAuth is not configured on this server' });
    return;
  }

  const state = jwt.sign(
    { flow: 'login', nonce: randomBytes(16).toString('hex') },
    CONFIG.jwtSecret,
    { expiresIn: '10m' }
  );

  const params = new URLSearchParams({
    client_id: CONFIG.googleClientId,
    redirect_uri: CONFIG.googleRedirectUri,
    response_type: 'code',
    scope: LOGIN_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

export default router;
