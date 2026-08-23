import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import cron from 'node-cron';
import { pool } from '../db/index.js';
import { startScheduler, processPendingSchedules } from '../services/scheduler.js';

describe('Scheduler Service & Neon DB Auto-Suspend Optimization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('pool is configured with 10s idleTimeoutMillis to allow Neon compute to auto-suspend after 5 min', () => {
    expect((pool as any).options.idleTimeoutMillis).toBe(10_000);
    expect((pool as any).options.connectionTimeoutMillis).toBe(10_000);
    expect((pool as any).options.max).toBe(10);
  });

  it('startScheduler registers 30-minute cron by default and does not run Drive sync cron', () => {
    const scheduleSpy = vi.spyOn(cron, 'schedule').mockReturnValue({} as any);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    startScheduler();

    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect(scheduleSpy).toHaveBeenCalledWith('*/30 * * * *', expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('polling every 30 minutes'));
  });

  it('startScheduler respects custom cron parameter if provided', () => {
    const scheduleSpy = vi.spyOn(cron, 'schedule').mockReturnValue({} as any);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    startScheduler('0,30 * * * *');

    expect(scheduleSpy).toHaveBeenCalledWith('0,30 * * * *', expect.any(Function));
  });

  it('processPendingSchedules returns 0 when no schedules are pending', async () => {
    vi.spyOn(pool, 'query').mockResolvedValueOnce({ rows: [] } as any);

    const count = await processPendingSchedules();

    expect(count).toBe(0);
  });

  it('processPendingSchedules queries and completes batch processing for due schedules', async () => {
    const mockSchedule = {
      id: 'sched-123',
      template_id: null,
      company_id: null,
      prospect_ids: ['prospect-1'],
      custom_values: {},
      scheduled_for: new Date(),
      document_ids: [],
      created_by: 'user-1',
      subject: 'Test Subject',
      body: 'Test Body',
    };

    const querySpy = vi.spyOn(pool, 'query')
      // 1. Initial pending query
      .mockResolvedValueOnce({ rows: [mockSchedule] } as any)
      // 2. Status update to sending
      .mockResolvedValueOnce({ rows: [] } as any)
      // 3. User query (Gmail credentials check)
      .mockResolvedValueOnce({
        rows: [{
          username: 'tester',
          first_name: 'Test',
          last_name: 'User',
          email: 'test@example.com',
          gmail_user: 'test@example.com',
          gmail_app_password: 'app-password-123',
        }],
      } as any)
      // 4. Prospect query
      .mockResolvedValueOnce({
        rows: [{ id: 'prospect-1', email: 'lead@example.com', first_name: 'Jane' }],
      } as any)
      // 5. Existing sends query
      .mockResolvedValueOnce({ rows: [] } as any)
      // 6. Insert into email_sends
      .mockResolvedValueOnce({ rows: [{ id: 'send-1' }] } as any)
      // 7. Update send to sent
      .mockResolvedValueOnce({ rows: [] } as any)
      // 8. Update email_schedules to sent
      .mockResolvedValueOnce({ rows: [] } as any);

    vi.spyOn(console, 'log').mockImplementation(() => {});

    const count = await processPendingSchedules();

    expect(count).toBe(1);
    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining("WHERE status = 'pending' AND scheduled_for <= NOW()"),
    );
  });

  it('processPendingSchedules marks schedule as failed when an individual schedule error occurs', async () => {
    const mockSchedule = {
      id: 'sched-fail-1',
      template_id: null,
      company_id: null,
      prospect_ids: ['prospect-1'],
      custom_values: {},
      scheduled_for: new Date(),
      document_ids: [],
      created_by: 'user-no-gmail',
      subject: 'Test Subject',
      body: 'Test Body',
    };

    const querySpy = vi.spyOn(pool, 'query')
      // 1. Pending schedules query
      .mockResolvedValueOnce({ rows: [mockSchedule] } as any)
      // 2. Update to sending
      .mockResolvedValueOnce({ rows: [] } as any)
      // 3. Prospects query
      .mockResolvedValueOnce({ rows: [{ id: 'prospect-1', email: 'lead@example.com' }] } as any)
      // 4. User query (no gmail configured)
      .mockResolvedValueOnce({ rows: [] } as any)
      // 5. Update to failed
      .mockResolvedValueOnce({ rows: [] } as any);

    vi.spyOn(console, 'log').mockImplementation(() => {});

    const count = await processPendingSchedules();

    expect(count).toBe(1);
    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE email_schedules SET status = 'failed'"),
      expect.arrayContaining(['Gmail not connected. Go to Settings → Gmail to connect your account.', 'sched-fail-1']),
    );
  });

  it('processPendingSchedules handles top-level poll query errors gracefully without crashing', async () => {
    vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('Neon connection failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const count = await processPendingSchedules();

    expect(count).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith('Scheduler poll error:', expect.any(Error));
  });
});
