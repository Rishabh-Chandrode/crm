import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import applicationsRouter from '../routes/applications.js';
import { unwrapTrackingUrl, detectPlatformFromUrl, extractJobsFromEmail } from '../services/jobEmailSync/jobExtractor.js';
import { pool } from '../db/index.js';

vi.mock('../db/index.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../services/jobEmailSync/syncOrchestrator.js', () => ({
  syncJobEmailsForUser: vi.fn().mockResolvedValue({
    discovered: 2,
    updated: 1,
    scanned: 5,
    skipped: 2,
  }),
  syncAllActiveUsers: vi.fn().mockResolvedValue(2),
}));

const app = express();
app.use(express.json());
// Mock authenticated user middleware
app.use((req, _res, next) => {
  req.user = { id: 'test-user-uuid', username: 'testuser', role: 'user' };
  next();
});
app.use('/api/applications', applicationsRouter);

describe('Job Email Sync & Extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('unwrapTrackingUrl', () => {
    it('unwraps Google redirect wrapper links', () => {
      const wrapped = 'https://www.google.com/url?q=https%3A%2F%2Fboards.greenhouse.io%2Fstripe%2Fjobs%2F123&sa=D&source=docs';
      const unwrapped = unwrapTrackingUrl(wrapped);
      expect(unwrapped).toBe('https://boards.greenhouse.io/stripe/jobs/123');
    });

    it('strips tracking parameters from LinkedIn links', () => {
      const tracking = 'https://www.linkedin.com/jobs/view/4012345678/?refId=abcdef&trackingId=xyz123&utm_source=email';
      const clean = unwrapTrackingUrl(tracking);
      expect(clean).toBe('https://www.linkedin.com/jobs/view/4012345678/');
    });

    it('converts /comm/jobs/view/ into public /jobs/view/', () => {
      const commUrl = 'https://www.linkedin.com/comm/jobs/view/4012345678/?midToken=123';
      const clean = unwrapTrackingUrl(commUrl);
      expect(clean).toBe('https://www.linkedin.com/jobs/view/4012345678/');
    });
  });

  describe('detectPlatformFromUrl', () => {
    it('correctly maps known career platforms', () => {
      expect(detectPlatformFromUrl('https://www.linkedin.com/jobs/view/123')).toBe('LinkedIn');
      expect(detectPlatformFromUrl('https://www.naukri.com/job-listings-react-developer')).toBe('Naukri');
      expect(detectPlatformFromUrl('https://boards.greenhouse.io/airbnb/jobs/456')).toBe('Greenhouse');
      expect(detectPlatformFromUrl('https://jobs.lever.co/netflix/789')).toBe('Lever');
      expect(detectPlatformFromUrl('https://randomcareer.com/job/1')).toBe('Email');
    });
  });

  describe('extractJobsFromEmail', () => {
    it('extracts multiple jobs with clean titles and companies from email HTML', () => {
      const html = `
        <div>
          <h2>Recommended Jobs for You</h2>
          <div class="job-card">
            <a href="https://www.linkedin.com/comm/jobs/view/1001/?trk=alert">Senior Backend Engineer at Stripe</a>
          </div>
          <div class="job-card">
            <a href="https://boards.greenhouse.io/figma/jobs/2002">Full Stack Developer at Figma</a>
          </div>
          <div>
            <a href="https://linkedin.com/legal/privacy-policy">Privacy Policy</a>
            <a href="https://linkedin.com/e/unsubscribe">Unsubscribe</a>
          </div>
        </div>
      `;

      const jobs = extractJobsFromEmail('10 New Job Recommendations', html, '');
      expect(jobs.length).toBe(2);

      expect(jobs[0]?.title).toBe('Senior Backend Engineer');
      expect(jobs[0]?.companyName).toBe('Stripe');
      expect(jobs[0]?.platform).toBe('LinkedIn');

      expect(jobs[1]?.title).toBe('Full Stack Developer');
      expect(jobs[1]?.companyName).toBe('Figma');
      expect(jobs[1]?.platform).toBe('Greenhouse');
    });
  });

  describe('Applications API Endpoints', () => {
    it('POST /api/applications/sync-emails triggers email sync and returns counts', async () => {
      const res = await request(app).post('/api/applications/sync-emails');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        discovered: 2,
        updated: 1,
        scanned: 5,
        skipped: 2,
      });
    });

    it('GET /api/applications/preferences retrieves stored candidate preferences', async () => {
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          candidate_preferences: {
            target_roles: ['Full Stack Engineer'],
            target_skills: ['React', 'Node.js'],
            preferred_locations: ['Remote'],
            remote_only: true,
          },
        }],
      });

      const res = await request(app).get('/api/applications/preferences');
      expect(res.status).toBe(200);
      expect(res.body.data.target_roles).toContain('Full Stack Engineer');
      expect(res.body.data.remote_only).toBe(true);
    });

    it('PUT /api/applications/preferences updates candidate preferences', async () => {
      (pool.query as any)
        .mockResolvedValueOnce({ rows: [{ candidate_preferences: null }] }) // select current
        .mockResolvedValueOnce({ rowCount: 1 }); // update

      const res = await request(app)
        .put('/api/applications/preferences')
        .send({
          target_roles: ['Staff Engineer'],
          target_skills: ['Go', 'Kubernetes'],
          preferred_locations: ['Bangalore'],
          remote_only: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.target_roles).toContain('Staff Engineer');
      expect(res.body.data.target_skills).toContain('Go');
    });

    it('GET /api/applications/preferences falls back to profile columns when candidate_preferences is empty', async () => {
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          candidate_preferences: {},
          target_roles: ['DevOps Engineer'],
          skills: ['Docker', 'Terraform'],
          years_of_experience: '4',
          expected_ctc: '$130k',
          location: 'San Francisco, CA',
        }],
      });

      const res = await request(app).get('/api/applications/preferences');
      expect(res.status).toBe(200);
      expect(res.body.data.target_roles).toContain('DevOps Engineer');
      expect(res.body.data.target_skills).toContain('Docker');
      expect(res.body.data.preferred_locations).toContain('San Francisco, CA');
      expect(res.body.data.min_experience_years).toBe(4);
      expect(res.body.data.min_salary).toBe('$130k');
    });
  });
});
