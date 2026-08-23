import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config.js';
import jobsRouter from '../routes/jobs.js';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db/index.js';

const app = express();
app.use(express.json());
app.use('/api/jobs', authMiddleware, jobsRouter);

const testUser = { id: 'user-123', username: 'testuser', role: 'user' };
const userToken = jwt.sign(testUser, CONFIG.jwtSecret);

describe('Jobs Routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/jobs', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/jobs');
      expect(res.status).toBe(401);
    });

    it('returns a list of jobs with total count', async () => {
      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [{ count: '2' }] } as any)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'job-1',
              title: 'Senior Backend Engineer',
              job_url: 'https://jobs.lever.co/stripe/1',
              status: 'open',
              company: { id: 'comp-1', name: 'Stripe' },
              email_count: 2,
            },
            {
              id: 'job-2',
              title: 'Frontend Engineer',
              job_url: 'https://careers.airbnb.com/2',
              status: 'referral_requested',
              company: { id: 'comp-2', name: 'Airbnb' },
              email_count: 1,
            },
          ],
        } as any);

      const res = await request(app)
        .get('/api/jobs')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.data[0].title).toBe('Senior Backend Engineer');
    });

    it('filters by status and search', async () => {
      const querySpy = vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [{ count: '1' }] } as any)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'job-1',
              title: 'Senior Backend Engineer',
              job_url: 'https://jobs.lever.co/stripe/1',
              status: 'open',
            },
          ],
        } as any);

      const res = await request(app)
        .get('/api/jobs?status=open&search=Backend')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(querySpy).toHaveBeenCalledTimes(2);
      expect(querySpy.mock.calls[0][0]).toContain('j.status = $');
      expect(querySpy.mock.calls[0][0]).toContain('j.title ILIKE $');
    });
  });

  describe('GET /api/jobs/:id', () => {
    it('returns 404 when job does not exist', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [] } as any);

      const res = await request(app)
        .get('/api/jobs/job-none')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Job not found');
    });

    it('returns job details with linked emails', async () => {
      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'job-1',
              title: 'Staff Engineer',
              job_url: 'https://stripe.com/jobs/1',
              status: 'referral_requested',
              company: { name: 'Stripe' },
            },
          ],
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
        .get('/api/jobs/job-1')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Staff Engineer');
      expect(res.body.data.emails).toHaveLength(1);
      expect(res.body.data.emails[0].prospect.first_name).toBe('Alex');
    });
  });

  describe('POST /api/jobs', () => {
    it('validates required title and job_url', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: '' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('validates status enum', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Software Engineer',
          job_url: 'https://jobs.lever.co/test',
          status: 'invalid_status',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('status must be one of');
    });

    it('creates job with company_id successfully', async () => {
      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'job-new',
              title: 'Software Engineer',
              job_url: 'https://jobs.lever.co/test/1',
              company_id: 'comp-1',
              status: 'open',
              created_by: 'user-123',
            },
          ],
        } as any)
        .mockResolvedValueOnce({
          rows: [{ id: 'comp-1', name: 'OpenAI' }],
        } as any);

      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Software Engineer',
          job_url: 'https://jobs.lever.co/test/1',
          company_id: 'comp-1',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('job-new');
      expect(res.body.data.company.name).toBe('OpenAI');
    });

    it('auto-resolves company by company_name when company_id is omitted', async () => {
      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [{ id: 'comp-existing' }] } as any) // company exists check
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'job-new-2',
              title: 'ML Engineer',
              job_url: 'https://jobs.lever.co/test/2',
              company_id: 'comp-existing',
              status: 'open',
              created_by: 'user-123',
            },
          ],
        } as any) // job insert
        .mockResolvedValueOnce({
          rows: [{ id: 'comp-existing', name: 'Anthropic' }],
        } as any); // company lookup

      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'ML Engineer',
          job_url: 'https://jobs.lever.co/test/2',
          company_name: 'Anthropic',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('ML Engineer');
    });
  });

  describe('PATCH /api/jobs/:id', () => {
    it('updates job fields and creates application when status changed to applied', async () => {
      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({
          rows: [{ company_id: 'comp-1', title: 'Lead Engineer', job_url: 'https://stripe.com/jobs/1' }],
        } as any) // jobInfo
        .mockResolvedValueOnce({ rows: [{ name: 'Stripe' }] } as any) // company name
        .mockResolvedValueOnce({ rows: [] } as any) // existingApp check
        .mockResolvedValueOnce({ rows: [{ id: 'app-1' }] } as any) // insert job_applications
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'job-1',
              title: 'Lead Engineer',
              job_url: 'https://stripe.com/jobs/1',
              status: 'applied',
              company_id: 'comp-1',
            },
          ],
        } as any) // update job
        .mockResolvedValueOnce({
          rows: [{ id: 'comp-1', name: 'Stripe' }],
        } as any); // company lookup

      const res = await request(app)
        .patch('/api/jobs/job-1')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Lead Engineer',
          status: 'applied',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Lead Engineer');
      expect(res.body.data.status).toBe('applied');
    });

    it('cleans up application when status reverted back to open', async () => {
      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rowCount: 1 } as any) // delete job_applications
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'job-1',
              title: 'Lead Engineer',
              job_url: 'https://stripe.com/jobs/1',
              status: 'open',
              company_id: 'comp-1',
            },
          ],
        } as any) // update job
        .mockResolvedValueOnce({
          rows: [{ id: 'comp-1', name: 'Stripe' }],
        } as any); // company lookup

      const res = await request(app)
        .patch('/api/jobs/job-1')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          status: 'open',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('open');
    });
  });

  describe('DELETE /api/jobs/:id', () => {
    it('deletes job successfully', async () => {
      vi.spyOn(pool, 'query').mockResolvedValueOnce({ rowCount: 1 } as any);

      const res = await request(app)
        .delete('/api/jobs/job-1')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('deleted', true);
    });
  });

  describe('GET /api/jobs/:id/emails', () => {
    it('returns emails for job', async () => {
      vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [{ id: 'job-1' }] } as any) // check job exists
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'send-1',
              subject: 'Referral for Backend Role',
              status: 'sent',
              prospect: { first_name: 'Jane', email: 'jane@stripe.com' },
            },
          ],
        } as any);

      const res = await request(app)
        .get('/api/jobs/job-1/emails')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].subject).toBe('Referral for Backend Role');
    });
  });
});
