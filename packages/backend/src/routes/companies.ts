import { Router } from 'express';
import { pool } from '../db/index.js';
import type { Company } from '../types/index.js';

const router: ReturnType<typeof Router> = Router();

router.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query<Company>(
      `SELECT c.*, COUNT(p.id)::int AS prospect_count
       FROM companies c
       LEFT JOIN prospects p ON p.company_id = c.id
       GROUP BY c.id
       ORDER BY c.name ASC`
    );
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, website, industry } = req.body as Partial<Company>;
    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const result = await pool.query<Company>(
      `INSERT INTO companies (name, website, industry)
       VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), website ?? null, industry ?? null]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [companyRes, prospectsRes] = await Promise.all([
      pool.query<Company>('SELECT * FROM companies WHERE id = $1', [id]),
      pool.query(
        'SELECT * FROM prospects WHERE company_id = $1 ORDER BY name ASC',
        [id]
      ),
    ]);
    if (!companyRes.rows[0]) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }
    res.json({ data: { ...companyRes.rows[0], prospects: prospectsRes.rows } });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, website, industry } = req.body as Partial<Company>;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) { fields.push(`name = $${fields.length + 1}`); values.push(name); }
    if (website !== undefined) { fields.push(`website = $${fields.length + 1}`); values.push(website); }
    if (industry !== undefined) { fields.push(`industry = $${fields.length + 1}`); values.push(industry); }

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query<Company>(
      `UPDATE companies SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Company not found' });
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
    const result = await pool.query<{ id: string }>(
      'DELETE FROM companies WHERE id = $1 RETURNING id',
      [id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }
    res.json({ data: { id } });
  } catch (err) {
    next(err);
  }
});

export default router;
