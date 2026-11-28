import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import AdminMonitoringPage from '../app/(dashboard)/admin/page';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    auth: { me: vi.fn() },
    admin: { monitoring: vi.fn() },
  },
}));

describe('Admin Monitoring Dashboard (/admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Access Restricted for non-admin users', async () => {
    vi.mocked(api.auth.me).mockResolvedValue({ user: { role: 'user' } as any });

    render(<AdminMonitoringPage />);

    await waitFor(() => {
      expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    });
    expect(api.admin.monitoring).not.toHaveBeenCalled();
  });

  it('renders application totals, cron jobs, source telemetry, and recent errors for admin', async () => {
    vi.mocked(api.auth.me).mockResolvedValue({ user: { role: 'admin' } as any });
    vi.mocked(api.admin.monitoring).mockResolvedValue({
      data: {
        users: { total: 10, active: 8, admins: 1, gmailConnected: 6, jobSyncEnabled: 5 },
        applicationTotals: {
          companies: 40,
          prospects: 120,
          templates: 12,
          emailsSent: 300,
          emailsFailed: 3,
          emailsPending: 2,
          jobs: 85,
          applications: 50,
        },
        cronJobs: [
          {
            jobName: 'job_email_sync',
            lastPhase: 'completed',
            lastRunAt: '2026-11-28T10:00:00Z',
            durationMs: 450,
            lastMessage: 'Cron job completed: job_email_sync (450ms)',
          },
        ],
        sourceTelemetry: [
          {
            source: 'prospeo',
            total24h: 25,
            errors24h: 1,
            warnings24h: 2,
            avgDurationMs: 310,
            lastEventAt: '2026-11-28T10:05:00Z',
          },
        ],
        recentErrors: [
          {
            id: 'err-1',
            level: 'error',
            message: 'Prospeo rate limit hit',
            source: 'prospeo',
            created_at: '2026-11-28T10:05:00Z',
          },
        ],
      },
    });

    render(<AdminMonitoringPage />);

    await waitFor(() => {
      expect(screen.getByText('Admin System Monitoring')).toBeInTheDocument();
      expect(screen.getByText('8 / 10')).toBeInTheDocument();
    });

    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.getByText('job_email_sync')).toBeInTheDocument();
    expect(screen.getAllByText('prospeo').length).toBeGreaterThan(0);
    expect(screen.getByText('Prospeo rate limit hit')).toBeInTheDocument();
  });
});
