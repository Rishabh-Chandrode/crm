import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { systemLogger } from '../services/systemLogger.js';
import type { SystemLogLevel } from '../types/index.js';

const router: ReturnType<typeof Router> = Router();

/**
 * POST /api/logs/ingest
 * Ingest error or telemetry logs from frontend or extension.
 * Requires authenticated user (accessible to both admin and standard users).
 */
router.post('/ingest', authMiddleware, async (req, res, next) => {
  try {
    const { level, message, source, context, errorName, stackTrace } = req.body as {
      level?: SystemLogLevel;
      message?: string;
      source?: string;
      context?: Record<string, unknown>;
      errorName?: string;
      stackTrace?: string;
    };

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const validLevels: SystemLogLevel[] = ['info', 'warn', 'error', 'debug'];
    const resolvedLevel: SystemLogLevel = validLevels.includes(level as SystemLogLevel)
      ? (level as SystemLogLevel)
      : 'error';
    const resolvedSource = source && typeof source === 'string' ? source.slice(0, 50) : 'client';

    await systemLogger.log(resolvedLevel, message.slice(0, 1000), {
      source: resolvedSource,
      context,
      errorName,
      stackTrace,
      userId: req.user?.id,
      ip: req.ip,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: resolvedLevel === 'error' ? 500 : 200,
    });

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Protect all management logs endpoints for admin role only
router.use(authMiddleware, requireRole('admin'));

/**
 * GET /api/logs/stats
 * Get aggregated log stats (errors, warnings, 24h totals).
 */
router.get('/stats', async (_req, res, next) => {
  try {
    const stats = await systemLogger.getStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/logs
 * Retrieve paginated and filtered logs.
 */
router.get('/', async (req, res, next) => {
  try {
    const { level, source, search, startDate, endDate, page, limit } = req.query;

    const validLevels: SystemLogLevel[] = ['info', 'warn', 'error', 'debug'];
    const parsedLevel = typeof level === 'string' && validLevels.includes(level as SystemLogLevel)
      ? (level as SystemLogLevel)
      : undefined;

    const result = await systemLogger.getLogs({
      level: parsedLevel,
      source: typeof source === 'string' ? source : undefined,
      search: typeof search === 'string' ? search : undefined,
      startDate: typeof startDate === 'string' ? startDate : undefined,
      endDate: typeof endDate === 'string' ? endDate : undefined,
      page: page ? parseInt(String(page), 10) : 1,
      limit: limit ? parseInt(String(limit), 10) : 25,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/logs
 * Purge logs, optionally before a specific date.
 */
router.delete('/', async (req, res, next) => {
  try {
    const beforeDateParam = req.query.beforeDate;
    const beforeDate = typeof beforeDateParam === 'string' ? new Date(beforeDateParam) : undefined;

    const deleted = await systemLogger.clearLogs(beforeDate);

    systemLogger.warn(
      `Admin user '${req.user?.username}' cleared ${deleted} system log(s)${beforeDate ? ` before ${beforeDate.toISOString()}` : ''}`,
      {
        source: 'backend',
        userId: req.user?.id,
      }
    );

    res.json({ deleted });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/logs/prune
 * Trigger log retention pruning manually.
 */
router.post('/prune', async (req, res, next) => {
  try {
    const days = parseInt(String(req.body.days || 30), 10);
    const retentionDays = Number.isFinite(days) && days > 0 ? days : 30;

    const deleted = await systemLogger.pruneOldLogs(retentionDays);

    systemLogger.info(`Log retention pruning executed for logs older than ${retentionDays} days`, {
      source: 'backend',
      userId: req.user?.id,
    });

    res.json({ deleted, retentionDays });
  } catch (err) {
    next(err);
  }
});

export default router;
