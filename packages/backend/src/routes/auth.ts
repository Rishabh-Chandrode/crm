import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/index.js';
import { CONFIG } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import type { User } from '../types/index.js';

const router: ReturnType<typeof Router> = Router();

router.post('/login', async (req, res) => {
  const body = req.body as { username?: unknown; password?: unknown };
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const result = await pool.query<User & { password_hash: string }>(
    'SELECT * FROM users WHERE username = $1 AND is_active = TRUE',
    [username]
  );
  const user = result.rows[0];

  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    CONFIG.jwtSecret,
    { expiresIn: CONFIG.jwtExpiresIn } as jwt.SignOptions
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
  });
});

router.post('/signup', async (req, res) => {
  const body = req.body as { username?: unknown; email?: unknown; password?: unknown };
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const email    = typeof body.email === 'string' ? body.email.trim() || null : null;
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }
  if (username.length < 3) {
    res.status(400).json({ error: 'Username must be at least 3 characters' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rowCount && existing.rowCount > 0) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query<User>(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, $3, 'user')
     RETURNING id, username, email, role`,
    [username, email, hash]
  );
  const user = result.rows[0]!;

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    CONFIG.jwtSecret,
    { expiresIn: CONFIG.jwtExpiresIn } as jwt.SignOptions
  );

  res.status(201).json({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
  });
});

router.get('/me', authMiddleware, async (req, res) => {
  const result = await pool.query<User>(
    `SELECT id, username, email, role, is_active,
            first_name, last_name, current_company, job_title, phone, website, bio,
            gmail_user, from_name, reply_to_email,
            (gmail_refresh_token IS NOT NULL) AS has_gmail_configured,
            created_at
     FROM users WHERE id = $1`,
    [req.user!.id]
  );
  const user = result.rows[0];
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
});

router.patch('/profile', authMiddleware, async (req, res) => {
  const body = req.body as {
    first_name?: unknown; last_name?: unknown; email?: unknown;
    current_company?: unknown; job_title?: unknown; phone?: unknown;
    website?: unknown; bio?: unknown;
    from_name?: unknown; reply_to_email?: unknown;
  };

  const updates: string[] = [];
  const values: unknown[] = [];
  const add = (col: string, val: unknown) => {
    updates.push(`${col} = $${updates.length + 1}`);
    values.push(val);
  };

  if (body.first_name !== undefined)     add('first_name',     typeof body.first_name === 'string' ? body.first_name.trim() || null : null);
  if (body.last_name !== undefined)      add('last_name',      typeof body.last_name === 'string' ? body.last_name.trim() || null : null);
  if (body.email !== undefined)          add('email',          typeof body.email === 'string' ? body.email.trim() || null : null);
  if (body.current_company !== undefined) add('current_company', typeof body.current_company === 'string' ? body.current_company.trim() || null : null);
  if (body.job_title !== undefined)      add('job_title',      typeof body.job_title === 'string' ? body.job_title.trim() || null : null);
  if (body.phone !== undefined)          add('phone',          typeof body.phone === 'string' ? body.phone.trim() || null : null);
  if (body.website !== undefined)        add('website',        typeof body.website === 'string' ? body.website.trim() || null : null);
  if (body.bio !== undefined)            add('bio',            typeof body.bio === 'string' ? body.bio.trim() || null : null);
  if (body.from_name !== undefined)      add('from_name',      typeof body.from_name === 'string' ? body.from_name.trim() || null : null);
  if (body.reply_to_email !== undefined) add('reply_to_email', typeof body.reply_to_email === 'string' ? body.reply_to_email.trim() || null : null);

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  updates.push('updated_at = NOW()');
  values.push(req.user!.id);

  const result = await pool.query<User>(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length}
     RETURNING id, username, email, role, is_active,
               first_name, last_name, current_company, job_title, phone, website, bio,
               gmail_user, from_name, reply_to_email,
               (gmail_refresh_token IS NOT NULL) AS has_gmail_configured`,
    values
  );
  res.json({ user: result.rows[0] });
});

export default router;
