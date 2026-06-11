import { Router } from 'express';
import { pool } from '../db/index.js';
import { inferRoleCategory } from '../services/roleCategory.js';
import type { Prospect } from '../types/index.js';

const router: ReturnType<typeof Router> = Router();

router.get('/', async (req, res, next) => {
  try {
    const { company_id } = req.query as { company_id?: string };
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (company_id) {
      conditions.push(`p.company_id = $${values.length + 1}`);
      values.push(company_id);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query<Prospect & { company_name: string }>(
      `SELECT p.*, c.name AS company_name
       FROM prospects p
       LEFT JOIN companies c ON c.id = p.company_id
       ${where}
       ORDER BY p.first_name ASC, p.last_name ASC`,
      values
    );
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { company_id, first_name, last_name, email, job_title, linkedin_url, phone, notes } =
      req.body as Partial<Prospect>;
    const role_category: string | null =
      (req.body as { role_category?: string | null }).role_category !== undefined
        ? ((req.body as { role_category?: string | null }).role_category || null)
        : inferRoleCategory(job_title);

    if (!first_name?.trim()) { res.status(400).json({ error: 'first_name is required' }); return; }
    if (!email?.trim()) { res.status(400).json({ error: 'email is required' }); return; }

    const result = await pool.query<Prospect>(
      `INSERT INTO prospects (company_id, first_name, last_name, email, job_title, role_category, linkedin_url, phone, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        company_id ?? null,
        first_name.trim(),
        last_name?.trim() ?? null,
        email.trim().toLowerCase(),
        job_title ?? null,
        role_category,
        linkedin_url ?? null,
        phone ?? null,
        notes ?? null,
      ]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Used by the browser extension: accepts company_name and creates the company if needed.
router.post('/quick-add', async (req, res, next) => {
  try {
    const { first_name, last_name, email, company_name, job_title, linkedin_url } = req.body as {
      first_name: string;
      last_name?: string | null;
      email: string;
      company_name?: string | null;
      job_title?: string | null;
      linkedin_url?: string | null;
    };

    if (!first_name?.trim()) { res.status(400).json({ error: 'first_name is required' }); return; }
    if (!email?.trim())      { res.status(400).json({ error: 'email is required' }); return; }

    const normalizedEmail = email.trim().toLowerCase();

    // Check for duplicate email
    const existing = await pool.query<{ id: string }>(
      'SELECT id FROM prospects WHERE email = $1',
      [normalizedEmail]
    );
    if (existing.rows[0]) {
      res.status(409).json({ error: 'A prospect with this email already exists' });
      return;
    }

    // Resolve or create company
    let companyId: string | null = null;
    if (company_name?.trim()) {
      const name = company_name.trim();
      const companyRes = await pool.query<{ id: string }>(
        'SELECT id FROM companies WHERE LOWER(name) = LOWER($1) LIMIT 1',
        [name]
      );
      if (companyRes.rows[0]) {
        companyId = companyRes.rows[0].id;
      } else {
        const newCompany = await pool.query<{ id: string }>(
          'INSERT INTO companies (name) VALUES ($1) RETURNING id',
          [name]
        );
        companyId = newCompany.rows[0]?.id ?? null;
      }
    }

    const result = await pool.query(
      `INSERT INTO prospects (company_id, first_name, last_name, email, job_title, role_category, linkedin_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [companyId, first_name.trim(), last_name?.trim() ?? null, normalizedEmail, job_title ?? null, inferRoleCategory(job_title), linkedin_url ?? null]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query<Prospect>(
      `SELECT p.*, row_to_json(c) AS company
       FROM prospects p
       LEFT JOIN companies c ON c.id = p.company_id
       WHERE p.id = $1`,
      [id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { company_id, first_name, last_name, email, job_title, linkedin_url, phone, notes } =
      req.body as Partial<Prospect>;
    const bodyRoleCategory = (req.body as { role_category?: string | null }).role_category;

    const fields: string[] = [];
    const values: unknown[] = [];

    const add = (col: string, val: unknown) => {
      fields.push(`${col} = $${fields.length + 1}`);
      values.push(val);
    };

    if (company_id !== undefined)   add('company_id',   company_id);
    if (first_name !== undefined)   add('first_name',   first_name?.trim());
    if (last_name !== undefined)    add('last_name',    last_name?.trim() ?? null);
    if (email !== undefined)        add('email',        email?.toLowerCase());
    if (job_title !== undefined)    add('job_title',    job_title);
    if (linkedin_url !== undefined) add('linkedin_url', linkedin_url);
    if (phone !== undefined)        add('phone',        phone);
    if (notes !== undefined)        add('notes',        notes);
    if (bodyRoleCategory !== undefined) {
      add('role_category', bodyRoleCategory || null);
    } else if (job_title !== undefined) {
      add('role_category', inferRoleCategory(job_title));
    }

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const result = await pool.query<Prospect>(
      `UPDATE prospects SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Prospect not found' });
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
      'DELETE FROM prospects WHERE id = $1 RETURNING id',
      [id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }
    res.json({ data: { id } });
  } catch (err) {
    next(err);
  }
});

export default router;
