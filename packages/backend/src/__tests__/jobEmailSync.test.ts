import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import applicationsRouter from '../routes/applications.js';
import { unwrapTrackingUrl, detectPlatformFromUrl, extractJobsFromEmail } from '../services/jobEmailSync/jobExtractor.js';
import { htmlToPlainText } from '../services/jobEmailSync/htmlUtils.js';
import { classifyEmail, extractApplicationUpdateDetails } from '../services/jobEmailSync/jobClassifierAndScorer.js';
import { LlmProviderFactory } from '../services/llm/factory.js';
import { systemLogger } from '../services/systemLogger.js';
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

  describe('htmlToPlainText', () => {
    it('returns empty string for empty or falsy inputs', () => {
      expect(htmlToPlainText('')).toBe('');
      expect(htmlToPlainText(null as any)).toBe('');
    });

    it('strips script, style, head, and noscript tags along with their inner contents', () => {
      const html = `
        <html>
          <head><title>Email Title</title><style>.hidden { display: none; }</style></head>
          <body>
            <script>console.log("tracking code");</script>
            <noscript>Enable JS</noscript>
            <p>Hello Applicant,</p>
          </body>
        </html>
      `;
      const text = htmlToPlainText(html);
      expect(text).toBe('Hello Applicant,');
      expect(text).not.toContain('Email Title');
      expect(text).not.toContain('tracking code');
      expect(text).not.toContain('Enable JS');
    });

    it('converts block elements into newlines and decodes common HTML entities', () => {
      const html = `
        <div>Thank you for applying to Acme &amp; Co!&nbsp;</div>
        <p>Status: &#39;Interview Scheduled&#39; &bull; Round 1</p>
        <br/>
        <div>Salary: &gt; $100k &lt; $150k &quot;Full-Time&quot;</div>
      `;
      const text = htmlToPlainText(html);
      expect(text).toContain('Thank you for applying to Acme & Co!');
      expect(text).toContain("Status: 'Interview Scheduled' • Round 1");
      expect(text).toContain('Salary: > $100k < $150k "Full-Time"');
    });
  });

  describe('AI Prompt Full Context & Purpose', () => {
    it('passes complete body text beyond 1000 characters and purpose to AI provider in classifyEmail', async () => {
      const longBody = 'Important job context paragraph. '.repeat(100); // ~3300 characters
      let capturedPrompt = '';
      let capturedOptions: any = null;

      LlmProviderFactory.setProvider({
        name: 'mock',
        isAvailable: () => true,
        generateText: vi.fn(),
        generateJson: vi.fn().mockImplementation(async (prompt, _sys, options) => {
          capturedPrompt = prompt;
          capturedOptions = options;
          return { category: 'application_update' };
        }),
      });

      const category = await classifyEmail('Update on your application', longBody, 'recruiter@stripe.com');
      expect(category).toBe('application_update');
      expect(capturedPrompt.length).toBeGreaterThan(2000);
      expect(capturedOptions?.purpose).toBe('classify_email');

      LlmProviderFactory.reset();
    });

    it('passes complete body text beyond 1500 characters and purpose to AI provider in extractApplicationUpdateDetails', async () => {
      const longBody = 'Stripe recruiter feedback notes and schedule details. '.repeat(80); // ~4300 characters
      let capturedPrompt = '';
      let capturedOptions: any = null;

      LlmProviderFactory.setProvider({
        name: 'mock',
        isAvailable: () => true,
        generateText: vi.fn(),
        generateJson: vi.fn().mockImplementation(async (prompt, _sys, options) => {
          capturedPrompt = prompt;
          capturedOptions = options;
          return { companyName: 'Stripe', status: 'interview', note: 'Technical interview next week' };
        }),
      });

      const details = await extractApplicationUpdateDetails('Interview with Stripe', longBody, 'jobs@stripe.com');
      expect(details?.companyName).toBe('Stripe');
      expect(details?.status).toBe('interview');
      expect(capturedPrompt.length).toBeGreaterThan(2500);
      expect(capturedOptions?.purpose).toBe('extract_application_update');

      LlmProviderFactory.reset();
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

    it('POST /api/applications creates a new application, auto-resolving company and linking company_id', async () => {
      (pool.query as any)
        // 1. check company
        .mockResolvedValueOnce({ rows: [{ id: 'company-uuid-1' }] })
        // 2. insert jobs
        .mockResolvedValueOnce({ rows: [{ id: 'job-uuid-1' }] })
        // 3. check existing application
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        // 4. insert job_applications
        .mockResolvedValueOnce({
          rows: [{
            id: 'app-uuid-1',
            user_id: 'test-user-uuid',
            company_name: 'Stripe',
            job_title: 'Backend Engineer',
            job_url: 'https://stripe.com/jobs/123',
            platform: 'Generic',
            status: 'not_applied',
            company_id: 'company-uuid-1',
            job_id: 'job-uuid-1',
          }],
        });

      const res = await request(app)
        .post('/api/applications')
        .send({
          company_name: 'Stripe',
          job_title: 'Backend Engineer',
          job_url: 'https://stripe.com/jobs/123',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('app-uuid-1');
      expect(res.body.company_id).toBe('company-uuid-1');
      expect(res.body.company_name).toBe('Stripe');
    });

    it('POST /api/applications returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({
          company_name: 'Stripe',
          // missing job_title and job_url
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('POST /api/applications logs error to systemLogger and returns 500 when database query fails', async () => {
      const errorSpy = vi.spyOn(systemLogger, 'error').mockImplementation(() => {});
      (pool.query as any).mockRejectedValueOnce(new Error('relation job_applications error'));

      const res = await request(app)
        .post('/api/applications')
        .send({
          company_name: 'Stripe',
          job_title: 'Engineer',
          job_url: 'https://stripe.com/jobs/1',
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('relation job_applications error');
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to create/track application',
        expect.any(Error),
        expect.objectContaining({
          source: 'backend',
          statusCode: 500,
          userId: 'test-user-uuid',
        })
      );
    });
  });
});
