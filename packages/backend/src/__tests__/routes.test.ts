import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app.js';
import { CONFIG } from '../config.js';
import { pool } from '../db/index.js';

describe('Backend API Feature Routes', () => {
  const userToken = jwt.sign(
    { id: 'u-1', username: 'user1', role: 'user' },
    CONFIG.jwtSecret
  );

  const adminToken = jwt.sign(
    { id: 'admin-1', username: 'admin', role: 'admin' },
    CONFIG.jwtSecret
  );

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Companies API (/api/companies)', () => {
    it('returns 400 when creating company without name', async () => {
      const res = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ website: 'https://example.com' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'name is required');
    });

    it('returns 200 with company list when query succeeds', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ id: 'c-1', name: 'Google', prospect_count: 5 }],
        rowCount: 1,
      } as any);

      const res = await request(app)
        .get('/api/companies')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ id: 'c-1', name: 'Google', prospect_count: 5 }]);
    });
  });

  describe('Prospects API (/api/prospects)', () => {
    it('returns 400 when creating prospect without email or first_name', async () => {
      const res = await request(app)
        .post('/api/prospects')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ notes: 'missing names and email' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns paginated prospect records', async () => {
      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'p-1',
              first_name: 'Alice',
              last_name: 'Wong',
              email: 'alice@acme.com',
              role_category: 'engineer',
            },
          ],
        } as any)
        .mockResolvedValueOnce({ rows: [{ count: '1' }] } as any);

      const res = await request(app)
        .get('/api/prospects?limit=10&offset=0')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });
  });

  describe('Templates API (/api/templates)', () => {
    it('returns 400 when required fields are missing on create', async () => {
      const res = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Incomplete' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('Job Applications API (/api/applications)', () => {
    it('returns 400 when required fields are missing on create', async () => {
      const res = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ platform: 'LinkedIn' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('creates an application, resolves company, and links company_id to job', async () => {
      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [{ id: 'comp-1' }] } as any) // existing company lookup
        .mockResolvedValueOnce({ rows: [{ id: 'job-new-1' }] } as any) // insert job
        .mockResolvedValueOnce({
          rows: [{
            id: 'app-new-1',
            company_name: 'Airtel',
            job_title: 'Backend Engineer',
            job_url: 'https://airtel.in/jobs/1',
            platform: 'Direct',
            status: 'not_applied',
            job_id: 'job-new-1',
          }],
        } as any) // insert job_applications
        .mockResolvedValueOnce({ rowCount: 1 } as any); // update jobs

      const res = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          company_name: 'Airtel',
          job_title: 'Backend Engineer',
          job_url: 'https://airtel.in/jobs/1',
          platform: 'Direct',
        });

      expect(res.status).toBe(201);
      expect(res.body.company_name).toBe('Airtel');
      expect(res.body.company_id).toBe('comp-1');
      expect(res.body.job_id).toBe('job-new-1');
    });

    it('updates application fields via PATCH /api/applications/:id', async () => {
      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [{ id: 'comp-1' }] } as any) // company lookup
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: 'app-1',
            company_name: 'Stripe',
            job_title: 'Staff Engineer',
            job_url: 'https://stripe.com/jobs/1',
            platform: 'Greenhouse',
            status: 'interview',
            notes: 'Round 2 scheduled',
            job_id: null,
          }],
        } as any);

      const res = await request(app)
        .patch('/api/applications/app-1')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          company_name: 'Stripe',
          job_title: 'Staff Engineer',
          job_url: 'https://stripe.com/jobs/1',
          platform: 'Greenhouse',
          status: 'interview',
          notes: 'Round 2 scheduled',
        });

      expect(res.status).toBe(200);
      expect(res.body.company_name).toBe('Stripe');
      expect(res.body.job_title).toBe('Staff Engineer');
      expect(res.body.status).toBe('interview');
    });

    it('returns emails for an application via GET /api/applications/:id/emails', async () => {
      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [{ job_id: 'job-1' }],
        } as any)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'send-1',
              subject: 'Referral inquiry',
              status: 'sent',
              prospect: { first_name: 'Alex', email: 'alex@stripe.com' },
            },
          ],
        } as any);

      const res = await request(app)
        .get('/api/applications/app-1/emails')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].subject).toBe('Referral inquiry');
    });

    it('returns 400 on PATCH when status is invalid', async () => {
      const res = await request(app)
        .patch('/api/applications/app-1')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ status: 'invalid_status' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('status must be one of');
    });
  });

  describe('Email Tracking Pixel (/api/track/open/:sendId.gif)', () => {
    it('returns 1x1 transparent gif image and no-cache headers', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({ rowCount: 1 } as any);

      const res = await request(app).get('/api/track/open/send-123.gif');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/gif');
      expect(res.headers['cache-control']).toContain('no-store');
    });

    it('returns debug JSON response when ?debug=true query param passed', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({ rowCount: 1 } as any);

      const res = await request(app).get('/api/track/open/send-123.gif?debug=true');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('rowCount', 1);
    });
  });

  describe('Stats API (/api/stats)', () => {
    it('returns dashboard statistics including readyToApply metrics', async () => {
      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [{ companies: '5', prospects: '20', templates: '3', applications: '8' }] } as any) // counts
        .mockResolvedValueOnce({ rows: [{ status: 'sent', count: '10', opened: '4' }] } as any) // emailStats
        .mockResolvedValueOnce({ rows: [{ category: 'engineer', count: '15' }] } as any) // category
        .mockResolvedValueOnce({ rows: [{ name: 'Stripe', count: '5' }] } as any) // topCompanies
        .mockResolvedValueOnce({ rows: [] } as any) // recentSends
        .mockResolvedValueOnce({ rows: [] } as any) // upcomingSchedules
        .mockResolvedValueOnce({ rows: [{ day: '2026-08-20', sent: '5', failed: '0' }] } as any) // dailyActivity
        .mockResolvedValueOnce({ rows: [{ status: 'referral_requested', count: '2' }] } as any) // appStats
        .mockResolvedValueOnce({ rows: [] } as any) // recentApps
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'app-ready-1',
              company_name: 'Stripe',
              job_title: 'Staff Engineer',
              status: 'referral_requested',
              email_count: 2,
              referral_requested_at: new Date().toISOString(),
            },
          ],
        } as any) // readyToApply
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'app-not-applied-1',
              company_name: 'Airbnb',
              job_title: 'Design Technologist',
              status: 'not_applied',
              email_count: 0,
            },
          ],
        } as any); // notApplied

      const res = await request(app)
        .get('/api/stats')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('companies', 5);
      expect(res.body).toHaveProperty('readyToApplyCount', 1);
      expect(res.body.readyToApplyApplications).toHaveLength(1);
      expect(res.body.readyToApplyApplications[0].job_title).toBe('Staff Engineer');
      expect(res.body).toHaveProperty('notAppliedCount', 1);
      expect(res.body.notAppliedApplications).toHaveLength(1);
      expect(res.body.notAppliedApplications[0].job_title).toBe('Design Technologist');
    });
  });

  describe('Admin Users API (/api/users)', () => {
    it('rejects regular users with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden');
    });

    it('allows admin users to access user management', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ id: '1', username: 'admin', role: 'admin' }],
      } as any);

      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ id: '1', username: 'admin', role: 'admin' }]);
    });
  });
});
