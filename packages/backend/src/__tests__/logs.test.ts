import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app.js';
import { pool } from '../db/index.js';
import { CONFIG } from '../config.js';
import { systemLogger, sanitizeLogData, isSensitiveKey, truncatePayload } from '../services/systemLogger.js';
import type { AuthenticatedUser } from '../types/index.js';

describe('System Logging & Observability', () => {
  const adminUser: AuthenticatedUser = {
    id: 'admin-uuid-1',
    username: 'adminuser',
    role: 'admin',
  };

  const normalUser: AuthenticatedUser = {
    id: 'user-uuid-2',
    username: 'regularuser',
    role: 'user',
  };

  const adminToken = jwt.sign(adminUser, CONFIG.jwtSecret);
  const userToken = jwt.sign(normalUser, CONFIG.jwtSecret);

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [], rowCount: 0 } as any);
  });

  describe('sanitizeLogData', () => {
    it('redacts sensitive keys recursively in objects and arrays', () => {
      const input = {
        username: 'john',
        password: 'superSecretPassword',
        token: 'jwt.token.here',
        nested: {
          authorization: 'Bearer 12345',
          apiKey: 'xyz-secret',
          safeField: 42,
        },
        list: [
          { secret: 'hidden', visible: true },
          'regular-string',
        ],
      };

      const sanitized = sanitizeLogData(input) as Record<string, unknown>;

      expect(sanitized['password']).toBe('[REDACTED]');
      expect(sanitized['token']).toBe('[REDACTED]');
      expect((sanitized['nested'] as Record<string, unknown>)['authorization']).toBe('[REDACTED]');
      expect((sanitized['nested'] as Record<string, unknown>)['apiKey']).toBe('[REDACTED]');
      expect((sanitized['nested'] as Record<string, unknown>)['safeField']).toBe(42);
      expect(((sanitized['list'] as unknown[])[0] as Record<string, unknown>)['secret']).toBe('[REDACTED]');
      expect(((sanitized['list'] as unknown[])[0] as Record<string, unknown>)['visible']).toBe(true);
    });

    it('returns primitive values and null/undefined unchanged', () => {
      expect(sanitizeLogData(null)).toBeNull();
      expect(sanitizeLogData(undefined)).toBeUndefined();
      expect(sanitizeLogData('test string')).toBe('test string');
      expect(sanitizeLogData(123)).toBe(123);
    });

    it('does not redact LLM token metrics or limit configurations', () => {
      expect(isSensitiveKey('maxOutputTokens')).toBe(false);
      expect(isSensitiveKey('maxTokens')).toBe(false);
      expect(isSensitiveKey('promptTokenCount')).toBe(false);
      expect(isSensitiveKey('candidatesTokenCount')).toBe(false);
      expect(isSensitiveKey('totalTokenCount')).toBe(false);

      // But still redacts real sensitive keys
      expect(isSensitiveKey('token')).toBe(true);
      expect(isSensitiveKey('access_token')).toBe(true);
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('api_key')).toBe(true);
    });
  });

  describe('truncatePayload', () => {
    it('preserves deep nested objects like Gemini contents and parts without truncating at depth 6', () => {
      const geminiBody = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Classify this email please',
              },
            ],
          },
        ],
      };

      const truncated = truncatePayload(geminiBody) as any;
      expect(truncated.contents[0].parts[0].text).toBe('Classify this email please');
    });

    it('truncates excessively long strings beyond 10k characters', () => {
      const longStr = 'a'.repeat(12000);
      const truncated = truncatePayload(longStr) as string;
      expect(truncated.length).toBeLessThan(11000);
      expect(truncated).toContain('... [TRUNCATED]');
    });
  });

  describe('SystemLoggerService', () => {
    it('persists log entries to database with appropriate metadata', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      await systemLogger.log('warn', 'High memory usage', {
        source: 'scheduler',
        context: { usagePercent: 88 },
        requestId: 'req-123',
      });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO system_logs'),
        expect.arrayContaining(['warn', 'High memory usage', 'scheduler'])
      );
    });

    it('catches database errors gracefully without throwing', async () => {
      vi.mocked(pool.query).mockRejectedValueOnce(new Error('Connection terminated'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        systemLogger.log('error', 'Fatal error', { errorName: 'TestError' })
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('records error name and stack trace when error helper is called', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      const testError = new Error('Database query failed');
      testError.name = 'PgQueryError';

      systemLogger.error('Failed to execute query', testError, {
        source: 'backend',
        path: '/api/prospects',
      });

      // Allow microtask to run for fire-and-forget
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO system_logs'),
        expect.arrayContaining(['error', 'Failed to execute query', 'backend', null, 'PgQueryError'])
      );
    });

    it('prunes old logs based on retention days', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ count: '15' }],
      } as any);

      const deleted = await systemLogger.pruneOldLogs(30);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM system_logs'),
        [30]
      );
      expect(deleted).toBe(15);
    });

    it('retrieves aggregated stats', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          {
            total: '100',
            errors: '5',
            warnings: '10',
            info: '85',
            last_24h: '25',
          },
        ],
      } as any);

      const stats = await systemLogger.getStats();

      expect(stats).toEqual({
        total: 100,
        errors: 5,
        warnings: 10,
        info: 85,
        last24Hours: 25,
      });
    });
  });

  describe('Logs API Route (/api/logs)', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get('/api/logs');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 403 when authenticated as a non-admin user', async () => {
      const res = await request(app)
        .get('/api/logs')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('returns paginated logs for admin user', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [{ total: '1' }] } as any) // count query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'log-1',
              level: 'error',
              message: 'Failed to send email',
              source: 'backend',
              created_at: new Date().toISOString(),
            },
          ],
        } as any); // data query

      const res = await request(app)
        .get('/api/logs?level=error&page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].level).toBe('error');
    });

    it('returns stats at /api/logs/stats for admin user', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          {
            total: '42',
            errors: '2',
            warnings: '4',
            info: '36',
            last_24h: '10',
          },
        ],
      } as any);

      const res = await request(app)
        .get('/api/logs/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.errors).toBe(2);
      expect(res.body.total).toBe(42);
    });

    it('allows admin to trigger manual log pruning at POST /api/logs/prune', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [{ count: '7' }] } as any) // prune
        .mockResolvedValueOnce({ rows: [] } as any); // audit log

      const res = await request(app)
        .post('/api/logs/prune')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ days: 30 });

      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(7);
      expect(res.body.retentionDays).toBe(30);
    });

    it('allows admin to clear logs at DELETE /api/logs', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rowCount: 12 } as any) // delete
        .mockResolvedValueOnce({ rows: [] } as any); // audit log

      const res = await request(app)
        .delete('/api/logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(12);
    });
  });
});
