import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { CONFIG } from '../config.js';
import type { AuthenticatedUser } from '../types/index.js';

describe('Auth Middleware & Session Protection', () => {
  const mockUser: AuthenticatedUser = {
    id: 'user-uuid-1234',
    username: 'testuser',
    role: 'user',
  };

  it('rejects requests without Authorization header with 401', () => {
    const req = { headers: {} } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects invalid or forged JWT tokens with 401', () => {
    const req = {
      headers: { authorization: 'Bearer invalid.token.value' },
    } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts valid JWT token, attaches user session, and calls next()', () => {
    const token = jwt.sign(mockUser, CONFIG.jwtSecret, { expiresIn: '1h' });
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    authMiddleware(req, res, next);

    expect(req.user).toEqual({
      id: mockUser.id,
      username: mockUser.username,
      role: mockUser.role,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  describe('requireRole middleware', () => {
    it('allows users with matching role', () => {
      const adminMiddleware = requireRole('admin');
      const req = {
        user: { id: '1', username: 'admin', role: 'admin' },
      } as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      const next = vi.fn() as NextFunction;

      adminMiddleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects users with non-matching role with 403 Forbidden', () => {
      const adminMiddleware = requireRole('admin');
      const req = {
        user: { id: '2', username: 'standard', role: 'user' },
      } as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      const next = vi.fn() as NextFunction;

      adminMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
