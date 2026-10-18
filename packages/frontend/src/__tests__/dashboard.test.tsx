import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import DashboardPage from '../app/(dashboard)/dashboard/page';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    stats: {
      get: vi.fn(),
      dismiss: vi.fn(),
    },
    applications: {
      update: vi.fn(),
    },
    logs: {
      ingest: vi.fn().mockResolvedValue({ success: true }),
    },
  },
}));

describe('DashboardPage Priority Action Center', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders loading skeleton while stats are being fetched', () => {
    vi.mocked(api.stats.get).mockReturnValue(new Promise(() => {})); // Never resolves

    const { container } = render(<DashboardPage />);
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThan(0);
  });

  it('renders the Priority Action Center first, without summary cards or shortcuts', async () => {
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
        { status: 'not_applied', count: 3 },
        { status: 'referral_requested', count: 5 },
        { status: 'applied', count: 10 },
        { status: 'screening', count: 4 },
        { status: 'interview', count: 3 },
        { status: 'offer', count: 2 },
        { status: 'rejected', count: 1 },
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
          prospect: { first_name: 'Jane', last_name: 'Doe', email: 'jane@acme.com' },
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
      readyToApplyApplications: [
        {
          id: 'app-ready-1',
          user_id: 'u1',
          company_name: 'Stripe',
          job_title: 'Backend Engineer',
          status: 'referral_requested',
          email_count: 2,
          referral_requested_at: new Date(Date.now() - 3 * 86400000).toISOString(),
          job_url: 'https://stripe.com/jobs/backend',
          applied_at: new Date().toISOString(),
        },
      ],
      readyToApplyCount: 1,
      referralSentApplications: [
        {
          id: 'app-sent-1',
          user_id: 'u1',
          company_name: 'Figma',
          job_title: 'Product Engineer',
          status: 'referral_requested',
          email_count: 5,
          job_id: 'job-figma',
          job_url: 'https://figma.com/jobs/product',
          applied_at: new Date().toISOString(),
          referral_requested_at: new Date().toISOString(),
        },
      ],
      referralSentCount: 1,
      notAppliedApplications: [
        {
          id: 'app-not-applied-1',
          user_id: 'u1',
          company_name: 'Airbnb',
          job_title: 'Design Technologist',
          status: 'not_applied',
          platform: 'Lever',
          job_url: 'https://airbnb.com/jobs/design',
          created_at: new Date().toISOString(),
          applied_at: new Date().toISOString(),
        },
      ],
      notAppliedCount: 1,
      activeInterviewApplications: [
        {
          id: 'app-interview-1',
          user_id: 'u1',
          company_name: 'Google',
          job_title: 'Staff Frontend Engineer',
          status: 'interview',
          platform: 'Direct',
          applied_at: new Date().toISOString(),
        },
      ],
      activeInterviewCount: 1,
      failedSends: [
        {
          id: 'send-failed-1',
          recipient_email: 'fail@target.com',
          status: 'failed',
          subject: 'Outreach to lead',
          error_message: 'Recipient address bounced',
          created_at: new Date().toISOString(),
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
    };

    vi.mocked(api.stats.get).mockResolvedValue(mockStats as any);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Priority Action Center')).toBeInTheDocument();
    });

    expect(screen.queryByText('Mission Control')).not.toBeInTheDocument();
    expect(screen.queryByText('Live Sync')).not.toBeInTheDocument();
    expect(screen.queryByText('Direct Shortcuts')).not.toBeInTheDocument();
    expect(screen.queryByText('Active Pipeline')).not.toBeInTheDocument();
    expect(screen.queryByText('Outreach & Opens')).not.toBeInTheDocument();
    expect(screen.queryByText('Prospects Network')).not.toBeInTheDocument();

    // Check Priority Action Center
    expect(screen.getByText('Priority Action Center')).toBeInTheDocument();

    // Check Ready to Apply Item
    expect(screen.getByText('Stripe')).toBeInTheDocument();
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText(/Referral window expired/)).toBeInTheDocument();
    expect(screen.getByText('2 referral emails sent')).toBeInTheDocument();
    expect(screen.getByText('5 referral emails sent')).toBeInTheDocument();
    expect(screen.getByText('Figma')).toBeInTheDocument();
    expect(screen.getByText('Referral Sent (1)')).toBeInTheDocument();
    expect(screen.getByText('Follow-up Note')).toBeInTheDocument();

    // Check Saved Job Item
    expect(screen.getByText('Airbnb')).toBeInTheDocument();
    expect(screen.getByText('Design Technologist')).toBeInTheDocument();
    expect(screen.getByText('Ask Referral')).toBeInTheDocument();

    // Check Active Interview Item
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Staff Frontend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Send Update Note')).toBeInTheDocument();

    // Check Failed Send Item
    expect(screen.getByText('fail@target.com')).toBeInTheDocument();
    expect(screen.getByText('Delivery Failed')).toBeInTheDocument();
    expect(screen.getByText('Recipient address bounced')).toBeInTheDocument();
    expect(screen.getByText('Retry Send')).toBeInTheDocument();

    // Check Live Email Feed with Gmail Search Link
    expect(screen.getByText('Recent Dispatches & Live Opens')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('👁 2 opens')).toBeInTheDocument();
    expect(screen.getByText('Gmail Thread ↗')).toBeInTheDocument();

    // Test 1-click status update on Ready to Apply
    const markAppliedBtn = screen.getByText('✓ Mark as Applied');
    fireEvent.click(markAppliedBtn);
    await waitFor(() => {
      expect(api.applications.update).toHaveBeenCalledWith('app-ready-1', { status: 'applied' });
    });

    // Test Mark as Expired button
    const markExpiredButtons = screen.getAllByText('✕ Mark Expired');
    expect(markExpiredButtons.length).toBeGreaterThan(0);
    fireEvent.click(markExpiredButtons[0]);
    await waitFor(() => {
      expect(api.applications.update).toHaveBeenCalledWith('app-not-applied-1', { status: 'closed' });
    });

    // Test Dismiss action button
    const dismissButtons = screen.getAllByTitle('Dismiss from action queue');
    expect(dismissButtons.length).toBeGreaterThan(0);
    expect(dismissButtons[0]?.className).toContain('absolute');
    expect(dismissButtons[0]?.className).toContain('md:static');
    fireEvent.click(dismissButtons[0]);
    await waitFor(() => {
      expect(api.applications.update).toHaveBeenCalledWith('app-sent-1', { status: 'closed' });
    });
  });

  it('allows filtering by action category in Priority Action Center', async () => {
    const mockStats = {
      companies: 5,
      prospects: 10,
      templates: 2,
      applications: 5,
      emails: { total: 10, sent: 10, failed: 0, pending: 0, opened: 5, openRate: 50 },
      readyToApplyApplications: [
        {
          id: 'app-ready-1',
          user_id: 'u1',
          company_name: 'Stripe',
          job_title: 'Backend Engineer',
          status: 'referral_requested',
          email_count: 1,
          referral_requested_at: new Date(Date.now() - 3 * 86400000).toISOString(),
          applied_at: new Date().toISOString(),
        },
      ],
      readyToApplyCount: 1,
      notAppliedApplications: [
        {
          id: 'app-not-applied-1',
          user_id: 'u1',
          company_name: 'Airbnb',
          job_title: 'Design Technologist',
          status: 'not_applied',
          created_at: new Date().toISOString(),
          applied_at: new Date().toISOString(),
        },
      ],
      notAppliedCount: 1,
      activeInterviewApplications: [],
      activeInterviewCount: 0,
      failedSends: [],
      recentSends: [],
      recentApplications: [],
      upcomingSchedules: [],
    };

    vi.mocked(api.stats.get).mockResolvedValue(mockStats as any);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Priority Action Center')).toBeInTheDocument();
    });

    // Click "Referral Expired" tab filter
    const referralTab = screen.getByText(/Referral Expired \(1\)/);
    fireEvent.click(referralTab);

    expect(screen.getByText('Stripe')).toBeInTheDocument();
    expect(screen.queryByText('Airbnb')).not.toBeInTheDocument();

    // Click "Saved Jobs" tab filter
    const savedTab = screen.getByText(/Saved Jobs \(1\)/);
    fireEvent.click(savedTab);

    expect(screen.getByText('Airbnb')).toBeInTheDocument();
    expect(screen.queryByText('Stripe')).not.toBeInTheDocument();
  });

  it('renders graceful zero state when there are no action items or recent activity', async () => {
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
      recentSends: [],
      recentApplications: [],
      readyToApplyApplications: [],
      readyToApplyCount: 0,
      notAppliedApplications: [],
      notAppliedCount: 0,
      activeInterviewApplications: [],
      activeInterviewCount: 0,
      failedSends: [],
      upcomingSchedules: [],
    };

    vi.mocked(api.stats.get).mockResolvedValue(emptyStats as any);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Priority Action Center')).toBeInTheDocument();
    });

    expect(screen.queryByText('Mission Control')).not.toBeInTheDocument();
    expect(screen.getByText('All caught up! No urgent action items.')).toBeInTheDocument();
    expect(screen.getByText('No outreach emails sent yet.')).toBeInTheDocument();
    expect(screen.getByText('No upcoming outreach scheduled.')).toBeInTheDocument();
    expect(screen.getByText('No job applications recorded yet.')).toBeInTheDocument();
  });

  it('uploads dismissals stored in this browser before loading the server list', async () => {
    localStorage.setItem('crm_dismissed_actions', JSON.stringify(['app-old']));
    localStorage.setItem('crm_dismissed_failed_sends', JSON.stringify(['send-old']));
    vi.mocked(api.stats.dismiss).mockResolvedValue({ closed: 1, dismissed: 1 });
    vi.mocked(api.stats.get).mockResolvedValue({
      companies: 1,
      prospects: 1,
      templates: 1,
      applications: 1,
      emails: { total: 1, sent: 1, failed: 0, pending: 0, opened: 0, openRate: 0 },
      readyToApplyApplications: [],
      readyToApplyCount: 0,
      notAppliedApplications: [],
      notAppliedCount: 0,
      activeInterviewApplications: [],
      activeInterviewCount: 0,
      failedSends: [],
      recentSends: [],
      recentApplications: [],
      upcomingSchedules: [],
    } as any);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(api.stats.dismiss).toHaveBeenCalledWith(['app-old'], ['send-old']);
    });
    expect(localStorage.getItem('crm_dismissed_actions')).toBeNull();
    expect(localStorage.getItem('crm_dismissed_failed_sends')).toBeNull();
    expect(api.stats.get).toHaveBeenCalled();
    expect(await screen.findByText('All caught up! No urgent action items.')).toBeInTheDocument();
  });

  it('dismisses a failed send through the server instead of this browser', async () => {
    vi.mocked(api.stats.dismiss).mockResolvedValue({ closed: 0, dismissed: 1 });
    vi.mocked(api.stats.get).mockResolvedValue({
      companies: 1,
      prospects: 1,
      templates: 1,
      applications: 1,
      emails: { total: 1, sent: 1, failed: 1, pending: 0, opened: 0, openRate: 0 },
      readyToApplyApplications: [],
      readyToApplyCount: 0,
      notAppliedApplications: [],
      notAppliedCount: 0,
      activeInterviewApplications: [],
      activeInterviewCount: 0,
      failedSends: [{ id: 'send-failed-test', recipient_email: 'fail@test.com', status: 'failed', error_message: 'bounced' }],
      recentSends: [],
      recentApplications: [],
      upcomingSchedules: [],
    } as any);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('fail@test.com')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Dismiss alert'));

    await waitFor(() => {
      expect(api.stats.dismiss).toHaveBeenCalledWith([], ['send-failed-test']);
    });
    expect(localStorage.getItem('crm_dismissed_failed_sends')).toBeNull();
    expect(screen.queryByText('fail@test.com')).not.toBeInTheDocument();
  });

  it('renders and dismisses manual prospect items in Priority Action Center', async () => {
    vi.mocked(api.stats.dismiss).mockResolvedValue({ closed: 0, dismissed: 1 });
    vi.mocked(api.stats.get).mockResolvedValue({
      companies: 1,
      prospects: 1,
      templates: 1,
      applications: 1,
      emails: { total: 0, sent: 0, failed: 0, pending: 0, opened: 0, openRate: 0 },
      readyToApplyApplications: [],
      readyToApplyCount: 0,
      notAppliedApplications: [],
      notAppliedCount: 0,
      activeInterviewApplications: [],
      activeInterviewCount: 0,
      failedSends: [],
      recentSends: [],
      recentApplications: [],
      upcomingSchedules: [],
      pendingProspects: [
        {
          id: 'pending-test-1',
          user_id: 'u1',
          first_name: 'Sarah',
          last_name: 'Connor',
          company_name: 'Cyberdyne',
          job_title: 'Security Lead',
          linkedin_url: 'https://linkedin.com/in/sarah-connor',
          dismissed_at: null,
          created_at: new Date().toISOString(),
        },
      ],
      pendingProspectCount: 1,
    } as any);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Manual Prospects (1)')).toBeInTheDocument();
    });

    expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    expect(screen.getByText('Cyberdyne')).toBeInTheDocument();
    expect(screen.getByText('Security Lead')).toBeInTheDocument();
    expect(screen.getByText('Manual Prospect Entry')).toBeInTheDocument();

    const enterDetailsBtn = screen.getByRole('link', { name: 'Enter Details' });
    expect(enterDetailsBtn).toHaveAttribute(
      'href',
      expect.stringContaining('/prospects?new=true')
    );
    expect(enterDetailsBtn).toHaveAttribute(
      'href',
      expect.stringContaining('Sarah')
    );

    fireEvent.click(screen.getByTitle('Dismiss from action queue'));

    await waitFor(() => {
      expect(api.stats.dismiss).toHaveBeenCalledWith([], [], ['pending-test-1']);
    });
    expect(screen.queryByText('Sarah Connor')).not.toBeInTheDocument();
  });

  it('allows marking saved/AI-synced opportunities as ineligible from the Priority Action Center using ✕ Ineligible button', async () => {
    const mockStats = {
      companies: 2,
      prospects: 2,
      templates: 1,
      applications: 2,
      emails: { total: 0, sent: 0, failed: 0, pending: 0, opened: 0, openRate: 0 },
      notAppliedApplications: [
        {
          id: 'app-ai-1',
          user_id: 'u1',
          company_name: 'Stripe',
          job_title: 'Full Stack Engineer',
          status: 'not_applied',
          platform: 'Direct',
          job_url: 'https://stripe.com/jobs/1',
          created_at: new Date().toISOString(),
          applied_at: new Date().toISOString(),
        },
      ],
      notAppliedCount: 1,
      activeInterviewApplications: [],
      activeInterviewCount: 0,
      failedSends: [],
      recentSends: [],
      recentApplications: [],
      upcomingSchedules: [],
    };
    (api.stats.get as any).mockResolvedValue(mockStats);

    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Stripe')).toBeInTheDocument();
    });

    const ineligibleBtn = screen.getByText('✕ Ineligible');
    expect(ineligibleBtn).toBeInTheDocument();
    fireEvent.click(ineligibleBtn);

    await waitFor(() => {
      expect(api.applications.update).toHaveBeenCalledWith('app-ai-1', { status: 'ineligible' });
    });
    expect(screen.queryByText('Stripe')).not.toBeInTheDocument();
  });

  it('renders an error message and retry button when stats fetching fails', async () => {
    vi.mocked(api.stats.get).mockRejectedValueOnce(new Error('A record with that value already exists'));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load dashboard')).toBeInTheDocument();
    });

    expect(screen.getByText('A record with that value already exists')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    expect(api.logs.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('A record with that value already exists'),
        source: 'frontend-dashboard',
      })
    );
  });

  it('re-fetches stats when the retry button is clicked after an error', async () => {
    vi.mocked(api.stats.get).mockRejectedValueOnce(new Error('Network error'));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load dashboard')).toBeInTheDocument();
    });

    const mockStats = {
      companies: 1,
      prospects: 2,
      templates: 1,
      applications: 1,
      emails: { total: 1, sent: 1, failed: 0, pending: 0, opened: 0, openRate: 0 },
      recentSends: [],
      recentApplications: [],
      upcomingSchedules: [],
    };
    vi.mocked(api.stats.get).mockResolvedValueOnce(mockStats as any);

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    await waitFor(() => {
      expect(screen.queryByText('Unable to load dashboard')).not.toBeInTheDocument();
      expect(screen.getByText('Priority Action Center')).toBeInTheDocument();
    });
  });
});

