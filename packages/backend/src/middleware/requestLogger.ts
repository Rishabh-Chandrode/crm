import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { systemLogger, isAutoTelemetryEnabled } from '../services/systemLogger.js';

const IGNORED_GET_PREFIXES = ['/api/logs', '/api/admin/monitoring', '/health'];

/**
 * Express middleware that assigns a unique requestId and records structured
 * HTTP telemetry for backend feature invocations and errors.
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string | undefined) || crypto.randomUUID();
  res.setHeader('x-request-id', requestId);

  const startTime = Date.now();

  res.on('finish', () => {
    const path = req.originalUrl || req.path;
    const method = req.method.toUpperCase();

    // Avoid self-referential log noise when admin polls /api/logs or /api/admin/monitoring
    if (method === 'GET' && IGNORED_GET_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return;
    }

    const statusCode = res.statusCode;
    const durationMs = Date.now() - startTime;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    // Log all mutations, errors, and non-polling API reads
    if (method === 'GET' && statusCode < 400 && !path.startsWith('/api/')) {
      return;
    }

    if (!isAutoTelemetryEnabled()) return;

    void systemLogger.log(
      level,
      `HTTP ${method} ${path.split('?')[0]} ${statusCode} (${durationMs}ms)`,
      {
        source: 'http',
        requestId,
        method,
        path: path.split('?')[0],
        statusCode,
        userId: req.user?.id,
        ip: req.ip,
        skipGithubIssue: statusCode < 500,
        context: {
          durationMs,
          userRole: req.user?.role,
        },
      }
    );
  });

  next();
}
