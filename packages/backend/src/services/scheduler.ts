import cron from 'node-cron';
import { pool } from '../db/index.js';
import { getEmailProviderForUser } from './email/index.js';
import { resolveTemplate, plainTextToHtml, wrapEmailHtml } from './templateEngine.js';
import { syncDriveDocuments } from './driveSync.js';

function pixelUrl(sendId: string): string {
  const base = (process.env['TRACKING_BASE_URL'] ?? 'http://localhost:3001').replace(/\/$/, '');
  return `${base}/api/track/open/${sendId}.gif`;
}
import { getAttachments } from './attachmentHelper.js';
import { maybeCreateApplicationFromEmail } from './autoTrackApplication.js';
import type { EmailTemplate, Prospect, Company, SenderProfile } from '../types/index.js';

interface ScheduleRow {
  id: string;
  template_id: string | null;
  company_id: string | null;
  prospect_ids: string[];
  custom_values: Record<string, string>;
  scheduled_for: Date;
  document_ids: string[];
  created_by: string | null;
}

async function processSchedule(schedule: ScheduleRow): Promise<void> {
  await pool.query(
    `UPDATE email_schedules SET status = 'sending' WHERE id = $1`,
    [schedule.id]
  );

  const [templateRes, companyRes] = await Promise.all([
    schedule.template_id
      ? pool.query<EmailTemplate>('SELECT * FROM email_templates WHERE id = $1', [schedule.template_id])
      : Promise.resolve({ rows: [] as EmailTemplate[] }),
    schedule.company_id
      ? pool.query<Company>('SELECT * FROM companies WHERE id = $1', [schedule.company_id])
      : Promise.resolve({ rows: [] as Company[] }),
  ]);

  const template = templateRes.rows[0];
  const company = companyRes.rows[0] ?? null;

  if (!template) {
    await pool.query(
      `UPDATE email_schedules SET status = 'failed', error_message = $1, sent_at = NOW() WHERE id = $2`,
      ['Template not found', schedule.id]
    );
    return;
  }

  let prospectsRes;
  if (schedule.prospect_ids.length > 0) {
    prospectsRes = await pool.query<Prospect>(
      `SELECT * FROM prospects WHERE id = ANY($1)`,
      [schedule.prospect_ids]
    );
  } else if (schedule.company_id) {
    prospectsRes = await pool.query<Prospect>(
      `SELECT * FROM prospects WHERE company_id = $1`,
      [schedule.company_id]
    );
  } else {
    prospectsRes = { rows: [] as Prospect[] };
  }

  const prospects = prospectsRes.rows;
  if (prospects.length === 0) {
    await pool.query(
      `UPDATE email_schedules SET status = 'failed', error_message = $1, sent_at = NOW() WHERE id = $2`,
      ['No prospects found', schedule.id]
    );
    return;
  }

  let sender: SenderProfile | null = null;

  const userRes = schedule.created_by
    ? await pool.query(
        `SELECT username, first_name, last_name, email, current_company, job_title, phone, website,
                gmail_user, gmail_refresh_token, gmail_app_password, from_name
         FROM users WHERE id = $1`,
        [schedule.created_by]
      )
    : { rows: [] };

  const userRow = userRes.rows[0];

  const hasOAuth = userRow?.gmail_user && userRow?.gmail_refresh_token;
  const hasAppPassword = userRow?.gmail_user && userRow?.gmail_app_password;

  if (!userRow || (!hasOAuth && !hasAppPassword)) {
    await pool.query(
      `UPDATE email_schedules SET status = 'failed', error_message = $1, sent_at = NOW() WHERE id = $2`,
      ['Gmail not connected. Go to Settings → Gmail to connect your account.', schedule.id]
    );
    return;
  }

  sender = {
    first_name: userRow.first_name as string | null,
    last_name: userRow.last_name as string | null,
    email: userRow.email as string | null,
    current_company: userRow.current_company as string | null,
    job_title: userRow.job_title as string | null,
    phone: userRow.phone as string | null,
    website: userRow.website as string | null,
  };

  const fullName = [userRow.first_name, userRow.last_name].filter(Boolean).join(' ');
  const fromName = (userRow.from_name as string | null) || fullName || (userRow.username as string) || 'CRM';

  const provider = hasOAuth
    ? getEmailProviderForUser({
        method: 'oauth',
        creds: { gmailUser: userRow.gmail_user as string, refreshToken: userRow.gmail_refresh_token as string, fromName },
      })
    : getEmailProviderForUser({
        method: 'app_password',
        creds: { gmailUser: userRow.gmail_user as string, appPassword: userRow.gmail_app_password as string, fromName },
      });

  const attachments = await getAttachments(schedule.document_ids);
  let sentCount = 0;
  let failedCount = 0;
  const errorMessages: string[] = [];

  const existingSendsRes = await pool.query<{ id: string; prospect_id: string; status: string }>(
    `SELECT id, prospect_id, status FROM email_sends WHERE schedule_id = $1`,
    [schedule.id]
  );
  const existingSendByProspect = new Map<string, { id: string; status: string }>();
  for (const s of existingSendsRes.rows) {
    existingSendByProspect.set(s.prospect_id, s);
  }

  await Promise.allSettled(
    prospects.map(async (prospect) => {
      const existing = existingSendByProspect.get(prospect.id);
      if (existing && existing.status === 'sent') {
        sentCount++;
        return; // Skip already sent
      }

      const ctx = { prospect, company, custom: schedule.custom_values, sender };
      const subject = resolveTemplate(template.subject, template.variables, ctx);
      const body = resolveTemplate(template.body, template.variables, ctx);

      let sendId: string;
      if (existing) {
        sendId = existing.id;
        await pool.query(
          `UPDATE email_sends SET status = 'pending', subject = $1, body = $2, error_message = NULL WHERE id = $3`,
          [subject, body, sendId]
        );
      } else {
        const jobUrl = schedule.custom_values['jobUrl'] ?? schedule.custom_values['job_url'] ?? null;
        const sendRecord = await pool.query<{ id: string }>(
          `INSERT INTO email_sends (template_id, prospect_id, company_id, subject, body, status, created_by, schedule_id, job_url)
           VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8) RETURNING id`,
          [template.id, prospect.id, company?.id ?? null, subject, body, schedule.created_by, schedule.id, jobUrl]
        );
        sendId = sendRecord.rows[0]!.id;
      }
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

        // Auto-track job application if jobUrl is present
        if (schedule.created_by) {
          maybeCreateApplicationFromEmail(schedule.created_by, schedule.custom_values).catch((err) =>
            console.error('Auto-track application error (scheduler):', err)
          );
        }

        sentCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        await pool.query(
          `UPDATE email_sends SET status = 'failed', error_message = $1 WHERE id = $2`,
          [msg, sendId]
        );
        errorMessages.push(msg);
        failedCount++;
      }
    })
  );

  const finalStatus = sentCount === 0 ? 'failed' : 'sent';
  const uniqueErrors = [...new Set(errorMessages)];
  const scheduleError = finalStatus === 'failed' && uniqueErrors.length > 0
    ? uniqueErrors[0]!
    : null;

  await pool.query(
    `UPDATE email_schedules
     SET status = $1, sent_at = NOW(), sent_count = $2, failed_count = $3, total_prospects = $4, error_message = $5
     WHERE id = $6`,
    [finalStatus, sentCount, failedCount, prospects.length, scheduleError, schedule.id]
  );
}

