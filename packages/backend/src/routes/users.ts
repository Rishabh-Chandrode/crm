import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/index.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import type { User } from '../types/index.js';

const router: ReturnType<typeof Router> = Router();

router.use(authMiddleware, requireRole('admin'));

router.get('/', async (_req, res) => {
  const result = await pool.query<User>(
    'SELECT id, username, email, role, is_active, created_at, updated_at FROM users ORDER BY created_at ASC'
  );
  res.json({ data: result.rows });
});

router.post('/', async (req, res) => {
  const body = req.body as { username?: unknown; email?: unknown; password?: unknown; role?: unknown };
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const email    = typeof body.email === 'string' ? body.email.trim() || null : null;
  const password = typeof body.password === 'string' ? body.password : '';
  const role     = body.role === 'admin' ? 'admin' : 'user';

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query<User>(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, email, role, is_active, created_at, updated_at`,
    [username, email, hash, role]
  );
  res.status(201).json({ data: result.rows[0] });
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const body = req.body as { email?: unknown; role?: unknown; is_active?: unknown; password?: unknown };

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (body.email !== undefined) {
    updates.push(`email = $${idx++}`);
    values.push(typeof body.email === 'string' ? body.email.trim() || null : null);
  }
  if (body.role === 'admin' || body.role === 'user') {
    updates.push(`role = $${idx++}`);
    values.push(body.role);
  }
  if (typeof body.is_active === 'boolean') {
    updates.push(`is_active = $${idx++}`);
    values.push(body.is_active);
  }
  if (typeof body.password === 'string' && body.password.length >= 8) {
    updates.push(`password_hash = $${idx++}`);
    values.push(await bcrypt.hash(body.password, 12));
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query<User>(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}
     RETURNING id, username, email, role, is_active, created_at, updated_at`,
    values
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ data: result.rows[0] });
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  if (req.user!.id === id) {
    res.status(400).json({ error: 'Cannot delete your own account' });
    return;
  }

  const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ data: { id } });
});

export default router;
