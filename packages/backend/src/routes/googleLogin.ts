import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { CONFIG } from '../config.js';

const router: ReturnType<typeof Router> = Router();

// Login-only scopes — no Gmail. Gmail access is a separate opt-in from Settings.
const LOGIN_SCOPES = ['openid', 'email', 'profile'].join(' ');

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
    access_type: 'online',
    state,
  });

  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

export default router;
