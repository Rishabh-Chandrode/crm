import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { pool } from '../db/index.js';
import { CONFIG } from '../config.js';

describe('Admin Monitoring API (/api/admin/monitoring)', () => {
  const adminToken = jwt.sign(
    { id: '11111111-1111-1111-1111-111111111111', username: 'admin', role: 'admin' },
    CONFIG.jwtSecret,
    { expiresIn: '1h' }
  );

  const userToken = jwt.sign(
    { id: '22222222-2222-2222-2222-222222222222', username: 'regular', role: 'user' },
    CONFIG.jwtSecret,
    { expiresIn: '1h' }
  );

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/admin/monitoring');
    expect(res.status).toBe(401);
  });

  it('returns 403 when called by a non-admin user', async () => {
    const res = await request(app)
      .get('/api/admin/monitoring')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 with users, applicationTotals, cronJobs, sourceTelemetry, and recentErrors for admin', async () => {
    vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({
        rows: [{ total: '5', active: '4', admins: '1', gmail_connected: '3', job_sync_enabled: '2' }],
      } as any)
      .mockResolvedValueOnce({
        rows: [{ companies: '20', prospects: '45', templates: '8', jobs: '30', applications: '18' }],
      } as any)
      .mockResolvedValueOnce({
        rows: [{ sent: '120', failed: '2', pending: '4' }],
      } as any)
      .mockResolvedValueOnce({
        rows: [
          {
            job_name: 'job_email_sync',
            phase: 'completed',
            created_at: new Date('2026-11-28T15:00:00Z'),
            duration_ms: 420,
            message: 'Cron job completed: job_email_sync (420ms)',
            result: 3,
          },
        ],
      } as any)
      .mockResolvedValueOnce({
        rows: [
          {
            source: 'gemini',
            total_24h: '40',
            errors_24h: '1',
            warnings_24h: '0',
            avg_duration_ms: 610,
            last_event_at: new Date('2026-11-28T15:05:00Z'),
          },
        ],
      } as any)
      .mockResolvedValueOnce({
        rows: [{ id: 'err-1', level: 'error', message: 'Timeout', source: 'prospeo', created_at: new Date().toISOString() }],
      } as any);

    const res = await request(app)
      .get('/api/admin/monitoring')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.users).toEqual({
      total: 5,
      active: 4,
      admins: 1,
      gmailConnected: 3,
      jobSyncEnabled: 2,
    });
    expect(res.body.data.applicationTotals).toEqual({
      companies: 20,
      prospects: 45,
      templates: 8,
      emailsSent: 120,
      emailsFailed: 2,
      emailsPending: 4,
      jobs: 30,
      applications: 18,
    });
    expect(res.body.data.cronJobs).toHaveLength(1);
    expect(res.body.data.cronJobs[0].jobName).toBe('job_email_sync');
    expect(res.body.data.sourceTelemetry).toHaveLength(1);
    expect(res.body.data.sourceTelemetry[0].source).toBe('gemini');
    expect(res.body.data.recentErrors).toHaveLength(1);
  });
});
