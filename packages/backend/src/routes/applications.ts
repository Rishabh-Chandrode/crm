import { Router } from 'express';
import type { Response } from 'express';
import { pool } from '../db/index.js';
import type { Request } from 'express';

const router: ReturnType<typeof Router> = Router();

const VALID_STATUSES = ['not_applied', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];

// GET /api/applications
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { status, search, limit = '100', offset = '0' } = req.query as Record<string, string>;

    const conditions: string[] = ['user_id = $1'];
    const params: unknown[] = [userId];
    let i = 2;

    if (status) {
      conditions.push(`status = $${i++}`);
      params.push(status);
    }
    if (search) {
      conditions.push(`(company_name ILIKE $${i} OR job_title ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }

    const where = conditions.join(' AND ');
    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT * FROM job_applications WHERE ${where} ORDER BY applied_at DESC LIMIT $${i} OFFSET $${i + 1}`,
        [...params, parseInt(limit), parseInt(offset)],
      ),
      pool.query(`SELECT COUNT(*) FROM job_applications WHERE ${where}`, params),
    ]);

    res.json({ applications: rows.rows, total: parseInt(countRow.rows[0].count as string) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/applications
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { company_name, job_title, job_url, platform, notes } = req.body as {
      company_name: string;
      job_title: string;
      job_url: string;
      platform?: string;
      notes?: string;
    };

    if (!company_name || !job_title || !job_url) {
      res.status(400).json({ error: 'company_name, job_title, and job_url are required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO job_applications (user_id, company_name, job_title, job_url, platform, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, company_name, job_title, job_url, platform ?? 'Generic', notes ?? null],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/applications/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { status, notes } = req.body as { status?: string; notes?: string };

    if (status && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      return;
    }

    const result = await pool.query(
      `UPDATE job_applications
       SET status     = COALESCE($1, status),
           notes      = COALESCE($2, notes),
           updated_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [status ?? null, notes ?? null, id, userId],
    );

    if (!result.rowCount) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/applications/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM job_applications WHERE id = $1 AND user_id = $2',
      [id, userId],
    );

    if (!result.rowCount) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
