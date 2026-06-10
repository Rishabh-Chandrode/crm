import type { Request, Response, NextFunction } from 'express';
import { CONFIG } from '../config.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers['authorization'];
  if (!auth || auth !== `Bearer ${CONFIG.adminPassword}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
