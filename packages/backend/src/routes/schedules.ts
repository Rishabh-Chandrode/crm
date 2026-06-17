import { Router } from 'express';
import { pool } from '../db/index.js';

const router: ReturnType<typeof Router> = Router();

router.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT es.*,
              json_build_object('name', c.name) AS company,
              json_build_object('name', t.name) AS template
       FROM email_schedules es
       LEFT JOIN companies c ON c.id = es.company_id
       LEFT JOIN email_templates t ON t.id = es.template_id
       ORDER BY es.scheduled_for DESC`
    );
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT es.*,
              json_build_object('name', c.name) AS company,
              json_build_object('name', t.name, 'subject', t.subject) AS template
       FROM email_schedules es
       LEFT JOIN companies c ON c.id = es.company_id
       LEFT JOIN email_templates t ON t.id = es.template_id
       WHERE es.id = $1`,
      [req.params['id']]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }
    const schedule = result.rows[0];

    // Fetch prospects: either the selected ones or all from the company
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
      companyId,
      prospectIds = [],
      customValues = {},
      scheduledFor,
      documentIds = [],
    } = req.body as {
      templateId: string;
      companyId: string;
      prospectIds?: string[];
      customValues?: Record<string, string>;
      scheduledFor: string;
      documentIds?: string[];
    };

    if (!templateId || !companyId || !scheduledFor) {
      res.status(400).json({ error: 'templateId, companyId and scheduledFor are required' });
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
         (template_id, company_id, prospect_ids, custom_values, scheduled_for, total_prospects, document_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [templateId, companyId, prospectIds, JSON.stringify(customValues), scheduledDate, totalProspects, documentIds]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE email_schedules SET status = 'cancelled'
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [req.params['id']]
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

export default router;
