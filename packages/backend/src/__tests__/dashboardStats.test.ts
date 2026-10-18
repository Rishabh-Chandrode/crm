import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config.js';
import statsRouter from '../routes/stats.js';
import { authMiddleware } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { pool } from '../db/index.js';
import { systemLogger } from '../services/systemLogger.js';
import { syncOutreachForDashboard } from '../services/jobs.js';

const app = express();
app.use(express.json());
app.use('/api/stats', authMiddleware, statsRouter);
app.use(errorHandler);

const regularUser = { id: 'u-reg-1', username: 'regularuser', role: 'user' };
const regularToken = jwt.sign(regularUser, CONFIG.jwtSecret);

const adminUser = { id: 'u-admin-1', username: 'adminuser', role: 'admin' };
const adminToken = jwt.sign(adminUser, CONFIG.jwtSecret);

describe('Dashboard Stats and Sync Reliability', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('syncOutreachForDashboard', () => {
    it('executes linking, distinct upserts, and status promotions successfully', async () => {
      const querySpy = vi.spyOn(pool, 'query').mockResolvedValue({ rowCount: 1 } as any);

      await syncOutreachForDashboard('u-reg-1');

      expect(querySpy).toHaveBeenCalledTimes(5);
      // Query 1: link sends to jobs
      expect(querySpy.mock.calls[0][0]).toContain('WITH candidates AS');
      // Query 2: update jobs status
      expect(querySpy.mock.calls[1][0]).toContain('SET status = \'referral_requested\'');
      // Query 3: link unlinked job_applications
      expect(querySpy.mock.calls[2][0]).toContain('UPDATE job_applications ja');
      expect(querySpy.mock.calls[2][0]).toContain('ja.job_id IS NULL');
      // Query 4: safe insert with DISTINCT ON and ON CONFLICT DO UPDATE
      expect(querySpy.mock.calls[3][0]).toContain('DISTINCT ON (j.created_by, j.job_url)');
      expect(querySpy.mock.calls[3][0]).toContain('ON CONFLICT (user_id, job_url) WHERE job_url NOT IN (\'#\', \'\')');
      expect(querySpy.mock.calls[3][0]).toContain('DO UPDATE SET');
      // Query 5: update job_applications to referral_requested
      expect(querySpy.mock.calls[4][0]).toContain('ja.status IN (\'open\', \'not_applied\')');
    });
  });

  describe('GET /api/stats error resilience', () => {
    it('catches syncOutreachForDashboard errors, logs to systemLogger, and still returns 200 stats', async () => {
      const loggerSpy = vi.spyOn(systemLogger, 'error').mockResolvedValue();

      vi.spyOn(pool, 'query')
        // First call in syncOutreachForDashboard throws a unique violation or DB error
        .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint idx_job_applications_user_url'))
        // Following queries in stats handler
        .mockResolvedValueOnce({ rows: [{ companies: '2', prospects: '4', templates: '1', applications: '3' }] } as any) // counts
        .mockResolvedValueOnce({ rows: [{ status: 'sent', count: '5', opened: '2' }] } as any) // emailStats
        .mockResolvedValueOnce({ rows: [] } as any) // category
        .mockResolvedValueOnce({ rows: [] } as any) // topCompanies
        .mockResolvedValueOnce({ rows: [] } as any) // recentSends
        .mockResolvedValueOnce({ rows: [] } as any) // upcoming
        .mockResolvedValueOnce({ rows: [] } as any) // dailyActivity
        .mockResolvedValueOnce({ rows: [] } as any) // appStats
        .mockResolvedValueOnce({ rows: [] } as any) // recentApps
        .mockResolvedValueOnce({ rows: [] } as any) // readyToApply
        .mockResolvedValueOnce({ rows: [] } as any) // referralSent
        .mockResolvedValueOnce({ rows: [] } as any) // notApplied
        .mockResolvedValueOnce({ rows: [] } as any) // activeInterviews
        .mockResolvedValueOnce({ rows: [] } as any) // failedSends
        .mockResolvedValueOnce({ rows: [] } as any) // pendingProspects
        .mockResolvedValueOnce({ rows: [] } as any); // unconfirmedApplications

      const res = await request(app)
        .get('/api/stats')
        .set('Authorization', `Bearer ${regularToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('companies', 2);
      expect(res.body).toHaveProperty('applications', 3);
      expect(res.body).toHaveProperty('unconfirmedCount', 0);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('syncOutreachForDashboard failed'),
        expect.any(Error),
        expect.objectContaining({
          userId: 'u-reg-1',
          source: 'stats-route',
        })
      );
    });

    it('bypasses syncOutreachForDashboard for admin users', async () => {
      const querySpy = vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [{ companies: '10', prospects: '20', templates: '5', applications: '15' }] } as any) // counts
        .mockResolvedValueOnce({ rows: [] } as any) // emailStats
        .mockResolvedValueOnce({ rows: [] } as any) // category
        .mockResolvedValueOnce({ rows: [] } as any) // topCompanies
        .mockResolvedValueOnce({ rows: [] } as any) // recentSends
        .mockResolvedValueOnce({ rows: [] } as any) // upcoming
        .mockResolvedValueOnce({ rows: [] } as any) // dailyActivity
        .mockResolvedValueOnce({ rows: [] } as any) // appStats
        .mockResolvedValueOnce({ rows: [] } as any) // recentApps
        .mockResolvedValueOnce({ rows: [] } as any) // readyToApply
        .mockResolvedValueOnce({ rows: [] } as any) // referralSent
        .mockResolvedValueOnce({ rows: [] } as any) // notApplied
        .mockResolvedValueOnce({ rows: [] } as any) // activeInterviews
        .mockResolvedValueOnce({ rows: [] } as any) // failedSends
        .mockResolvedValueOnce({ rows: [] } as any) // pendingProspects
        .mockResolvedValueOnce({ rows: [] } as any); // unconfirmedApplications

      const res = await request(app)
        .get('/api/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('companies', 10);
      // Ensure syncOutreachForDashboard was not called (which has candidates query)
      const hasCandidatesQuery = querySpy.mock.calls.some((c) => String(c[0]).includes('WITH candidates AS'));
      expect(hasCandidatesQuery).toBe(false);
    });
  });

  describe('errorHandler middleware observability', () => {
    it('logs systemLogger.error when a 23505 duplicate key error occurs on a GET request', async () => {
      const errorSpy = vi.spyOn(systemLogger, 'error').mockResolvedValue();

      const testApp = express();
      testApp.get('/test-error', () => {
        const err = new Error('duplicate key value violates unique constraint') as any;
        err.code = '23505';
        throw err;
      });
      testApp.use(errorHandler);

      const res = await request(testApp).get('/test-error');

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'A record with that value already exists' });
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('A record with that value already exists'),
        expect.any(Error),
        expect.objectContaining({
          statusCode: 409,
          method: 'GET',
          path: '/test-error',
        })
      );
    });

    it('logs systemLogger.warn when a 23505 duplicate key error occurs on a POST request', async () => {
      const warnSpy = vi.spyOn(systemLogger, 'warn').mockResolvedValue();

      const testApp = express();
      testApp.post('/test-post-error', () => {
        const err = new Error('duplicate key value violates unique constraint') as any;
        err.code = '23505';
        throw err;
      });
      testApp.use(errorHandler);

      const res = await request(testApp).post('/test-post-error');

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'A record with that value already exists' });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('A record with that value already exists'),
        expect.any(Error),
        expect.objectContaining({
          statusCode: 409,
          method: 'POST',
        })
      );
    });

    it('logs systemLogger.warn and returns 400 for 22P02 invalid ID format', async () => {
      const warnSpy = vi.spyOn(systemLogger, 'warn').mockResolvedValue();

      const testApp = express();
      testApp.get('/test-invalid-id', () => {
        const err = new Error('invalid input syntax for type uuid') as any;
        err.code = '22P02';
        throw err;
      });
      testApp.use(errorHandler);

      const res = await request(testApp).get('/test-invalid-id');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid ID format' });
      expect(warnSpy).toHaveBeenCalled();
    });

    it('logs systemLogger.warn and returns 400 for 23503 foreign key violation', async () => {
      const warnSpy = vi.spyOn(systemLogger, 'warn').mockResolvedValue();

      const testApp = express();
      testApp.post('/test-fk-error', () => {
        const err = new Error('insert or update on table violates foreign key constraint') as any;
        err.code = '23503';
        throw err;
      });
      testApp.use(errorHandler);

      const res = await request(testApp).post('/test-fk-error');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Referenced record does not exist' });
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
