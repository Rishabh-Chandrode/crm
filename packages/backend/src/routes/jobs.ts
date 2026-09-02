import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  listJobs,
  getJobById,
  createJob,
  updateJob,
  deleteJob,
  getJobEmails,
} from '../services/jobs.js';

const router: ReturnType<typeof Router> = Router();

const VALID_JOB_STATUSES = ['open', 'referral_requested', 'applied', 'interviewing', 'closed'];

// GET /api/jobs
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { companyId, status, search, limit, offset } = req.query as Record<string, string>;

    const result = await listJobs(userId, {
      companyId,
      status,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    res.json({ data: result.jobs, total: result.total });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const job = await getJobById(id, userId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({ data: job });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { title, job_url, company_id, company_name, status, notes } = req.body as {
      title?: string;
      job_url?: string;
      company_id?: string | null;
      company_name?: string | null;
      status?: string;
      notes?: string | null;
    };

    if (!title?.trim() || !job_url?.trim()) {
      res.status(400).json({ error: 'title and job_url are required' });
      return;
    }

    if (status && !VALID_JOB_STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${VALID_JOB_STATUSES.join(', ')}` });
      return;
    }

    const job = await createJob(userId, {
      title: title.trim(),
      job_url: job_url.trim(),
      company_id: company_id ?? null,
      company_name: company_name ?? null,
      status: status || 'open',
      notes: notes ?? null,
    });

    res.status(201).json({ data: job });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/jobs/:id
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { title, job_url, company_id, status, notes } = req.body as {
      title?: string;
      job_url?: string;
      company_id?: string | null;
      status?: string;
      notes?: string | null;
    };

    if (status && !VALID_JOB_STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${VALID_JOB_STATUSES.join(', ')}` });
      return;
    }

    const job = await updateJob(id, userId, {
      title,
      job_url,
      company_id,
      status,
      notes,
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({ data: job });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/jobs/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const deleted = await deleteJob(id, userId);
    if (!deleted) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({ data: { id, deleted: true } });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id/emails
router.get('/:id/emails', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const emails = await getJobEmails(id, userId);
    res.json({ data: emails });
  } catch (err) {
    next(err);
  }
});

export default router;
