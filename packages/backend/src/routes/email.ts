import { Router } from 'express';
import { pool } from '../db/index.js';
import { getEmailProvider } from '../services/email/index.js';
import { resolveTemplate, plainTextToHtml } from '../services/templateEngine.js';
import type { EmailTemplate, Prospect, Company, EmailSend } from '../types/index.js';

const router: ReturnType<typeof Router> = Router();

router.get('/history', async (req, res, next) => {
  try {
    const { limit = '50', offset = '0' } = req.query as Record<string, string>;
    const result = await pool.query<EmailSend>(
      `SELECT es.*,
              json_build_object('first_name', p.first_name, 'last_name', p.last_name, 'email', p.email) AS prospect,
              json_build_object('name', c.name) AS company,
              json_build_object('name', t.name) AS template
       FROM email_sends es
       LEFT JOIN prospects p ON p.id = es.prospect_id
       LEFT JOIN companies c ON c.id = es.company_id
       LEFT JOIN email_templates t ON t.id = es.template_id
       ORDER BY es.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit, 10), parseInt(offset, 10)]
    );
    const countRes = await pool.query<{ count: string }>('SELECT COUNT(*) FROM email_sends');
    res.json({
      data: result.rows,
      total: parseInt(countRes.rows[0]?.count ?? '0', 10),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/preview', async (req, res, next) => {
  try {
    const { templateId, prospectId, customValues = {} } = req.body as {
      templateId: string;
      prospectId: string;
      customValues?: Record<string, string>;
    };

    if (!templateId || !prospectId) {
      res.status(400).json({ error: 'templateId and prospectId are required' });
      return;
    }

    const [templateRes, prospectRes] = await Promise.all([
      pool.query<EmailTemplate>('SELECT * FROM email_templates WHERE id = $1', [templateId]),
      pool.query<Prospect>(
        `SELECT p.*, row_to_json(c) AS company
         FROM prospects p LEFT JOIN companies c ON c.id = p.company_id
         WHERE p.id = $1`,
        [prospectId]
      ),
    ]);

    if (!templateRes.rows[0]) { res.status(404).json({ error: 'Template not found' }); return; }
    if (!prospectRes.rows[0]) { res.status(404).json({ error: 'Prospect not found' }); return; }

    const template = templateRes.rows[0];
    const prospect = prospectRes.rows[0];
    const company = (prospect as unknown as { company: Company | null }).company;

    const context = { prospect, company, custom: customValues };
    const resolvedSubject = resolveTemplate(template.subject, template.variables, context);
    const resolvedBody = resolveTemplate(template.body, template.variables, context);

    res.json({
      data: {
        subject: resolvedSubject,
        body: resolvedBody,
        html: plainTextToHtml(resolvedBody),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/send', async (req, res, next) => {
  try {
    const { templateId, prospectId, customValues = {} } = req.body as {
      templateId: string;
      prospectId: string;
      customValues?: Record<string, string>;
    };

    if (!templateId || !prospectId) {
      res.status(400).json({ error: 'templateId and prospectId are required' });
      return;
    }

    const [templateRes, prospectRes] = await Promise.all([
      pool.query<EmailTemplate>('SELECT * FROM email_templates WHERE id = $1', [templateId]),
      pool.query<Prospect>(
        `SELECT p.*, row_to_json(c) AS company
         FROM prospects p LEFT JOIN companies c ON c.id = p.company_id
         WHERE p.id = $1`,
        [prospectId]
      ),
    ]);

    if (!templateRes.rows[0]) { res.status(404).json({ error: 'Template not found' }); return; }
    if (!prospectRes.rows[0]) { res.status(404).json({ error: 'Prospect not found' }); return; }

    const template = templateRes.rows[0];
    const prospect = prospectRes.rows[0];
    const company = (prospect as unknown as { company: Company | null }).company;

    const context = { prospect, company, custom: customValues };
    const resolvedSubject = resolveTemplate(template.subject, template.variables, context);
    const resolvedBody = resolveTemplate(template.body, template.variables, context);
    const html = plainTextToHtml(resolvedBody);

    const sendRecord = await pool.query<EmailSend>(
      `INSERT INTO email_sends (template_id, prospect_id, company_id, subject, body, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [template.id, prospect.id, prospect.company_id, resolvedSubject, resolvedBody]
    );
    const sendId = sendRecord.rows[0]!.id;

    try {
      const provider = getEmailProvider();
      const result = await provider.send({ to: prospect.email, subject: resolvedSubject, html });

      await pool.query(
        `UPDATE email_sends SET status = 'sent', resend_id = $1, sent_at = NOW() WHERE id = $2`,
        [result.id, sendId]
      );
      res.json({ data: { id: sendId, status: 'sent', resend_id: result.id } });
    } catch (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : 'Unknown error';
      await pool.query(
        `UPDATE email_sends SET status = 'failed', error_message = $1 WHERE id = $2`,
        [msg, sendId]
      );
      res.status(502).json({ error: `Email delivery failed: ${msg}` });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/send-company', async (req, res, next) => {
  try {
    const { templateId, companyId, prospectIds, customValues = {} } = req.body as {
      templateId: string;
      companyId: string;
      prospectIds?: string[];
      customValues?: Record<string, string>;
    };

    if (!templateId || !companyId) {
      res.status(400).json({ error: 'templateId and companyId are required' });
      return;
    }

    const [templateRes, companyRes] = await Promise.all([
      pool.query<EmailTemplate>('SELECT * FROM email_templates WHERE id = $1', [templateId]),
      pool.query<Company>('SELECT * FROM companies WHERE id = $1', [companyId]),
    ]);

    if (!templateRes.rows[0]) { res.status(404).json({ error: 'Template not found' }); return; }
    if (!companyRes.rows[0]) { res.status(404).json({ error: 'Company not found' }); return; }

    const template = templateRes.rows[0];
    const company = companyRes.rows[0];

    let prospectsRes;
    if (prospectIds && prospectIds.length > 0) {
      prospectsRes = await pool.query<Prospect>(
        `SELECT * FROM prospects WHERE id = ANY($1) AND company_id = $2`,
        [prospectIds, companyId]
      );
    } else {
      prospectsRes = await pool.query<Prospect>(
        'SELECT * FROM prospects WHERE company_id = $1',
        [companyId]
      );
    }

    const prospects = prospectsRes.rows;
    if (prospects.length === 0) {
      res.status(400).json({ error: 'No prospects found for this company' });
      return;
    }

    const provider = getEmailProvider();
    const results = await Promise.allSettled(
      prospects.map(async (prospect) => {
        const context = { prospect, company, custom: customValues };
        const subject = resolveTemplate(template.subject, template.variables, context);
        const body = resolveTemplate(template.body, template.variables, context);
        const html = plainTextToHtml(body);

        const sendRecord = await pool.query<EmailSend>(
          `INSERT INTO email_sends (template_id, prospect_id, company_id, subject, body, status)
           VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
          [template.id, prospect.id, company.id, subject, body]
        );
        const sendId = sendRecord.rows[0]!.id;

        try {
          const result = await provider.send({ to: prospect.email, subject, html });
          await pool.query(
            `UPDATE email_sends SET status = 'sent', resend_id = $1, sent_at = NOW() WHERE id = $2`,
            [result.id, sendId]
          );
          return { prospectId: prospect.id, email: prospect.email, status: 'sent' };
        } catch (sendErr) {
          const msg = sendErr instanceof Error ? sendErr.message : 'Unknown error';
          await pool.query(
            `UPDATE email_sends SET status = 'failed', error_message = $1 WHERE id = $2`,
            [msg, sendId]
          );
          return { prospectId: prospect.id, email: prospect.email, status: 'failed', error: msg };
        }
      })
    );

    const summary = results.map((r) =>
      r.status === 'fulfilled' ? r.value : { status: 'failed', error: String(r.reason) }
    );

    const sent = summary.filter((s) => s.status === 'sent').length;
    const failed = summary.filter((s) => s.status === 'failed').length;

    res.json({ data: { sent, failed, total: prospects.length, results: summary } });
  } catch (err) {
    next(err);
  }
});

export default router;
