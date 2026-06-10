import { Router } from 'express';
import { CONFIG } from '../config.js';

const router: ReturnType<typeof Router> = Router();

router.post('/login', (req, res) => {
  const body = req.body as { password?: unknown };
  if (typeof body.password === 'string' && body.password === CONFIG.adminPassword) {
    res.json({ token: CONFIG.adminPassword });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

router.get('/me', (req, res) => {
  const auth = req.headers['authorization'];
  if (auth === `Bearer ${CONFIG.adminPassword}`) {
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

export default router;
