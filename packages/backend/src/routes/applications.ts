import { Router } from 'express';
import type { Response } from 'express';
import { pool } from '../db/index.js';
import type { Request } from 'express';

const router: ReturnType<typeof Router> = Router();

const VALID_STATUSES = [
  'not_applied',
  'open',
  'referral_requested',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
  'closed',
];

// GET /api/applications
router.get('/', async (req: Request, res: Response) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const userId = req.user!.id;
    const { status, search, limit = '100', offset = '0', job_id } = req.query as Record<string, string>;

    const conditions: string[] = isAdmin ? ['1=1'] : ['ja.user_id = $1'];
    const params: unknown[] = isAdmin ? [] : [userId];
    let i = isAdmin ? 1 : 2;

    if (status) {
      conditions.push(`ja.status = $${i++}`);
      params.push(status);
    }
    if (job_id) {
      conditions.push(`ja.job_id = $${i++}`);
      params.push(job_id);
    }
    if (search) {
      conditions.push(`(ja.company_name ILIKE $${i} OR ja.job_title ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }

    const where = conditions.join(' AND ');
    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT ja.*,
                COALESCE(j.company_id, c.id) AS company_id,
                CASE WHEN j.id IS NOT NULL THEN
                  json_build_object('id', j.id, 'title', j.title, 'job_url', j.job_url, 'company_id', COALESCE(j.company_id, c.id))
                ELSE NULL END AS job,
                COALESCE(em.email_count, 0)::int AS email_count,
                em.latest_referral_requested_at AS referral_requested_at
         FROM job_applications ja
         LEFT JOIN jobs j ON j.id = ja.job_id
         LEFT JOIN companies c ON (j.company_id = c.id OR (LOWER(c.name) = LOWER(ja.company_name) AND (c.created_by = ja.user_id OR c.created_by IS NULL)))
         LEFT JOIN (
           SELECT es.job_id,
                  COUNT(es.id) AS email_count,
                  MIN(es.created_at) AS latest_referral_requested_at
           FROM email_sends es
           WHERE es.job_id IS NOT NULL
           GROUP BY es.job_id
         ) em ON em.job_id = ja.job_id
         WHERE ${where}
         ORDER BY ja.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, parseInt(limit), parseInt(offset)],
      ),
      pool.query(`SELECT COUNT(*) FROM job_applications ja WHERE ${where}`, params),
    ]);

    res.json({ applications: rows.rows, total: parseInt(countRow.rows[0].count as string) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/applications/:id/emails
router.get('/:id/emails', async (req: Request, res: Response) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const userId = req.user!.id;
    const { id } = req.params;

    const appRes = await pool.query<{ job_id: string | null }>(
      `SELECT job_id FROM job_applications WHERE id = $1 ${isAdmin ? '' : 'AND user_id = $2'}`,
      isAdmin ? [id] : [id, userId]
    );
    if (appRes.rows.length === 0) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    const jobId = appRes.rows[0]!.job_id;
    if (!jobId) {
      res.json({ data: [] });
      return;
    }

    const emails = await pool.query(
      `SELECT es.*,
              json_build_object(
                'first_name', p.first_name,
                'last_name', p.last_name,
                'email', p.email,
                'job_title', p.job_title
              ) AS prospect,
              json_build_object('name', c.name) AS company,
              json_build_object('name', t.name) AS template
       FROM email_sends es
       LEFT JOIN prospects p ON es.prospect_id = p.id
       LEFT JOIN companies c ON es.company_id = c.id
       LEFT JOIN email_templates t ON es.template_id = t.id
       WHERE es.job_id = $1 ${isAdmin ? '' : 'AND (es.created_by = $2 OR es.created_by IS NULL)'}
       ORDER BY es.created_at DESC`,
      isAdmin ? [jobId] : [jobId, userId]
    );

    res.json({ data: emails.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/applications
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { company_name, job_title, job_url, platform, status, notes, applied_at, job_id, jobId } = req.body as {
      company_name: string;
      job_title: string;
      job_url: string;
      platform?: string;
      status?: string;
      notes?: string;
      applied_at?: string;
      job_id?: string | null;
      jobId?: string | null;
    };

    if (!company_name || !job_title || !job_url) {
      res.status(400).json({ error: 'company_name, job_title, and job_url are required' });
      return;
    }

    if (status && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      return;
    }

    let normalizedStatus = status ? (status === 'open' ? 'not_applied' : status) : 'not_applied';

    // Auto-resolve or create company in companies table
    let resolvedCompanyId: string | null = null;
    const trimmedCompanyName = company_name.trim();
    const existingComp = await pool.query<{ id: string }>(
      `SELECT id FROM companies WHERE LOWER(name) = LOWER($1) AND (created_by = $2 OR created_by IS NULL) LIMIT 1`,
      [trimmedCompanyName, userId]
    );
    if (existingComp.rows.length > 0) {
      resolvedCompanyId = existingComp.rows[0]!.id;
    } else {
      const newComp = await pool.query<{ id: string }>(
        `INSERT INTO companies (name, created_by) VALUES ($1, $2) RETURNING id`,
        [trimmedCompanyName, userId]
      );
      resolvedCompanyId = newComp.rows[0]!.id;
    }

    let targetJobId = job_id || jobId || null;

    if (!targetJobId) {
      const jobRes = await pool.query<{ id: string }>(
        `INSERT INTO jobs (title, job_url, company_id, status, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [job_title.trim(), job_url.trim(), resolvedCompanyId, normalizedStatus, notes?.trim() || null, userId]
      );
      targetJobId = jobRes.rows[0]!.id;
    } else if (resolvedCompanyId) {
      await pool.query(
        `UPDATE jobs SET company_id = COALESCE(company_id, $1), updated_at = NOW() WHERE id = $2 AND created_by = $3`,
        [resolvedCompanyId, targetJobId, userId]
      ).catch(() => undefined);
    }

    const result = await pool.query(
      `INSERT INTO job_applications (user_id, company_name, job_title, job_url, platform, status, notes, applied_at, job_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        userId,
        trimmedCompanyName,
        job_title.trim(),
        job_url.trim(),
        platform?.trim() || 'Generic',
        normalizedStatus,
        notes?.trim() || null,
        applied_at ? new Date(applied_at) : new Date(),
        targetJobId,
      ],
    );

    if (targetJobId) {
      pool.query(
        `UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2 AND created_by = $3`,
        [normalizedStatus, targetJobId, userId]
      ).catch(() => undefined);
    }

    res.status(201).json({ ...result.rows[0], company_id: resolvedCompanyId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/applications/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const userId = req.user!.id;
    const { id } = req.params;
    const { company_name, job_title, job_url, platform, status, notes, applied_at, job_id, jobId } = req.body as {
      company_name?: string;
      job_title?: string;
      job_url?: string;
      platform?: string;
      status?: string;
      notes?: string | null;
      applied_at?: string;
      job_id?: string | null;
      jobId?: string | null;
    };

    if (status && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      return;
    }

    const updates: string[] = ['updated_at = NOW()'];
    const params: unknown[] = isAdmin ? [id] : [id, userId];
    let i = params.length + 1;
    let resolvedCompanyId: string | null = null;

    if (company_name !== undefined) {
      if (!company_name.trim()) {
        res.status(400).json({ error: 'company_name cannot be empty' });
        return;
      }
      const trimmedCompanyName = company_name.trim();
      const existingComp = await pool.query<{ id: string }>(
        `SELECT id FROM companies WHERE LOWER(name) = LOWER($1) AND (created_by = $2 OR created_by IS NULL) LIMIT 1`,
        [trimmedCompanyName, userId]
      );
      if (existingComp.rows.length > 0) {
        resolvedCompanyId = existingComp.rows[0]!.id;
      } else {
        const newComp = await pool.query<{ id: string }>(
          `INSERT INTO companies (name, created_by) VALUES ($1, $2) RETURNING id`,
          [trimmedCompanyName, userId]
        );
        resolvedCompanyId = newComp.rows[0]!.id;
      }
      updates.push(`company_name = $${i++}`);
      params.push(trimmedCompanyName);
    }

    if (job_title !== undefined) {
      if (!job_title.trim()) {
        res.status(400).json({ error: 'job_title cannot be empty' });
        return;
      }
      updates.push(`job_title = $${i++}`);
      params.push(job_title.trim());
    }

    if (job_url !== undefined) {
      if (!job_url.trim()) {
        res.status(400).json({ error: 'job_url cannot be empty' });
        return;
      }
      updates.push(`job_url = $${i++}`);
      params.push(job_url.trim());
    }

    if (platform !== undefined) {
      updates.push(`platform = $${i++}`);
      params.push(platform.trim() || 'Generic');
    }

    if (status !== undefined) {
      const normalizedStatus = status === 'open' ? 'not_applied' : status;
      updates.push(`status = $${i++}`);
      params.push(normalizedStatus);
    }

    if (notes !== undefined) {
      updates.push(`notes = $${i++}`);
      params.push(notes ? notes.trim() : null);
    }

    if (applied_at !== undefined) {
      updates.push(`applied_at = $${i++}`);
      params.push(applied_at ? new Date(applied_at) : new Date());
    }

    if (job_id !== undefined || jobId !== undefined) {
      updates.push(`job_id = $${i++}`);
      params.push(job_id ?? jobId ?? null);
    }

    const result = await pool.query(
      `UPDATE job_applications
       SET ${updates.join(', ')}
       WHERE id = $1 ${isAdmin ? '' : 'AND user_id = $2'}
       RETURNING *`,
      params,
    );

    if (!result.rowCount) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const updatedApp = result.rows[0];
    const targetJob = updatedApp.job_id;
    if (targetJob) {
      const jobUpdates: string[] = ['updated_at = NOW()'];
      const jobParams: unknown[] = isAdmin ? [targetJob] : [targetJob, userId];
      let ji = jobParams.length + 1;
      if (status !== undefined) {
        jobUpdates.push(`status = $${ji++}`);
        jobParams.push(status === 'open' ? 'not_applied' : status);
      }
      if (resolvedCompanyId) {
        jobUpdates.push(`company_id = $${ji++}`);
        jobParams.push(resolvedCompanyId);
      }
      if (job_title !== undefined) {
        jobUpdates.push(`title = $${ji++}`);
        jobParams.push(job_title.trim());
      }
      if (job_url !== undefined) {
        jobUpdates.push(`job_url = $${ji++}`);
        jobParams.push(job_url.trim());
      }
      if (jobUpdates.length > 1) {
        pool.query(
          `UPDATE jobs SET ${jobUpdates.join(', ')} WHERE id = $1 ${isAdmin ? '' : 'AND created_by = $2'}`,
          jobParams
        ).catch(() => undefined);
      }
    }

    res.json({ ...updatedApp, company_id: resolvedCompanyId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/applications/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM job_applications WHERE id = $1 ${isAdmin ? '' : 'AND user_id = $2'}`,
      isAdmin ? [id] : [id, userId],
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
