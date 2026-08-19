import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import DashboardPage from '../app/(dashboard)/dashboard/page';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    stats: {
      get: vi.fn(),
    },
  },
}));

describe('DashboardPage (Antigravity Redesign)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton while stats are being fetched', () => {
    vi.mocked(api.stats.get).mockReturnValue(new Promise(() => {})); // Never resolves

    const { container } = render(<DashboardPage />);
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThan(0);
  });

  it('renders dashboard with stats, KPIs, and pipeline stages when data loads', async () => {
    const mockStats = {
      companies: 12,
      prospects: 48,
      templates: 5,
      applications: 20,
      emails: {
        total: 100,
        sent: 85,
        failed: 15,
        pending: 0,
        opened: 42,
        openRate: 49,
      },
      applicationsByStatus: [
        { status: 'applied', count: 10 },
        { status: 'screening', count: 4 },
        { status: 'interview', count: 3 },
        { status: 'offer', count: 2 },
        { status: 'rejected', count: 1 },
      ],
      prospectsByCategory: [
        { category: 'engineer', count: 30 },
        { category: 'hr', count: 18 },
      ],
      topCompanies: [
        { name: 'Acme Corp', count: 8 },
        { name: 'Globex Inc', count: 4 },
      ],
      recentSends: [
        {
          id: 'send-1',
          user_id: 'u1',
          recipient_email: 'jane@acme.com',
          status: 'sent',
          subject: 'Engineering inquiry',
          created_at: new Date().toISOString(),
          open_count: 2,
          prospect: { first_name: 'Jane', last_name: 'Doe' },
        },
      ],
      recentApplications: [
        {
          id: 'app-1',
          user_id: 'u1',
          company_name: 'Acme Corp',
          job_title: 'Senior Engineer',
          status: 'applied',
          platform: 'LinkedIn',
          job_url: 'https://linkedin.com/jobs/123',
          applied_at: new Date().toISOString(),
        },
      ],
      upcomingSchedules: [
        {
          id: 'sched-1',
          user_id: 'u1',
          status: 'pending',
          scheduled_for: new Date(Date.now() + 86400000).toISOString(),
          total_prospects: 5,
          company: { name: 'Acme Corp' },
        },
      ],
      dailyActivity: [
        { day: '2026-08-18', sent: 10, failed: 1 },
        { day: '2026-08-19', sent: 15, failed: 0 },
      ],
    };

    vi.mocked(api.stats.get).mockResolvedValue(mockStats as any);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Mission Control')).toBeInTheDocument();
    });

    // Check Live Sync status badge
    expect(screen.getByText('Live Sync')).toBeInTheDocument();

    // Check KPI Values
    expect(screen.getByText('49%')).toBeInTheDocument(); // Open Rate
    expect(screen.getByText('48')).toBeInTheDocument(); // Prospects
    expect(screen.getByText('12')).toBeInTheDocument(); // Companies
    expect(screen.getByText('5')).toBeInTheDocument(); // Templates

    // Check Pipeline Stages
    expect(screen.getByText('Application Pipeline Stages')).toBeInTheDocument();
    expect(screen.getAllByText('Applied').length).toBeGreaterThan(0);
    expect(screen.getByText('Interviewing')).toBeInTheDocument();
    expect(screen.getByText('Offers')).toBeInTheDocument();

    // Check Recent Dispatches and Applications
    expect(screen.getByText('Recent Dispatches')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Senior Engineer')).toBeInTheDocument();
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0);

    // Check Action Buttons
    expect(screen.getByRole('link', { name: /Compose \/ Send/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Add Prospect/i })).toBeInTheDocument();
  });

  it('renders graceful empty states when collections are empty', async () => {
    const emptyStats = {
      companies: 0,
      prospects: 0,
      templates: 0,
      applications: 0,
      emails: {
        total: 0,
        sent: 0,
        failed: 0,
        pending: 0,
        opened: 0,
        openRate: 0,
      },
      applicationsByStatus: [],
      prospectsByCategory: [],
      topCompanies: [],
      recentSends: [],
      recentApplications: [],
      upcomingSchedules: [],
      dailyActivity: [],
    };

    vi.mocked(api.stats.get).mockResolvedValue(emptyStats as any);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Mission Control')).toBeInTheDocument();
    });

    expect(screen.getByText('No email activity recorded in the last 14 days.')).toBeInTheDocument();
    expect(screen.getByText('No categorized prospects found.')).toBeInTheDocument();
    expect(screen.getByText('No company targets added yet.')).toBeInTheDocument();
    expect(screen.getByText('No outreach emails sent yet.')).toBeInTheDocument();
    expect(screen.getByText('No job applications recorded yet.')).toBeInTheDocument();
    expect(screen.getByText('No upcoming outreach scheduled.')).toBeInTheDocument();
  });
});
