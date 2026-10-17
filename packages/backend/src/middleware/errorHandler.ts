import type { Request, Response, NextFunction } from 'express';
import { systemLogger } from '../services/systemLogger.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const pgCode = (err as { code?: string }).code;

  if (pgCode === '22P02') {
    res.status(400).json({ error: 'Invalid ID format' });
    return;
  }
  if (pgCode === '23503') {
    res.status(400).json({ error: 'Referenced record does not exist' });
    return;
  }
  if (pgCode === '23505') {
    res.status(409).json({ error: 'A record with that value already exists' });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  
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
