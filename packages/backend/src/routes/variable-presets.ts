import { Router } from 'express';
import { pool } from '../db/index.js';
import { ownerFilter } from '../middleware/ownerFilter.js';

export interface VariablePreset {
  id: string;
  key: string;
  label: string;
  source: string;
  field: string | null;
  default_value: string;
  created_at: string;
  updated_at: string;
}

const router: ReturnType<typeof Router> = Router();

router.get('/', async (req, res, next) => {
  try {
    const { sql, value } = ownerFilter(req.user!, 'variable_presets', 1);
    const where = sql ? `WHERE ${sql}` : '';
    const params = value ? [value] : [];
    const result = await pool.query<VariablePreset>(
      `SELECT * FROM variable_presets ${where} ORDER BY key ASC`,
      params
    );
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { key, label, source, field, default_value = '' } = req.body as Partial<VariablePreset>;
    if (!key || !label || !source) {
      res.status(400).json({ error: 'key, label, and source are required' });
      return;
    }
    const result = await pool.query<VariablePreset>(
      `INSERT INTO variable_presets (key, label, source, field, default_value, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [key.trim(), label.trim(), source, field ?? null, default_value, req.user!.id]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { key, label, source, field, default_value } = req.body as Partial<VariablePreset>;
    if (!key || !label || !source) {
      res.status(400).json({ error: 'key, label, and source are required' });
      return;
    }
    const { sql, value } = ownerFilter(req.user!, 'variable_presets', 7);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [key.trim(), label.trim(), source, field ?? null, default_value ?? '', id];
    if (value) params.push(value);

    const result = await pool.query<VariablePreset>(
      `UPDATE variable_presets
       SET key = $1, label = $2, source = $3, field = $4, default_value = $5, updated_at = NOW()
       WHERE id = $6 ${ownerWhere}
       RETURNING *`,
      params
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Preset not found' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sql, value } = ownerFilter(req.user!, 'variable_presets', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [id];
    if (value) params.push(value);

    await pool.query(`DELETE FROM variable_presets WHERE id = $1 ${ownerWhere}`, params);
    res.json({ data: { id } });
  } catch (err) {
    next(err);
  }
});

export default router;
