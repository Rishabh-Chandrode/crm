import { Router } from 'express';
import { pool } from '../db/index.js';

const router: ReturnType<typeof Router> = Router();

router.get('/', async (req, res, next) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const userId = req.user!.id;
    const p = isAdmin ? [] : [userId]; // shared param array for simple $1 queries
    const w = isAdmin ? '' : ' WHERE created_by = $1';
    const a = isAdmin ? '' : ' AND created_by = $1'; // appended AND

    const [
      countsRes,
      emailStatsRes,
      categoryRes,
      topCompaniesRes,
      recentSendsRes,
      upcomingRes,
      dailyActivityRes,
    ] = await Promise.all([
      pool.query<{ companies: string; prospects: string; templates: string }>(
        isAdmin
          ? `SELECT
               (SELECT COUNT(*) FROM companies) AS companies,
               (SELECT COUNT(*) FROM prospects) AS prospects,
               (SELECT COUNT(*) FROM email_templates) AS templates`
          : `SELECT
               (SELECT COUNT(*) FROM companies     WHERE created_by = $1) AS companies,
               (SELECT COUNT(*) FROM prospects     WHERE created_by = $1) AS prospects,
               (SELECT COUNT(*) FROM email_templates WHERE created_by = $1) AS templates`,
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
                json_build_object('name', t.name) AS template
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
                json_build_object('name', t.name) AS template
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
    ]);

    const counts = countsRes.rows[0] ?? { companies: '0', prospects: '0', templates: '0' };

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

    res.json({
      companies: parseInt(counts.companies, 10),
      prospects: parseInt(counts.prospects, 10),
      templates: parseInt(counts.templates, 10),
      emails: { ...emailStats, openRate },
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

export default router;
