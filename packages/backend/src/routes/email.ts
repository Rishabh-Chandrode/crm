import { Router } from 'express';
import { pool } from '../db/index.js';
import { ownerFilter } from '../middleware/ownerFilter.js';
import { getEmailProviderForUser } from '../services/email/index.js';
import { resolveTemplate, plainTextToHtml, wrapEmailHtml } from '../services/templateEngine.js';
import { getAttachments } from '../services/attachmentHelper.js';
import type { EmailTemplate, Prospect, Company, EmailSend, SenderProfile } from '../types/index.js';

interface UserEmailConfig {
  username: string;
  senderProfile: SenderProfile;
  gmailUser: string | null;
  gmailRefreshToken: string | null;
  fromName: string | null;
  replyToEmail: string | null;
}

async function loadUserEmailConfig(userId: string): Promise<UserEmailConfig | null> {
  const r = await pool.query(
    `SELECT username, first_name, last_name, email, current_company, job_title, phone, website,
            gmail_user, gmail_refresh_token, from_name, reply_to_email
     FROM users WHERE id = $1`,
    [userId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    username: row.username as string,
    senderProfile: {
      first_name: row.first_name as string | null,
      last_name: row.last_name as string | null,
      email: row.email as string | null,
      current_company: row.current_company as string | null,
      job_title: row.job_title as string | null,
      phone: row.phone as string | null,
      website: row.website as string | null,
    },
    gmailUser: row.gmail_user as string | null,
    gmailRefreshToken: row.gmail_refresh_token as string | null,
    fromName: row.from_name as string | null,
    replyToEmail: row.reply_to_email as string | null,
  };
}

function resolveEmailProvider(config: UserEmailConfig) {
  if (!config.gmailUser || !config.gmailRefreshToken) {
    throw new Error('Gmail not connected. Go to Settings → Profile and connect your Gmail account.');
  }
  const fullName = [config.senderProfile.first_name, config.senderProfile.last_name].filter(Boolean).join(' ');
  return getEmailProviderForUser({
    gmailUser: config.gmailUser,
    refreshToken: config.gmailRefreshToken,
    fromName: config.fromName || fullName || config.username || 'CRM',
  });
}

const router: ReturnType<typeof Router> = Router();

function pixelUrl(sendId: string): string {
  const base = (process.env['TRACKING_BASE_URL'] ?? 'http://localhost:3001').replace(/\/$/, '');
  return `${base}/api/track/open/${sendId}.gif`;
}

router.get('/history', async (req, res, next) => {
  try {
    const { limit = '50', offset = '0', status, search, company_id, template_id } = req.query as Record<string, string>;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`es.status = $${params.length}`);
    }
    if (company_id) {
      params.push(company_id);
      conditions.push(`es.company_id = $${params.length}`);
    }
    if (template_id) {
      params.push(template_id);
      conditions.push(`es.template_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(p.first_name ILIKE $${params.length} OR p.last_name ILIKE $${params.length} OR p.email ILIKE $${params.length} OR es.subject ILIKE $${params.length})`);
    }

    const { sql, value } = ownerFilter(req.user!, 'es', params.length + 1);
    if (sql) { conditions.push(sql); if (value) params.push(value); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataParams = [...params, parseInt(limit, 10), parseInt(offset, 10)];
    const result = await pool.query<EmailSend>(
      `SELECT es.*,
              json_build_object('first_name', p.first_name, 'last_name', p.last_name, 'email', p.email, 'job_title', p.job_title) AS prospect,
              json_build_object('name', c.name) AS company,
              json_build_object('name', t.name) AS template
       FROM email_sends es
       LEFT JOIN prospects p ON p.id = es.prospect_id
       LEFT JOIN companies c ON c.id = es.company_id
       LEFT JOIN email_templates t ON t.id = es.template_id
       ${where}
       ORDER BY es.created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    const countRes = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM email_sends es
       LEFT JOIN prospects p ON p.id = es.prospect_id
       ${where}`,
      params
    );
    res.json({
      data: result.rows,
      total: parseInt(countRes.rows[0]?.count ?? '0', 10),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/retry/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const { sql, value } = ownerFilter(req.user!, 'es', 2);
    const ownerWhere = sql ? `AND ${sql}` : '';
    const params: unknown[] = [id];
    if (value) params.push(value);

    const sendRes = await pool.query<EmailSend>(
      `SELECT es.*, p.email AS prospect_email
       FROM email_sends es
       LEFT JOIN prospects p ON p.id = es.prospect_id
       WHERE es.id = $1 ${ownerWhere}`,
      params
    );
    const send = sendRes.rows[0] as (EmailSend & { prospect_email: string | null }) | undefined;

    if (!send) { res.status(404).json({ error: 'Email send record not found' }); return; }
    if (send.status !== 'failed') { res.status(400).json({ error: 'Only failed emails can be retried' }); return; }
    if (!send.prospect_email) { res.status(400).json({ error: 'Prospect email not found' }); return; }
    if (!send.subject || !send.body) { res.status(400).json({ error: 'Missing subject or body for retry' }); return; }

    await pool.query(
      `UPDATE email_sends SET status = 'pending', error_message = NULL WHERE id = $1`,
      [id]
    );

    const userConfig = await loadUserEmailConfig(req.user!.id);
    if (!userConfig) { res.status(500).json({ error: 'User not found' }); return; }

    let provider;
    try {
      provider = resolveEmailProvider(userConfig);
    } catch (cfgErr) {
      const msg = cfgErr instanceof Error ? cfgErr.message : 'Email not configured';
      await pool.query(`UPDATE email_sends SET status = 'failed', error_message = $1 WHERE id = $2`, [msg, id]);
      res.status(400).json({ error: msg });
      return;
    }

    const html = wrapEmailHtml(plainTextToHtml(send.body), pixelUrl(id));

    try {
      const result = await provider.send({
        to: send.prospect_email,
        subject: send.subject,
        html,
      });
      await pool.query(
        `UPDATE email_sends SET status = 'sent', resend_id = $1, sent_at = NOW() WHERE id = $2`,
        [result.id, id]
      );
      res.json({ data: { id, status: 'sent' } });
    } catch (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : 'Unknown error';
      await pool.query(
        `UPDATE email_sends SET status = 'failed', error_message = $1 WHERE id = $2`,
        [msg, id]
      );
      res.status(502).json({ error: `Retry failed: ${msg}` });
    }
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

    const { sql: tSql, value: tVal } = ownerFilter(req.user!, 'email_templates', 2);
    const { sql: pSql, value: pVal } = ownerFilter(req.user!, 'p', 2);

    const [templateRes, prospectRes] = await Promise.all([
      pool.query<EmailTemplate>(
        `SELECT * FROM email_templates WHERE id = $1 ${tSql ? `AND ${tSql}` : ''}`,
        tVal ? [templateId, tVal] : [templateId]
      ),
      pool.query<Prospect>(
        `SELECT p.*, row_to_json(c) AS company
         FROM prospects p LEFT JOIN companies c ON c.id = p.company_id
         WHERE p.id = $1 ${pSql ? `AND ${pSql}` : ''}`,
        pVal ? [prospectId, pVal] : [prospectId]
      ),
    ]);

    if (!templateRes.rows[0]) { res.status(404).json({ error: 'Template not found' }); return; }
    if (!prospectRes.rows[0]) { res.status(404).json({ error: 'Prospect not found' }); return; }

    const template = templateRes.rows[0];
    const prospect = prospectRes.rows[0];
    const company = (prospect as unknown as { company: Company | null }).company;
    const userConfig = await loadUserEmailConfig(req.user!.id);
    const sender = userConfig?.senderProfile ?? null;

    const context = { prospect, company, custom: customValues, sender };
    const resolvedSubject = resolveTemplate(template.subject, template.variables, context);
    const resolvedBody = resolveTemplate(template.body, template.variables, context);

    res.json({
      data: {
        subject: resolvedSubject,
        body: resolvedBody,
        html: wrapEmailHtml(plainTextToHtml(resolvedBody)),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/send', async (req, res, next) => {
  try {
    const { templateId, prospectId, customValues = {}, documentIds = [] } = req.body as {
      templateId: string;
      prospectId: string;
      customValues?: Record<string, string>;
      documentIds?: string[];
    };

    if (!templateId || !prospectId) {
      res.status(400).json({ error: 'templateId and prospectId are required' });
      return;
    }

    const { sql: tSql, value: tVal } = ownerFilter(req.user!, 'email_templates', 2);
    const { sql: pSql, value: pVal } = ownerFilter(req.user!, 'p', 2);

    const [templateRes, prospectRes] = await Promise.all([
      pool.query<EmailTemplate>(
        `SELECT * FROM email_templates WHERE id = $1 ${tSql ? `AND ${tSql}` : ''}`,
        tVal ? [templateId, tVal] : [templateId]
      ),
      pool.query<Prospect>(
        `SELECT p.*, row_to_json(c) AS company
         FROM prospects p LEFT JOIN companies c ON c.id = p.company_id
         WHERE p.id = $1 ${pSql ? `AND ${pSql}` : ''}`,
        pVal ? [prospectId, pVal] : [prospectId]
      ),
    ]);

    if (!templateRes.rows[0]) { res.status(404).json({ error: 'Template not found' }); return; }
    if (!prospectRes.rows[0]) { res.status(404).json({ error: 'Prospect not found' }); return; }

    const template = templateRes.rows[0];
    const prospect = prospectRes.rows[0];
    const company = (prospect as unknown as { company: Company | null }).company;
    const userConfig = await loadUserEmailConfig(req.user!.id);
    if (!userConfig) { res.status(500).json({ error: 'User not found' }); return; }

    let provider;
    try {
      provider = resolveEmailProvider(userConfig);
    } catch (cfgErr) {
      res.status(400).json({ error: cfgErr instanceof Error ? cfgErr.message : 'Email not configured' });
      return;
    }

    const sender = userConfig.senderProfile;
    const context = { prospect, company, custom: customValues, sender };
    const resolvedSubject = resolveTemplate(template.subject, template.variables, context);
    const resolvedBody = resolveTemplate(template.body, template.variables, context);

    const allDocumentIds = [...new Set([...(template.document_ids ?? []), ...documentIds])];
    const attachments = await getAttachments(allDocumentIds);

    const sendRecord = await pool.query<EmailSend>(
      `INSERT INTO email_sends (template_id, prospect_id, company_id, subject, body, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING *`,
      [template.id, prospect.id, prospect.company_id, resolvedSubject, resolvedBody, req.user!.id]
    );
    const sendId = sendRecord.rows[0]!.id;
    const html = wrapEmailHtml(plainTextToHtml(resolvedBody), pixelUrl(sendId));

    try {
      const result = await provider.send({
        to: prospect.email,
        subject: resolvedSubject,
        html,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

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
    const { templateId, companyId, prospectIds, customValues = {}, documentIds = [] } = req.body as {
      templateId: string;
      companyId: string;
      prospectIds?: string[];
      customValues?: Record<string, string>;
      documentIds?: string[];
    };

    if (!templateId || !companyId) {
      res.status(400).json({ error: 'templateId and companyId are required' });
      return;
    }

    const { sql: tSql, value: tVal } = ownerFilter(req.user!, 'email_templates', 2);
    const { sql: cSql, value: cVal } = ownerFilter(req.user!, 'companies', 2);

    const [templateRes, companyRes] = await Promise.all([
      pool.query<EmailTemplate>(
        `SELECT * FROM email_templates WHERE id = $1 ${tSql ? `AND ${tSql}` : ''}`,
        tVal ? [templateId, tVal] : [templateId]
      ),
      pool.query<Company>(
        `SELECT * FROM companies WHERE id = $1 ${cSql ? `AND ${cSql}` : ''}`,
        cVal ? [companyId, cVal] : [companyId]
      ),
    ]);

    if (!templateRes.rows[0]) { res.status(404).json({ error: 'Template not found' }); return; }
    if (!companyRes.rows[0]) { res.status(404).json({ error: 'Company not found' }); return; }

    const template = templateRes.rows[0];
    const company = companyRes.rows[0];

    const { sql: pSql, value: pVal } = ownerFilter(req.user!, 'prospects', prospectIds?.length ? 3 : 2);

    let prospectsRes;
    if (prospectIds && prospectIds.length > 0) {
      prospectsRes = await pool.query<Prospect>(
        `SELECT * FROM prospects WHERE id = ANY($1) AND company_id = $2 ${pSql ? `AND ${pSql}` : ''}`,
        pVal ? [prospectIds, companyId, pVal] : [prospectIds, companyId]
      );
    } else {
      prospectsRes = await pool.query<Prospect>(
        `SELECT * FROM prospects WHERE company_id = $1 ${pSql ? `AND ${pSql}` : ''}`,
        pVal ? [companyId, pVal] : [companyId]
      );
    }

    const prospects = prospectsRes.rows;
    if (prospects.length === 0) {
      res.status(400).json({ error: 'No prospects found for this company' });
      return;
    }

    const userId = req.user!.id;
    const userConfig = await loadUserEmailConfig(userId);
    if (!userConfig) { res.status(500).json({ error: 'User not found' }); return; }

    let provider;
    try {
      provider = resolveEmailProvider(userConfig);
    } catch (cfgErr) {
      res.status(400).json({ error: cfgErr instanceof Error ? cfgErr.message : 'Email not configured' });
      return;
    }

    const allDocumentIds = [...new Set([...(template.document_ids ?? []), ...documentIds])];
    const attachments = await getAttachments(allDocumentIds);
    const sender = userConfig.senderProfile;

    const results = await Promise.allSettled(
      prospects.map(async (prospect) => {
        const context = { prospect, company, custom: customValues, sender };
        const subject = resolveTemplate(template.subject, template.variables, context);
        const body = resolveTemplate(template.body, template.variables, context);

        const sendRecord = await pool.query<EmailSend>(
          `INSERT INTO email_sends (template_id, prospect_id, company_id, subject, body, status, created_by)
           VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING id`,
          [template.id, prospect.id, company.id, subject, body, userId]
        );
        const sendId = sendRecord.rows[0]!.id;
        const html = wrapEmailHtml(plainTextToHtml(body), pixelUrl(sendId));

        try {
          const result = await provider.send({
            to: prospect.email,
            subject,
            html,
            attachments: attachments.length > 0 ? attachments : undefined,
          });
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

// Send to an explicit list of prospect IDs — no company constraint.
// Each prospect is resolved with its own company for template variables.
router.post('/send-batch', async (req, res, next) => {
  try {
    const { templateId, prospectIds, customValues = {}, documentIds = [] } = req.body as {
      templateId: string;
      prospectIds: string[];
      customValues?: Record<string, string>;
      documentIds?: string[];
    };

    if (!templateId || !Array.isArray(prospectIds) || prospectIds.length === 0) {
      res.status(400).json({ error: 'templateId and at least one prospectId are required' });
      return;
    }

    const { sql: tSql, value: tVal } = ownerFilter(req.user!, 'email_templates', 2);
    const { sql: pSql, value: pVal } = ownerFilter(req.user!, 'p', 2);

    const [templateRes, prospectsRes] = await Promise.all([
      pool.query<EmailTemplate>(
        `SELECT * FROM email_templates WHERE id = $1 ${tSql ? `AND ${tSql}` : ''}`,
        tVal ? [templateId, tVal] : [templateId]
      ),
      pool.query<Prospect & { company: Company | null }>(
        `SELECT p.*, row_to_json(c) AS company
         FROM prospects p LEFT JOIN companies c ON c.id = p.company_id
         WHERE p.id = ANY($1) ${pSql ? `AND ${pSql}` : ''}`,
        pVal ? [prospectIds, pVal] : [prospectIds]
      ),
    ]);

    if (!templateRes.rows[0]) { res.status(404).json({ error: 'Template not found' }); return; }

    const template = templateRes.rows[0];
    const prospects = prospectsRes.rows;
    if (prospects.length === 0) { res.status(400).json({ error: 'No prospects found' }); return; }

    const userId = req.user!.id;
    const userConfig = await loadUserEmailConfig(userId);
    if (!userConfig) { res.status(500).json({ error: 'User not found' }); return; }

    let provider;
    try {
      provider = resolveEmailProvider(userConfig);
    } catch (cfgErr) {
      res.status(400).json({ error: cfgErr instanceof Error ? cfgErr.message : 'Email not configured' });
      return;
    }

    const allDocumentIds = [...new Set([...(template.document_ids ?? []), ...documentIds])];
    const attachments = await getAttachments(allDocumentIds);
    const sender = userConfig.senderProfile;

    const results = await Promise.allSettled(
      prospects.map(async (prospect) => {
        const company = prospect.company;
        const context = { prospect, company, custom: customValues, sender };
        const subject = resolveTemplate(template.subject, template.variables, context);
        const body = resolveTemplate(template.body, template.variables, context);

        const sendRecord = await pool.query<EmailSend>(
          `INSERT INTO email_sends (template_id, prospect_id, company_id, subject, body, status, created_by)
           VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING id`,
          [template.id, prospect.id, prospect.company_id ?? null, subject, body, userId]
        );
        const sendId = sendRecord.rows[0]!.id;
        const html = wrapEmailHtml(plainTextToHtml(body), pixelUrl(sendId));

        try {
          const result = await provider.send({
            to: prospect.email,
            subject,
            html,
            attachments: attachments.length > 0 ? attachments : undefined,
          });
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
