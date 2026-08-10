import { Router } from 'express';
import { pool } from '../db/index.js';
import { ownerFilter } from '../middleware/ownerFilter.js';

const router: ReturnType<typeof Router> = Router();

router.get('/', async (req, res, next) => {
  try {
    const { sql, value } = ownerFilter(req.user!, 'es', 1);
    const where = sql ? `WHERE ${sql}` : '';
    const params = value ? [value] : [];
    const result = await pool.query(
      `SELECT es.*,
              json_build_object('name', c.name) AS company,
              json_build_object('name', t.name) AS template
       FROM email_schedules es
       LEFT JOIN companies c ON c.id = es.company_id
       LEFT JOIN email_templates t ON t.id = es.template_id
       ${where}
       ORDER BY es.scheduled_for DESC`,
      params
    );
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { sql, value } = ownerFilter(req.user!, 'es', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [req.params['id']];
    if (value) params.push(value);

    const result = await pool.query(
      `SELECT es.*,
              json_build_object('name', c.name) AS company,
              json_build_object('name', t.name, 'subject', t.subject) AS template
       FROM email_schedules es
       LEFT JOIN companies c ON c.id = es.company_id
       LEFT JOIN email_templates t ON t.id = es.template_id
       WHERE es.id = $1 ${ownerWhere}`,
      params
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }
    const schedule = result.rows[0];

    let prospects: { id: string; first_name: string; last_name: string | null; email: string; job_title: string | null }[] = [];
    if (schedule.prospect_ids && schedule.prospect_ids.length > 0) {
      const pr = await pool.query(
        `SELECT id, first_name, last_name, email, job_title FROM prospects WHERE id = ANY($1) ORDER BY first_name`,
        [schedule.prospect_ids]
      );
      prospects = pr.rows;
    } else if (schedule.company_id) {
      const pr = await pool.query(
        `SELECT id, first_name, last_name, email, job_title FROM prospects WHERE company_id = $1 ORDER BY first_name`,
        [schedule.company_id]
      );
      prospects = pr.rows;
    }

    res.json({ data: { ...schedule, prospects } });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      templateId,
      companyId = null,
      prospectIds = [],
      customValues = {},
      scheduledFor,
      documentIds = [],
    } = req.body as {
      templateId: string;
      companyId?: string | null;
      prospectIds?: string[];
      customValues?: Record<string, string>;
      scheduledFor: string;
      documentIds?: string[];
    };

    if (!templateId || !scheduledFor) {
      res.status(400).json({ error: 'templateId and scheduledFor are required' });
      return;
    }
    if (!companyId && prospectIds.length === 0) {
      res.status(400).json({ error: 'Provide companyId or at least one prospectId' });
      return;
    }

    const scheduledDate = new Date(scheduledFor);
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      res.status(400).json({ error: 'scheduledFor must be a valid future date/time' });
      return;
    }

    let totalProspects: number;
    if (prospectIds.length > 0) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM prospects WHERE id = ANY($1)`,
        [prospectIds]
      );
      totalProspects = parseInt(r.rows[0]?.count ?? '0', 10);
    } else {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM prospects WHERE company_id = $1`,
        [companyId]
      );
      totalProspects = parseInt(r.rows[0]?.count ?? '0', 10);
    }

    const result = await pool.query(
      `INSERT INTO email_schedules
         (template_id, company_id, prospect_ids, custom_values, scheduled_for, total_prospects, document_ids, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [templateId, companyId, prospectIds, JSON.stringify(customValues), scheduledDate, totalProspects, documentIds, req.user!.id]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { sql, value } = ownerFilter(req.user!, 'email_schedules', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [req.params['id']];
    if (value) params.push(value);

    const result = await pool.query(
      `UPDATE email_schedules SET status = 'cancelled'
       WHERE id = $1 AND status = 'pending' ${ownerWhere}
       RETURNING *`,
      params
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Schedule not found or already sent/cancelled' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/retry', async (req, res, next) => {
  try {
    const { sql, value } = ownerFilter(req.user!, 'email_schedules', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [req.params['id']];
    if (value) params.push(value);

    const result = await pool.query(
      `UPDATE email_schedules SET status = 'pending', scheduled_for = NOW(), error_message = NULL, sent_count = 0, failed_count = 0
       WHERE id = $1 AND (status = 'failed' OR failed_count > 0) ${ownerWhere}
       RETURNING *`,
      params
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Schedule not found or has no failed emails to retry' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
