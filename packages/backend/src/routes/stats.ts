import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { syncOutreachForDashboard } from '../services/jobs.js';
import { systemLogger } from '../services/systemLogger.js';
import type { PendingProspect } from '../types/index.js';

const router: ReturnType<typeof Router> = Router();

router.get('/', async (req, res, next) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const userId = req.user!.id;
    const p = isAdmin ? [] : [userId]; // shared param array for simple $1 queries
    const w = isAdmin ? '' : ' WHERE created_by = $1';
    const a = isAdmin ? '' : ' AND created_by = $1'; // appended AND
    const appW = isAdmin ? '' : ' WHERE user_id = $1';
    const sentByOwner = isAdmin ? '' : 'AND es.created_by = $1';

    if (!isAdmin) {
      try {
        await syncOutreachForDashboard(userId);
      } catch (syncErr) {
        systemLogger.error('syncOutreachForDashboard failed during dashboard stats generation', syncErr, {
          userId,
          source: 'stats-route',
          method: req.method,
          path: req.originalUrl || req.url,
        });
      }
    }

    const [
      countsRes,
      emailStatsRes,
      categoryRes,
      topCompaniesRes,
      recentSendsRes,
      upcomingRes,
      dailyActivityRes,
      appStatsRes,
      recentAppsRes,
      readyToApplyRes,
      referralSentRes,
      notAppliedAppsRes,
      activeInterviewsRes,
      failedSendsRes,
      pendingProspectsRes,
      unconfirmedAppsRes,
    ] = await Promise.all([
      pool.query<{ companies: string; prospects: string; templates: string; applications: string }>(
        isAdmin
          ? `SELECT
               (SELECT COUNT(*) FROM companies) AS companies,
               (SELECT COUNT(*) FROM prospects) AS prospects,
               (SELECT COUNT(*) FROM email_templates) AS templates,
               (SELECT COUNT(*) FROM job_applications) AS applications`
          : `SELECT
               (SELECT COUNT(*) FROM companies        WHERE created_by = $1) AS companies,
               (SELECT COUNT(*) FROM prospects        WHERE created_by = $1) AS prospects,
               (SELECT COUNT(*) FROM email_templates  WHERE created_by = $1) AS templates,
               (SELECT COUNT(*) FROM job_applications WHERE user_id = $1) AS applications`,
        p
      ),
      pool.query<{ status: string; count: string; opened: string }>(
        `SELECT status, COUNT(*) AS count, COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opened
         FROM email_sends ${w} GROUP BY status`,
        p
      ),
      pool.query<{ category: string | null; count: string }>(
        `SELECT role_category AS category, COUNT(*) AS count
         FROM prospects ${w} GROUP BY role_category ORDER BY count DESC`,
        p
      ),
      pool.query<{ name: string; count: string }>(
        isAdmin
          ? `SELECT c.name, COUNT(p.id) AS count
             FROM companies c LEFT JOIN prospects p ON p.company_id = c.id
             GROUP BY c.id, c.name ORDER BY count DESC LIMIT 6`
          : `SELECT c.name, COUNT(p.id) AS count
             FROM companies c LEFT JOIN prospects p ON p.company_id = c.id
             WHERE c.created_by = $1
             GROUP BY c.id, c.name ORDER BY count DESC LIMIT 6`,
        p
      ),
      pool.query(
        `SELECT es.*,
                json_build_object('first_name', p.first_name, 'last_name', p.last_name, 'email', p.email, 'job_title', p.job_title) AS prospect,
                json_build_object('name', c.name) AS company,
                json_build_object('name', t.name, 'version', t.version, 'deleted_at', t.deleted_at) AS template
         FROM email_sends es
         LEFT JOIN prospects p ON p.id = es.prospect_id
         LEFT JOIN companies c ON c.id = es.company_id
         LEFT JOIN email_templates t ON t.id = es.template_id
         WHERE 1=1 ${isAdmin ? '' : 'AND es.created_by = $1'}
         ORDER BY es.created_at DESC LIMIT 8`,
        p
      ),
      pool.query(
        `SELECT es.*,
                json_build_object('name', c.name) AS company,
                json_build_object('name', t.name, 'version', t.version, 'deleted_at', t.deleted_at) AS template
         FROM email_schedules es
         LEFT JOIN companies c ON c.id = es.company_id
         LEFT JOIN email_templates t ON t.id = es.template_id
         WHERE es.status = 'pending' AND es.scheduled_for > NOW()
         ${isAdmin ? '' : 'AND es.created_by = $1'}
         ORDER BY es.scheduled_for ASC LIMIT 4`,
        p
      ),
      pool.query<{ day: string; sent: string; failed: string }>(
        `SELECT DATE(created_at) AS day,
                COUNT(*) FILTER (WHERE status = 'sent')   AS sent,
                COUNT(*) FILTER (WHERE status = 'failed') AS failed
         FROM email_sends
         WHERE created_at >= NOW() - INTERVAL '14 days' ${a}
         GROUP BY DATE(created_at) ORDER BY day ASC`,
        p
      ),
      pool.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*) AS count
         FROM job_applications ${appW}
         GROUP BY status`,
        p
      ),
      pool.query(
        `SELECT * FROM job_applications ${appW}
         ORDER BY applied_at DESC LIMIT 5`,
        p
      ),
      pool.query(
        `SELECT ja.*,
                COALESCE(em.email_count, 0)::int AS email_count,
                COALESCE(em.first_sent_at, ja.updated_at) AS referral_requested_at
         FROM job_applications ja
         LEFT JOIN (
           SELECT es.job_id,
                  COUNT(es.id) FILTER (WHERE es.status = 'sent') AS email_count,
                  MIN(COALESCE(es.sent_at, es.created_at)) FILTER (WHERE es.status = 'sent') AS first_sent_at
           FROM email_sends es
           WHERE es.job_id IS NOT NULL
           ${sentByOwner}
           GROUP BY es.job_id
         ) em ON em.job_id = ja.job_id
         WHERE ja.status = 'referral_requested'
           AND COALESCE(em.first_sent_at, ja.updated_at) <= NOW() - INTERVAL '2 days'
           ${isAdmin ? '' : 'AND ja.user_id = $1'}
         ORDER BY referral_requested_at ASC
         LIMIT 6`,
        p
      ),
      pool.query(
        `SELECT ja.*,
                COALESCE(em.email_count, 0)::int AS email_count,
                COALESCE(em.first_sent_at, ja.updated_at) AS referral_requested_at
         FROM job_applications ja
         LEFT JOIN (
           SELECT es.job_id,
                  COUNT(es.id) FILTER (WHERE es.status = 'sent') AS email_count,
                  MIN(COALESCE(es.sent_at, es.created_at)) FILTER (WHERE es.status = 'sent') AS first_sent_at
           FROM email_sends es
           WHERE es.job_id IS NOT NULL
           ${sentByOwner}
           GROUP BY es.job_id
         ) em ON em.job_id = ja.job_id
         WHERE ja.status = 'referral_requested'
           AND COALESCE(em.first_sent_at, ja.updated_at) > NOW() - INTERVAL '2 days'
           ${isAdmin ? '' : 'AND ja.user_id = $1'}
         ORDER BY email_count DESC, referral_requested_at DESC
         LIMIT 6`,
        p
      ),
      pool.query(
        `SELECT ja.*,
                COALESCE(em.email_count, 0)::int AS email_count
         FROM job_applications ja
         LEFT JOIN (
           SELECT es.job_id,
                  COUNT(es.id) FILTER (WHERE es.status = 'sent') AS email_count
           FROM email_sends es
           WHERE es.job_id IS NOT NULL
           ${sentByOwner}
           GROUP BY es.job_id
         ) em ON em.job_id = ja.job_id
         WHERE ja.status IN ('not_applied', 'open')
           ${isAdmin ? '' : 'AND ja.user_id = $1'}
         ORDER BY ja.created_at DESC
         LIMIT 6`,
        p
      ),
      pool.query(
        `SELECT ja.*,
                COALESCE(em.email_count, 0)::int AS email_count
         FROM job_applications ja
         LEFT JOIN (
           SELECT es.job_id,
                  COUNT(es.id) FILTER (WHERE es.status = 'sent') AS email_count
           FROM email_sends es
           WHERE es.job_id IS NOT NULL
           ${sentByOwner}
           GROUP BY es.job_id
         ) em ON em.job_id = ja.job_id
         WHERE ja.status IN ('screening', 'interview', 'offer')
           ${isAdmin ? '' : 'AND ja.user_id = $1'}
         ORDER BY ja.updated_at DESC
         LIMIT 6`,
        p
      ),
      pool.query(
        `SELECT es.*,
                json_build_object('first_name', p.first_name, 'last_name', p.last_name, 'email', p.email, 'job_title', p.job_title) AS prospect,
                json_build_object('name', c.name) AS company,
                json_build_object('name', t.name, 'version', t.version, 'deleted_at', t.deleted_at) AS template
         FROM email_sends es
         LEFT JOIN prospects p ON p.id = es.prospect_id
         LEFT JOIN companies c ON c.id = es.company_id
         LEFT JOIN email_templates t ON t.id = es.template_id
         WHERE es.status = 'failed'
           AND es.dismissed_at IS NULL
         ${isAdmin ? '' : 'AND es.created_by = $1'}
         ORDER BY es.created_at DESC
         LIMIT 3`,
        p
      ),
      pool.query<PendingProspect>(
        `SELECT * FROM pending_prospects
         WHERE dismissed_at IS NULL
         ${isAdmin ? '' : 'AND user_id = $1'}
         ORDER BY created_at DESC
         LIMIT 10`,
        p
      ),
      pool.query(
        `SELECT ja.*,
                COALESCE(em.email_count, 0)::int AS email_count
         FROM job_applications ja
         LEFT JOIN (
           SELECT es.job_id,
                  COUNT(es.id) FILTER (WHERE es.status = 'sent') AS email_count
           FROM email_sends es
           WHERE es.job_id IS NOT NULL
           ${sentByOwner}
           GROUP BY es.job_id
         ) em ON em.job_id = ja.job_id
         WHERE ja.status = 'unconfirmed'
           ${isAdmin ? '' : 'AND ja.user_id = $1'}
         ORDER BY ja.created_at DESC
         LIMIT 10`,
        p
      ),
    ]);

    const counts = countsRes.rows[0] ?? { companies: '0', prospects: '0', templates: '0', applications: '0' };

    const emailStats = { total: 0, sent: 0, failed: 0, pending: 0, opened: 0 };
    for (const row of emailStatsRes.rows) {
      const n = parseInt(row.count, 10);
      emailStats.total += n;
      emailStats.opened += parseInt(row.opened, 10);
      if (row.status === 'sent') emailStats.sent = n;
      else if (row.status === 'failed') emailStats.failed = n;
      else if (row.status === 'pending') emailStats.pending = n;
    }
    const openRate =
      emailStats.sent > 0 ? Math.round((emailStats.opened / emailStats.sent) * 1000) / 10 : 0;

    res.set('Cache-Control', 'no-store');
    res.json({
      companies: parseInt(counts.companies, 10),
      prospects: parseInt(counts.prospects, 10),
      templates: parseInt(counts.templates, 10),
      applications: parseInt(counts.applications ?? '0', 10),
      emails: { ...emailStats, openRate },
      applicationsByStatus: appStatsRes.rows.map((r) => ({
        status: r.status,
        count: parseInt(r.count, 10),
      })),
      recentApplications: recentAppsRes.rows,
      readyToApplyApplications: readyToApplyRes.rows,
      readyToApplyCount: readyToApplyRes.rows.length,
      referralSentApplications: referralSentRes.rows,
      referralSentCount: referralSentRes.rows.length,
      notAppliedApplications: notAppliedAppsRes.rows,
      notAppliedCount: notAppliedAppsRes.rows.length,
      activeInterviewApplications: activeInterviewsRes.rows,
      activeInterviewCount: activeInterviewsRes.rows.length,
      unconfirmedApplications: unconfirmedAppsRes.rows,
      unconfirmedCount: unconfirmedAppsRes.rows.length,
      failedSends: failedSendsRes.rows,
      pendingProspects: pendingProspectsRes.rows,
      pendingProspectCount: pendingProspectsRes.rows.length,
      prospectsByCategory: categoryRes.rows.map((r) => ({
        category: r.category ?? 'unknown',
        count: parseInt(r.count, 10),
      })),
      topCompanies: topCompaniesRes.rows.map((r) => ({
        name: r.name,
        count: parseInt(r.count, 10),
      })),
      recentSends: recentSendsRes.rows,
      upcomingSchedules: upcomingRes.rows,
      dailyActivity: dailyActivityRes.rows.map((r) => ({
        day: r.day,
        sent: parseInt(r.sent, 10),
        failed: parseInt(r.failed, 10),
      })),
    });
  } catch (err) {
    next(err);
  }
});

const DismissalsSchema = z.object({
  application_ids: z.array(z.string().uuid()).max(200).default([]),
  failed_send_ids: z.array(z.string().uuid()).max(200).default([]),
  pending_prospect_ids: z.array(z.string().uuid()).max(200).default([]),
});

router.post('/dismissals', async (req, res, next) => {
  try {
    const parsed = DismissalsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed' });
      return;
    }

    const userId = req.user!.id;
    const { application_ids, failed_send_ids, pending_prospect_ids } = parsed.data;
    let closed = 0;
    let dismissed = 0;

    if (application_ids.length > 0) {
      const result = await pool.query(
        `UPDATE job_applications
         SET status = 'closed', updated_at = NOW()
         WHERE id = ANY($1::uuid[]) AND user_id = $2`,
        [application_ids, userId],
      );
      closed = result.rowCount ?? 0;
    }

    if (failed_send_ids.length > 0) {
      const result = await pool.query(
        `UPDATE email_sends
         SET dismissed_at = NOW()
         WHERE id = ANY($1::uuid[])
           AND created_by = $2
           AND status = 'failed'
           AND dismissed_at IS NULL`,
        [failed_send_ids, userId],
      );
      dismissed += result.rowCount ?? 0;
    }

    if (pending_prospect_ids.length > 0) {
      const result = await pool.query(
        `UPDATE pending_prospects
         SET dismissed_at = NOW()
         WHERE id = ANY($1::uuid[])
           AND user_id = $2
           AND dismissed_at IS NULL`,
        [pending_prospect_ids, userId],
      );
      dismissed += result.rowCount ?? 0;
    }

    res.json({ closed, dismissed });
  } catch (err) {
    next(err);
  }
});

export default router;
