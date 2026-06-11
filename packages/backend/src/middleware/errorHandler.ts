import type { Request, Response, NextFunction } from 'express';

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

  console.error('Unhandled error:', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}
