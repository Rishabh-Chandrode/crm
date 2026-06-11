import { Router } from 'express';
import { pool } from '../db/index.js';

const router: ReturnType<typeof Router> = Router();

router.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query<{ key: string; value: string }>(
      `SELECT key, value FROM settings`
    );
    const settings: Record<string, string> = {};
    for (const r of result.rows) settings[r.key] = r.value;
    res.json({ data: settings });
  } catch (err) {
    next(err);
  }
});

router.put('/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body as { value: string };
    if (value === undefined) {
      res.status(400).json({ error: 'value is required' });
      return;
    }
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
    res.json({ data: { key, value } });
  } catch (err) {
    next(err);
  }
});

export default router;
