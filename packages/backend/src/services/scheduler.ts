import cron from 'node-cron';
import { pool } from '../db/index.js';
import { getEmailProvider } from './email/index.js';
import { resolveTemplate, plainTextToHtml } from './templateEngine.js';
import { getResumeAttachment } from './resumeHelper.js';
import type { EmailTemplate, Prospect, Company } from '../types/index.js';

interface ScheduleRow {
  id: string;
  template_id: string | null;
  company_id: string | null;
  prospect_ids: string[];
  custom_values: Record<string, string>;
  scheduled_for: Date;
  attach_resume: boolean;
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

  const attachment = schedule.attach_resume ? await getResumeAttachment() : null;
  const provider = getEmailProvider();
  let sentCount = 0;
  let failedCount = 0;

  await Promise.allSettled(
    prospects.map(async (prospect) => {
      const ctx = { prospect, company, custom: schedule.custom_values };
      const subject = resolveTemplate(template.subject, template.variables, ctx);
      const body = resolveTemplate(template.body, template.variables, ctx);
      const html = plainTextToHtml(body);

      const sendRecord = await pool.query<{ id: string }>(
        `INSERT INTO email_sends (template_id, prospect_id, company_id, subject, body, status)
         VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
        [template.id, prospect.id, company?.id ?? null, subject, body]
      );
      const sendId = sendRecord.rows[0]!.id;

      try {
        const result = await provider.send({
          to: prospect.email,
          subject,
          html,
          attachments: attachment ? [attachment] : undefined,
        });
        await pool.query(
          `UPDATE email_sends SET status = 'sent', resend_id = $1, sent_at = NOW() WHERE id = $2`,
          [result.id, sendId]
        );
        sentCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        await pool.query(
          `UPDATE email_sends SET status = 'failed', error_message = $1 WHERE id = $2`,
          [msg, sendId]
        );
        failedCount++;
      }
    })
  );

  await pool.query(
    `UPDATE email_schedules
     SET status = 'sent', sent_at = NOW(), sent_count = $1, failed_count = $2, total_prospects = $3
     WHERE id = $4`,
    [sentCount, failedCount, prospects.length, schedule.id]
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
  console.log('Email scheduler started (polling every minute)');
}
