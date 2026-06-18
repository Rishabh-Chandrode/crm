import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config.js';
import type { AuthenticatedUser, UserRole } from '../types/index.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, CONFIG.jwtSecret) as AuthenticatedUser;
    req.user = { id: payload.id, username: payload.username, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}
