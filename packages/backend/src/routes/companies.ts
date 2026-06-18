import { Router } from 'express';
import { pool } from '../db/index.js';
import { ownerFilter } from '../middleware/ownerFilter.js';
import type { Company } from '../types/index.js';

const router: ReturnType<typeof Router> = Router();

router.get('/', async (req, res, next) => {
  try {
    const { sql, value } = ownerFilter(req.user!, 'c', 1);
    const where = sql ? `WHERE ${sql}` : '';
    const params = value ? [value] : [];
    const result = await pool.query<Company>(
      `SELECT c.*, COUNT(p.id)::int AS prospect_count
       FROM companies c
       LEFT JOIN prospects p ON p.company_id = c.id
       ${where}
       GROUP BY c.id
       ORDER BY c.name ASC`,
      params
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
      `INSERT INTO companies (name, website, industry, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), website ?? null, industry ?? null, req.user!.id]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'A company with this name already exists' });
      return;
    }
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sql, value } = ownerFilter(req.user!, 'c', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [id];
    if (value) params.push(value);

    const [companyRes, prospectsRes] = await Promise.all([
      pool.query<Company>(`SELECT * FROM companies c WHERE c.id = $1 ${ownerWhere}`, params),
      pool.query(
        'SELECT * FROM prospects WHERE company_id = $1 ORDER BY first_name ASC, last_name ASC',
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

    const { sql, value } = ownerFilter(req.user!, 'companies', values.length + 1);
    const ownerWhere = sql ? `AND ${sql}` : '';
    if (value) values.push(value);

    const result = await pool.query<Company>(
      `UPDATE companies SET ${fields.join(', ')} WHERE id = $${values.length - (value ? 1 : 0)} ${ownerWhere} RETURNING *`,
      values
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'A company with this name already exists' });
      return;
    }
    next(err);
  }
});

router.post('/:id/merge', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const targetId = req.params['id'];
    const { sourceId } = req.body as { sourceId: string };

    if (!sourceId) { res.status(400).json({ error: 'sourceId is required' }); return; }
    if (sourceId === targetId) { res.status(400).json({ error: 'Cannot merge a company into itself' }); return; }

    const { sql, value } = ownerFilter(req.user!, 'c', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const ownerParams = (id: string) => value ? [id, value] : [id];

    const [targetRes, sourceRes] = await Promise.all([
      client.query<Company>(`SELECT * FROM companies c WHERE c.id = $1 ${ownerWhere}`, ownerParams(targetId)),
      client.query<Company>(`SELECT * FROM companies c WHERE c.id = $1 ${ownerWhere}`, ownerParams(sourceId)),
    ]);
    if (!targetRes.rows[0]) { res.status(404).json({ error: 'Target company not found' }); return; }
    if (!sourceRes.rows[0]) { res.status(404).json({ error: 'Source company not found' }); return; }

    await client.query('BEGIN');
    await client.query('UPDATE prospects    SET company_id = $1 WHERE company_id = $2', [targetId, sourceId]);
    await client.query('UPDATE email_sends  SET company_id = $1 WHERE company_id = $2', [targetId, sourceId]);
    await client.query('UPDATE email_schedules SET company_id = $1 WHERE company_id = $2', [targetId, sourceId]);
    await client.query('DELETE FROM companies WHERE id = $1', [sourceId]);
    await client.query('COMMIT');

    res.json({ data: { targetId, sourceId, merged: true } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    next(err);
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sql, value } = ownerFilter(req.user!, 'companies', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [id];
    if (value) params.push(value);

    const result = await pool.query<{ id: string }>(
      `DELETE FROM companies WHERE id = $1 ${ownerWhere} RETURNING id`,
      params
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
