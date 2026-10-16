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
    // Never fall through to the real pool. A one-off mock that runs out otherwise
    // waits on a live connection until the test times out.
    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [], rowCount: 0 } as any);
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

    it('creates version 1 of a new template family', async () => {
      const spy = vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ id: 't-1', family_id: 't-1', name: 'referral', version: 1, subject: 'Hi', body: 'Hello' }],
      } as any);

      const res = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'referral', subject: 'Hi', body: 'Hello' });

      expect(res.status).toBe(201);
      expect(res.body.data.version).toBe(1);
      expect(String(spy.mock.calls[0]?.[0])).toContain('family_id');
      expect(String(spy.mock.calls[0]?.[0])).toContain(', 1');
    });

    it('inserts the next version instead of overwriting on update', async () => {
      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [{
            id: 't-1',
            family_id: 'fam-1',
            name: 'referral',
            subject: 'Hi',
            body: 'Hello',
            description: null,
            job_description: null,
            variables: [],
            document_ids: [],
            created_by: 'u-1',
            deleted_at: null,
            version: 1,
          }],
        } as any)
        .mockResolvedValueOnce({ rows: [{ version: 2 }] } as any)
        .mockResolvedValueOnce({
          rows: [{ id: 't-2', family_id: 'fam-1', name: 'referral', version: 2, subject: 'Hi there', body: 'Hello again' }],
        } as any);

      const res = await request(app)
        .patch('/api/templates/t-1')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'referral', subject: 'Hi there', body: 'Hello again' });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('t-2');
      expect(res.body.data.version).toBe(2);
      expect(String(vi.mocked(pool.query).mock.calls[2]?.[0])).toContain('INSERT INTO email_templates');
    });

    it('rejects edits to a deleted template', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{
          id: 't-1',
          family_id: 'fam-1',
          name: 'referral',
          subject: 'Hi',
          body: 'Hello',
          deleted_at: new Date().toISOString(),
          version: 1,
          variables: [],
          document_ids: [],
        }],
      } as any);

      const res = await request(app)
        .patch('/api/templates/t-1')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'referral', subject: 'Hi', body: 'Hello again' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/deleted/i);
    });

    it('soft-deletes one template version', async () => {
      const spy = vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [{ id: 't-1' }] } as any);

      const res = await request(app)
        .delete('/api/templates/t-1')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('t-1');
      expect(String(spy.mock.calls[0]?.[0])).toContain('deleted_at = NOW()');
      expect(String(spy.mock.calls[0]?.[0])).not.toContain('DELETE FROM');
    });

    it('soft-deletes older versions and leaves the latest live', async () => {
      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [{ family_id: 'fam-1' }] } as any)
        .mockResolvedValueOnce({ rows: [{ id: 't-1' }] } as any);

      const res = await request(app)
        .delete('/api/templates/t-2/older-versions')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.ids).toEqual(['t-1']);
      const sql = String(vi.mocked(pool.query).mock.calls[1]?.[0]);
      expect(sql).toContain('version <');
      expect(sql).toContain('MAX(version)');
    });

    it('lists only the latest live version by default', async () => {
      const spy = vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({
          rows: [{ id: 't-2', name: 'referral', version: 2, deleted_at: null }],
        } as any);

      const res = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(String(spy.mock.calls[0]?.[0])).toContain('UPDATE email_templates');
      expect(String(spy.mock.calls[2]?.[0])).toContain('DISTINCT ON (family_id)');
      expect(String(spy.mock.calls[2]?.[0])).toContain('deleted_at IS NULL');
      expect(res.body.data[0].version).toBe(2);
    });

    it('drops document ids that no longer exist when creating a template', async () => {
      const spy = vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [{ id: 'doc-live' }] } as any)
        .mockResolvedValueOnce({
          rows: [{ id: 't-1', family_id: 't-1', name: 'referral', version: 1, document_ids: ['doc-live'] }],
        } as any);

      const res = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'referral',
          subject: 'Hi',
          body: 'Hello',
          document_ids: ['doc-gone', 'doc-live'],
        });

      expect(res.status).toBe(201);
      expect(String(spy.mock.calls[0]?.[0])).toContain('FROM documents');
      expect(spy.mock.calls[1]?.[1]).toEqual(expect.arrayContaining([['doc-live']]));
    });

    it('lists every version including deleted ones when all=true', async () => {
      const spy = vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({
          rows: [
            { id: 't-2', name: 'referral', version: 2, deleted_at: null },
            { id: 't-1', name: 'referral', version: 1, deleted_at: '2026-01-01' },
          ],
        } as any);

      const res = await request(app)
        .get('/api/templates?all=true')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(String(spy.mock.calls[2]?.[0])).toContain('version DESC');
      expect(res.body.data).toHaveLength(2);
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

    it('allows admin to update application created by another user via PATCH /api/applications/:id', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'app-99', company_name: 'Stripe', status: 'closed', job_id: null }],
      } as any);

      const res = await request(app)
        .patch('/api/applications/app-99')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('closed');
    });

    it('allows admin to delete application via DELETE /api/applications/:id', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rowCount: 1,
        rows: [],
      } as any);

      const res = await request(app)
        .delete('/api/applications/app-99')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
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
        .mockResolvedValueOnce({ rowCount: 0 } as any) // link unassigned sends
        .mockResolvedValueOnce({ rowCount: 0 } as any) // mark jobs referral_requested
        .mockResolvedValueOnce({ rowCount: 0 } as any) // create missing applications
        .mockResolvedValueOnce({ rowCount: 0 } as any) // promote saved apps that already have sends
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
              id: 'app-sent-1',
              company_name: 'Notion',
              job_title: 'Product Engineer',
              status: 'referral_requested',
              email_count: 5,
            },
          ],
        } as any) // referralSent within 2 days
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
        } as any) // notApplied
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'app-interview-1',
              company_name: 'Google',
              job_title: 'Software Engineer III',
              status: 'interview',
              email_count: 1,
            },
          ],
        } as any) // activeInterviews
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'send-failed-1',
              recipient_email: 'fail@test.com',
              status: 'failed',
              error_message: 'Invalid recipient',
            },
          ],
        } as any); // failedSends

      const res = await request(app)
        .get('/api/stats')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('companies', 5);
      expect(res.body).toHaveProperty('readyToApplyCount', 1);
      expect(res.body.readyToApplyApplications).toHaveLength(1);
      expect(res.body.readyToApplyApplications[0].job_title).toBe('Staff Engineer');
      expect(res.body).toHaveProperty('referralSentCount', 1);
      expect(res.body.referralSentApplications[0].email_count).toBe(5);
      expect(res.body).toHaveProperty('notAppliedCount', 1);
      expect(res.body.notAppliedApplications).toHaveLength(1);
      expect(res.body.notAppliedApplications[0].job_title).toBe('Design Technologist');
      expect(res.body).toHaveProperty('activeInterviewCount', 1);
      expect(res.body.activeInterviewApplications).toHaveLength(1);
      expect(res.body.activeInterviewApplications[0].job_title).toBe('Software Engineer III');
      expect(res.body.failedSends).toHaveLength(1);
      expect(res.headers['cache-control']).toBe('no-store');
      const sql = vi.mocked(pool.query).mock.calls.map((call) => String(call[0])).join('\n');
      expect(sql).toContain('es.dismissed_at IS NULL');
    });

    it('closes owned applications and stamps dismissed_at on owned failed sends', async () => {
      const applicationId = '11111111-1111-4111-8111-111111111111';
      const sendId = '22222222-2222-4222-8222-222222222222';
      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rowCount: 1 } as any)
        .mockResolvedValueOnce({ rowCount: 1 } as any);

      const res = await request(app)
        .post('/api/stats/dismissals')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ application_ids: [applicationId], failed_send_ids: [sendId] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ closed: 1, dismissed: 1 });

      const calls = vi.mocked(pool.query).mock.calls;
      expect(String(calls[0][0])).toContain('user_id = $2');
      expect(calls[0][1]).toEqual([[applicationId], 'u-1']);
      expect(String(calls[1][0])).toContain('created_by = $2');
      expect(String(calls[1][0])).toContain('dismissed_at IS NULL');
      expect(calls[1][1]).toEqual([[sendId], 'u-1']);
    });

    it('rejects dismissals that are not uuids', async () => {
      const res = await request(app)
        .post('/api/stats/dismissals')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ application_ids: ['not-a-uuid'], failed_send_ids: [] });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
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

  describe('Documents API (/api/documents)', () => {
    it('DELETE /api/documents/:id removes the file and detaches it from templates and schedules', async () => {
      const spy = vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [{ path: 'missing.pdf' }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const res = await request(app)
        .delete('/api/documents/doc-1')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ id: 'doc-1' });
      expect(String(spy.mock.calls[0]?.[0])).toContain('DELETE FROM documents');
      expect(String(spy.mock.calls[1]?.[0])).toContain('email_templates');
      expect(String(spy.mock.calls[2]?.[0])).toContain('email_schedules');
      expect(spy.mock.calls[1]?.[1]).toEqual(['doc-1']);
    });

    it('POST /api/documents/:id/sync returns 404 when document is not found', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [] } as any);

      const res = await request(app)
        .post('/api/documents/non-existent-doc/sync')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Document not found');
    });

    it('POST /api/documents/:id/sync returns 400 when document is not linked to Drive', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ id: 'doc-local', name: 'Resume', path: 'uploads/resume.pdf', drive_url: null }],
      } as any);

      const res = await request(app)
        .post('/api/documents/doc-local/sync')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Document is not linked to Google Drive');
    });

    it('GET /api/documents/daily-sync returns 401 without a token', async () => {
      const res = await request(app).get('/api/documents/daily-sync');
      expect(res.status).toBe(401);
    });

    it('GET /api/documents/daily-sync returns the signed-in user preference', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ daily_document_sync: false, daily_document_synced_at: null }],
      } as any);

      const res = await request(app)
        .get('/api/documents/daily-sync')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ enabled: false, last_synced_at: null });
    });

    it('PUT /api/documents/daily-sync returns 400 when enabled is not a boolean', async () => {
      const res = await request(app)
        .put('/api/documents/daily-sync')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ enabled: 'yes' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'enabled must be a boolean');
    });

    it('PUT /api/documents/daily-sync turns daily refetch on and refreshes that user', async () => {
      const query = vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rowCount: 1, rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({
          rows: [{ daily_document_synced_at: '2026-10-14T04:00:00.000Z' }],
        } as any);

      const res = await request(app)
        .put('/api/documents/daily-sync')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ enabled: true });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        enabled: true,
        last_synced_at: '2026-10-14T04:00:00.000Z',
      });
      expect(String(query.mock.calls[0]?.[0])).toContain('daily_document_sync = TRUE');
      expect(String(query.mock.calls[1]?.[0])).toContain('created_by = $1');
      expect(query.mock.calls[1]?.[1]).toEqual(['u-1']);
    });

    it('PUT /api/documents/daily-sync turns daily refetch off without downloading files', async () => {
      const query = vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ daily_document_synced_at: '2026-10-13T04:00:00.000Z' }],
      } as any);

      const res = await request(app)
        .put('/api/documents/daily-sync')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        enabled: false,
        last_synced_at: '2026-10-13T04:00:00.000Z',
      });
      expect(query).toHaveBeenCalledTimes(1);
      expect(String(query.mock.calls[0]?.[0])).toContain('daily_document_sync = FALSE');
    });
  });

  describe('Auth profile (/api/auth)', () => {
    it('PATCH /api/auth/profile stores trimmed unique target roles', async () => {
      const query = vi.spyOn(pool, 'query').mockResolvedValue({
        rows: [{ id: 'u-1', target_roles: ['SDE', 'SDE1'] }],
        rowCount: 1,
      } as any);

      const res = await request(app)
        .patch('/api/auth/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ target_roles: [' SDE ', 'SDE1', 'sde', '', '  '] });

      expect(res.status).toBe(200);
      expect(res.body.user.target_roles).toEqual(['SDE', 'SDE1']);
      expect(String(query.mock.calls[0]?.[0])).toContain('target_roles');
      expect(query.mock.calls[0]?.[1]?.[0]).toBe(JSON.stringify(['SDE', 'SDE1']));
    });

    it('GET /api/auth/me returns target roles', async () => {
      const query = vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ id: 'u-1', username: 'user1', target_roles: ['Backend Developer'] }],
      } as any);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.target_roles).toEqual(['Backend Developer']);
      expect(String(query.mock.calls[0]?.[0])).toContain('target_roles');
    });
  });
});

