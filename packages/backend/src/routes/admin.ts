import { Router } from 'express';
import { pool } from '../db/index.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { systemLogger } from '../services/systemLogger.js';
import type {
  AdminMonitoringOverview,
  CronJobStatusSummary,
  SourceTelemetrySummary,
  SystemLog,
} from '../types/index.js';

const router: ReturnType<typeof Router> = Router();

router.use(authMiddleware, requireRole('admin'));

/**
 * GET /api/admin/monitoring
 * Returns global application telemetry, cron job statuses, 24h third-party/AI API metrics,
 * user adoption counts, and recent error logs for the admin monitoring account.
 */
router.get('/monitoring', async (_req, res, next) => {
  try {
    const [usersRes, appTotalsRes, emailRes, cronRes, sourceRes, recentErrorsRes] =
      await Promise.all([
        pool.query<{
          total: string;
          active: string;
          admins: string;
          gmail_connected: string;
          job_sync_enabled: string;
        }>(
          `SELECT
             COUNT(*)::text AS total,
             COUNT(*) FILTER (WHERE is_active = TRUE)::text AS active,
             COUNT(*) FILTER (WHERE role = 'admin')::text AS admins,
             COUNT(*) FILTER (WHERE gmail_refresh_token IS NOT NULL OR gmail_access_token IS NOT NULL)::text AS gmail_connected,
             COUNT(*) FILTER (WHERE job_email_sync_enabled = TRUE)::text AS job_sync_enabled
           FROM users`
        ),
        pool.query<{
          companies: string;
          prospects: string;
          templates: string;
          jobs: string;
          applications: string;
        }>(
          `SELECT
             (SELECT COUNT(*) FROM companies)::text AS companies,
             (SELECT COUNT(*) FROM prospects)::text AS prospects,
             (SELECT COUNT(*) FROM email_templates WHERE deleted_at IS NULL)::text AS templates,
             (SELECT COUNT(*) FROM jobs)::text AS jobs,
             (SELECT COUNT(*) FROM job_applications)::text AS applications`
        ),
        pool.query<{ sent: string; failed: string; pending: string }>(
          `SELECT
             COUNT(*) FILTER (WHERE status = 'sent')::text AS sent,
             COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
             COUNT(*) FILTER (WHERE status = 'pending')::text AS pending
           FROM email_sends`
        ),
        pool.query<{
          job_name: string;
          phase: string;
          created_at: Date | string;
          duration_ms: number | null;
          message: string;
          result: unknown;
        }>(
          `SELECT DISTINCT ON (context->>'jobName')
             context->>'jobName' AS job_name,
             COALESCE(context->>'phase', 'completed') AS phase,
             created_at,
             NULLIF(context->>'durationMs', '')::int AS duration_ms,
             message,
             context->'result' AS result
           FROM system_logs
           WHERE source = 'cron' AND context->>'jobName' IS NOT NULL
           ORDER BY context->>'jobName', created_at DESC`
        ),
        pool.query<{
          source: string;
          total_24h: string;
          errors_24h: string;
          warnings_24h: string;
          avg_duration_ms: number | null;
          last_event_at: Date | string | null;
        }>(
          `SELECT
             source,
             COUNT(*)::text AS total_24h,
             COUNT(*) FILTER (WHERE level = 'error')::text AS errors_24h,
             COUNT(*) FILTER (WHERE level = 'warn')::text AS warnings_24h,
             ROUND(AVG(NULLIF(context->>'durationMs', '')::numeric))::int AS avg_duration_ms,
             MAX(created_at) AS last_event_at
           FROM system_logs
           WHERE created_at >= NOW() - INTERVAL '24 hours'
           GROUP BY source
           ORDER BY COUNT(*) DESC`
        ),
        pool.query<SystemLog>(
          `SELECT * FROM system_logs
           WHERE level = 'error'
           ORDER BY created_at DESC
           LIMIT 10`
        ),
      ]);

    const u = usersRes.rows[0] ?? {
      total: '0',
      active: '0',
      admins: '0',
      gmail_connected: '0',
      job_sync_enabled: '0',
    };
    const a = appTotalsRes.rows[0] ?? {
      companies: '0',
      prospects: '0',
      templates: '0',
      jobs: '0',
      applications: '0',
    };
    const e = emailRes.rows[0] ?? { sent: '0', failed: '0', pending: '0' };

    const cronJobs: CronJobStatusSummary[] = cronRes.rows.map((r) => ({
      jobName: r.job_name,
      lastPhase: (['started', 'completed', 'failed'].includes(r.phase)
        ? r.phase
        : 'completed') as CronJobStatusSummary['lastPhase'],
      lastRunAt:
        r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      durationMs: r.duration_ms ?? null,
      lastMessage: r.message,
      result: r.result,
    }));

    const sourceTelemetry: SourceTelemetrySummary[] = sourceRes.rows.map((r) => ({
      source: r.source,
      total24h: parseInt(r.total_24h, 10) || 0,
      errors24h: parseInt(r.errors_24h, 10) || 0,
      warnings24h: parseInt(r.warnings_24h, 10) || 0,
      avgDurationMs: r.avg_duration_ms ?? null,
      lastEventAt: r.last_event_at
        ? r.last_event_at instanceof Date
          ? r.last_event_at.toISOString()
          : String(r.last_event_at)
        : null,
    }));

    const payload: AdminMonitoringOverview = {
      users: {
        total: parseInt(u.total, 10) || 0,
        active: parseInt(u.active, 10) || 0,
        admins: parseInt(u.admins, 10) || 0,
        gmailConnected: parseInt(u.gmail_connected, 10) || 0,
        jobSyncEnabled: parseInt(u.job_sync_enabled, 10) || 0,
      },
      applicationTotals: {
        companies: parseInt(a.companies, 10) || 0,
        prospects: parseInt(a.prospects, 10) || 0,
        templates: parseInt(a.templates, 10) || 0,
        emailsSent: parseInt(e.sent, 10) || 0,
        emailsFailed: parseInt(e.failed, 10) || 0,
        emailsPending: parseInt(e.pending, 10) || 0,
        jobs: parseInt(a.jobs, 10) || 0,
        applications: parseInt(a.applications, 10) || 0,
      },
      cronJobs,
      sourceTelemetry,
      recentErrors: recentErrorsRes.rows,
    };

    res.set('Cache-Control', 'no-store');
    res.json({ data: payload });
  } catch (err) {
    systemLogger.error('Failed to fetch admin monitoring overview', err, {
      source: 'backend',
      path: '/api/admin/monitoring',
      userId: reqUserId(_req),
    });
    next(err);
  }
});

function reqUserId(req: { user?: { id: string } }): string | undefined {
  return req.user?.id;
}

export default router;
