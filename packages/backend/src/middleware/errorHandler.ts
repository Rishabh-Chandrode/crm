import type { Request, Response, NextFunction } from 'express';
import { systemLogger } from '../services/systemLogger.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const pgCode = (err as { code?: string }).code;
  const message = err instanceof Error ? err.message : 'Internal server error';

  if (pgCode === '22P02') {
    systemLogger.warn(`Invalid ID format: ${message}`, {
      source: 'backend',
      method: _req.method,
      path: _req.originalUrl || _req.url,
      statusCode: 400,
      userId: _req.user?.id,
      ip: _req.ip,
    });
    res.status(400).json({ error: 'Invalid ID format' });
    return;
  }
  if (pgCode === '23503') {
    systemLogger.warn(`Referenced record does not exist: ${message}`, {
      source: 'backend',
      method: _req.method,
      path: _req.originalUrl || _req.url,
      statusCode: 400,
      userId: _req.user?.id,
      ip: _req.ip,
    });
    res.status(400).json({ error: 'Referenced record does not exist' });
    return;
  }
  if (pgCode === '23505') {
    const isGet = _req.method === 'GET';
    const logFn = isGet ? systemLogger.error.bind(systemLogger) : systemLogger.warn.bind(systemLogger);
    logFn(`A record with that value already exists: ${message}`, err, {
      source: 'backend',
      method: _req.method,
      path: _req.originalUrl || _req.url,
      statusCode: 409,
      userId: _req.user?.id,
      ip: _req.ip,
    });
    res.status(409).json({ error: 'A record with that value already exists' });
    return;
  }

  systemLogger.error(`Unhandled error: ${message}`, err, {
    source: 'backend',
    method: _req.method,
    path: _req.originalUrl || _req.url,
    statusCode: 500,
    userId: _req.user?.id,
    ip: _req.ip,
  });

  console.error('Unhandled error:', err);
  res.status(500).json({ error: message });
}
