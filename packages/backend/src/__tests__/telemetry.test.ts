import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { loggedFetch } from '../services/httpClient.js';
import { requestLoggerMiddleware } from '../middleware/requestLogger.js';
import { runMonitoredCron } from '../services/scheduler.js';
import { systemLogger, setAutoTelemetryEnabled } from '../services/systemLogger.js';

describe('Backend Telemetry Infrastructure (Phase 1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setAutoTelemetryEnabled(true);
  });

  afterEach(() => {
    setAutoTelemetryEnabled(null);
    vi.unstubAllGlobals();
  });

  describe('loggedFetch', () => {
    it('logs third-party API calls with source, statusCode, and durationMs', async () => {
      const logSpy = vi.spyOn(systemLogger, 'log').mockResolvedValue(undefined);
      const mockResponse = new Response(JSON.stringify({ email: 'alice@acme.com' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const res = await loggedFetch('https://api.prospeo.io/enrich-person?secret=123', {
        source: 'prospeo',
        purpose: 'enrich_person',
        method: 'POST',
        body: JSON.stringify({ linkedin_url: 'https://linkedin.com/in/alice' }),
      });

      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('PROSPEO API [enrich_person] POST https://api.prospeo.io/enrich-person 200'),
        expect.objectContaining({
          source: 'prospeo',
          method: 'POST',
          path: 'https://api.prospeo.io/enrich-person',
          statusCode: 200,
          skipGithubIssue: true,
        })
      );
    });

    it('logs error and rethrows on network failure', async () => {
      const logSpy = vi.spyOn(systemLogger, 'log').mockResolvedValue(undefined);
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')));

      await expect(
        loggedFetch('https://api.apollo.io/v1/people/match', {
          source: 'apollo',
          purpose: 'enrich_person',
          method: 'POST',
        })
      ).rejects.toThrow('ETIMEDOUT');

      expect(logSpy).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('APOLLO API [enrich_person] POST https://api.apollo.io/v1/people/match failed: ETIMEDOUT'),
        expect.objectContaining({
          source: 'apollo',
          statusCode: 500,
        })
      );
    });
  });

  describe('requestLoggerMiddleware', () => {
    it('attaches x-request-id and logs HTTP API calls', async () => {
      const logSpy = vi.spyOn(systemLogger, 'log').mockResolvedValue(undefined);
      const testApp = express();
      testApp.use(requestLoggerMiddleware);
      testApp.post('/api/prospects', (_req, res) => {
        res.status(201).json({ ok: true });
      });
      testApp.get('/api/logs', (_req, res) => {
        res.json({ data: [] });
      });

      const res = await request(testApp).post('/api/prospects');
      expect(res.status).toBe(201);
      expect(res.headers['x-request-id']).toBeTruthy();
      expect(logSpy).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('HTTP POST /api/prospects 201'),
        expect.objectContaining({
          source: 'http',
          method: 'POST',
          path: '/api/prospects',
          statusCode: 201,
        })
      );

      logSpy.mockClear();
      await request(testApp).get('/api/logs');
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('runMonitoredCron', () => {
    it('logs started and completed events with result and duration', async () => {
      const infoSpy = vi.spyOn(systemLogger, 'info').mockResolvedValue(undefined);

      const res = await runMonitoredCron('job_email_sync', async () => ({ discovered: 3 }));
      expect(res).toEqual({ discovered: 3 });
      expect(infoSpy).toHaveBeenCalledWith(
        'Cron job started: job_email_sync',
        expect.objectContaining({ source: 'cron', context: { jobName: 'job_email_sync', phase: 'started' } })
      );
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cron job completed: job_email_sync'),
        expect.objectContaining({
          source: 'cron',
          context: expect.objectContaining({ jobName: 'job_email_sync', phase: 'completed', result: { discovered: 3 } }),
        })
      );
    });

    it('logs error and returns undefined when cron job throws', async () => {
      vi.spyOn(systemLogger, 'info').mockResolvedValue(undefined);
      const errSpy = vi.spyOn(systemLogger, 'error').mockResolvedValue(undefined);

      const res = await runMonitoredCron('scheduled_emails', async () => {
        throw new Error('DB connection lost');
      });

      expect(res).toBeUndefined();
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cron job failed: scheduled_emails'),
        expect.any(Error),
        expect.objectContaining({
          source: 'cron',
          context: expect.objectContaining({ jobName: 'scheduled_emails', phase: 'failed' }),
        })
      );
    });
  });
});
