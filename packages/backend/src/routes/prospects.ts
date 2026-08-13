import { Router } from 'express';
import { pool } from '../db/index.js';
import { ownerFilter } from '../middleware/ownerFilter.js';
import { inferRoleCategory } from '../services/roleCategory.js';
import type { Prospect } from '../types/index.js';
import { CONFIG } from '../config.js';
import { getEnrichmentService } from '../services/enrichment/index.js';

const router: ReturnType<typeof Router> = Router();

const ALLOWED_SORT_COLS: Record<string, string> = {
  first_name: 'p.first_name',
  last_name: 'p.last_name',
  email: 'p.email',
  job_title: 'p.job_title',
  company_name: 'c.name',
  created_at: 'p.created_at',
};

router.get('/', async (req, res, next) => {
  try {
    const {
      company_id,
      role_category,
      search,
      sort_by = 'first_name',
      sort_dir = 'asc',
      limit: limitStr = '25',
      offset: offsetStr = '0',
    } = req.query as {
      company_id?: string;
      role_category?: string;
      search?: string;
      sort_by?: string;
      sort_dir?: string;
      limit?: string;
      offset?: string;
    };

    const limit = Math.min(Math.max(parseInt(limitStr, 10) || 25, 1), 100);
    const offset = Math.max(parseInt(offsetStr, 10) || 0, 0);
    const sortCol = ALLOWED_SORT_COLS[sort_by] ?? 'p.first_name';
    const sortDir = sort_dir === 'desc' ? 'DESC' : 'ASC';

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (company_id) {
      conditions.push(`p.company_id = $${values.length + 1}`);
      values.push(company_id);
    }
    if (role_category) {
      conditions.push(`p.role_category = $${values.length + 1}`);
      values.push(role_category);
    }
    if (search?.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      conditions.push(
        `(LOWER(p.first_name) LIKE $${values.length + 1} OR LOWER(p.last_name) LIKE $${values.length + 1} OR LOWER(p.email) LIKE $${values.length + 1} OR LOWER(COALESCE(p.job_title,'')) LIKE $${values.length + 1})`
      );
      values.push(term);
    }

    const { sql, value } = ownerFilter(req.user!, 'p', values.length + 1);
    if (sql) { conditions.push(sql); if (value) values.push(value); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [result, countResult] = await Promise.all([
      pool.query<Prospect & { company_name: string }>(
        `SELECT p.*, c.name AS company_name
         FROM prospects p
         LEFT JOIN companies c ON c.id = p.company_id
         ${where}
         ORDER BY ${sortCol} ${sortDir} NULLS LAST, p.first_name ASC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM prospects p LEFT JOIN companies c ON c.id = p.company_id ${where}`,
        values
      ),
    ]);

    res.json({ data: result.rows, total: parseInt(countResult.rows[0]?.count ?? '0', 10) });
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
      `INSERT INTO prospects (company_id, first_name, last_name, email, job_title, role_category, linkedin_url, phone, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
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
        req.user!.id,
      ]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'A prospect with this email already exists' });
      return;
    }
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
    const userId = req.user!.id;

    // Check for duplicate email scoped to this user
    const existing = await pool.query<{ id: string }>(
      'SELECT id FROM prospects WHERE email = $1 AND created_by = $2',
      [normalizedEmail, userId]
    );
    if (existing.rows[0]) {
      res.status(200).json({ data: { id: existing.rows[0].id }, existed: true });
      return;
    }

    // Resolve or create company (scoped to this user)
    let companyId: string | null = null;
    if (company_name?.trim()) {
      const name = company_name.trim();
      const companyRes = await pool.query<{ id: string }>(
        'SELECT id FROM companies WHERE LOWER(name) = LOWER($1) AND created_by = $2 LIMIT 1',
        [name, userId]
      );
      if (companyRes.rows[0]) {
        companyId = companyRes.rows[0].id;
      } else {
        const newCompany = await pool.query<{ id: string }>(
          'INSERT INTO companies (name, created_by) VALUES ($1, $2) RETURNING id',
          [name, userId]
        );
        companyId = newCompany.rows[0]?.id ?? null;
      }
    }

    const result = await pool.query(
      `INSERT INTO prospects (company_id, first_name, last_name, email, job_title, role_category, linkedin_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [companyId, first_name.trim(), last_name?.trim() ?? null, normalizedEmail, job_title ?? null, inferRoleCategory(job_title), linkedin_url ?? null, userId]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/lookup', async (req, res, next) => {
  try {
    const { linkedin_url, email } = req.query as { linkedin_url?: string; email?: string };
    const userId = req.user!.id;

    if (!linkedin_url && !email) {
      res.status(400).json({ error: 'linkedin_url or email is required' });
      return;
    }

    const conditions: string[] = [];
    const values: unknown[] = [userId];

    if (linkedin_url?.trim()) {
      const normalized = linkedin_url.trim().split('?')[0]!.toLowerCase().replace(/\/+$/, '');
      conditions.push(`LOWER(TRIM(TRAILING '/' FROM p.linkedin_url)) = $${values.length + 1}`);
      values.push(normalized);
    }
    if (email?.trim()) {
      conditions.push(`p.email = $${values.length + 1}`);
      values.push(email.trim().toLowerCase());
    }

    const result = await pool.query<Prospect & { company_name: string | null }>(
      `SELECT p.*, c.name AS company_name
       FROM prospects p
       LEFT JOIN companies c ON c.id = p.company_id
       WHERE p.created_by = $1 AND (${conditions.join(' OR ')})
       LIMIT 1`,
      values
    );

    if (!result.rows[0]) {
      res.json({ data: null });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/enrich', async (req, res, next) => {
  try {
    const { first_name, last_name, company_name, linkedin_url } = req.body as {
      first_name?: string;
      last_name?: string;
      company_name?: string;
      linkedin_url?: string;
    };

    const service = getEnrichmentService();
    const result = await service.enrich({
      first_name,
      last_name,
      company_name,
      linkedin_url,
    });

    res.json(result);
  } catch (err: any) {
    console.error("Enrichment Error:", err);
    res.status(400).json({ error: err.message || 'Failed to enrich prospect' });
  }
});

router.get('/enrich/credits', async (req, res, next) => {
  try {
    const service = getEnrichmentService();
    const provider = CONFIG.activeEnrichmentProvider;
    if (!service.getCredits) {
      res.json({ credits: null, provider });
      return;
    }

    const credits = await service.getCredits();
    res.json({ credits, provider });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sql, value } = ownerFilter(req.user!, 'p', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [id];
    if (value) params.push(value);

    const result = await pool.query<Prospect>(
      `SELECT p.*, row_to_json(c) AS company
       FROM prospects p
       LEFT JOIN companies c ON c.id = p.company_id
       WHERE p.id = $1 ${ownerWhere}`,
      params
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

    const { sql, value } = ownerFilter(req.user!, 'prospects', values.length + 1);
    const ownerWhere = sql ? `AND ${sql}` : '';
    if (value) values.push(value);

    const result = await pool.query<Prospect>(
      `UPDATE prospects SET ${fields.join(', ')} WHERE id = $${values.length - (value ? 1 : 0)} ${ownerWhere} RETURNING *`,
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
    const { sql, value } = ownerFilter(req.user!, 'prospects', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [id];
    if (value) params.push(value);

    const result = await pool.query<{ id: string }>(
      `DELETE FROM prospects WHERE id = $1 ${ownerWhere} RETURNING id`,
      params
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