export function startScheduler(): void {
  cron.schedule('* * * * *', async () => {
    try {
      const due = await pool.query<ScheduleRow>(
        `SELECT * FROM email_schedules
         WHERE status = 'pending' AND scheduled_for <= NOW()
         ORDER BY scheduled_for ASC`
      );
      for (const schedule of due.rows) {
        processSchedule(schedule).catch((err: unknown) => {
          console.error(`Scheduler failed for schedule ${schedule.id}:`, err);
          pool.query(
            `UPDATE email_schedules SET status = 'failed', error_message = $1 WHERE id = $2`,
            [String(err), schedule.id]
          ).catch(() => undefined);
        });
      }
    } catch (err) {
      console.error('Scheduler poll error:', err);
    }
  });
  // Sync Drive-linked documents every 2 hours
  cron.schedule('0 */2 * * *', () => {
    syncDriveDocuments().catch((err: unknown) => {
      console.error('Drive sync error:', err);
    });
  });
  // Also sync once at startup (after a short delay to let the DB settle)
  setTimeout(() => {
    syncDriveDocuments().catch((err: unknown) => {
      console.error('Drive sync (startup) error:', err);
    });
  }, 10_000);

  console.log('Email scheduler started (polling every minute)');
  console.log('Drive sync scheduled every 2 hours');
}
