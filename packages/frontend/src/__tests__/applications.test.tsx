import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import ApplicationsPage from '../app/(dashboard)/applications/page';
import { api } from '../lib/api';
import type { JobApplication } from '../lib/types';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('../lib/api', () => ({
  api: {
    applications: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getEmails: vi.fn(),
    },
    companies: {
      list: vi.fn().mockResolvedValue({
        data: [
          { id: 'comp-1', name: 'Airtel' },
          { id: 'comp-2', name: 'Stripe' },
        ],
      }),
    },
  },
}));

describe('ApplicationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockApps: JobApplication[] = [
    {
      id: 'app-1',
      user_id: 'u1',
      job_id: 'job-1',
      company_name: 'Stripe',
      job_title: 'Software Engineer',
      job_url: 'https://stripe.com/jobs/1',
      status: 'referral_requested',
      platform: 'Direct',
      notes: 'Initial note',
      email_count: 2,
      referral_requested_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      applied_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'app-2',
      user_id: 'u1',
      job_id: 'job-2',
      company_name: 'Airbnb',
      job_title: 'Frontend Engineer',
      job_url: 'https://airbnb.com/jobs/2',
      status: 'not_applied',
      platform: 'Lever',
      notes: null,
      email_count: 0,
      applied_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  it('renders KPI summary cards and lists tracked applications with referral badges', async () => {
    vi.mocked(api.applications.list).mockResolvedValue({
      applications: mockApps,
      total: 2,
    });

    render(<ApplicationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Job Applications')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Referrals Pending')).toBeInTheDocument();
    expect(screen.getByText('Ready to Apply (2d+)')).toBeInTheDocument();

    // Check application items rendered
    expect(screen.getByText('Software Engineer')).toBeInTheDocument();
    expect(screen.getByText('Stripe')).toBeInTheDocument();
    expect(screen.getByText('Frontend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Airbnb')).toBeInTheDocument();

    // Check outreach email count
    expect(screen.getByText('2 emails sent')).toBeInTheDocument();
    expect(screen.getAllByText(/Ready to Apply/).length).toBeGreaterThan(0);
  });

  it('filters applications when clicking a status tab', async () => {
    vi.mocked(api.applications.list).mockResolvedValue({
      applications: [],
      total: 0,
    });

    render(<ApplicationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Job Applications')).toBeInTheDocument();
    });

    const appliedBtn = screen.getByRole('button', { name: /^applied$/i });
    fireEvent.click(appliedBtn);

    await waitFor(() => {
      expect(api.applications.list).toHaveBeenCalledWith({
        search: undefined,
        status: 'applied',
      });
    });
  });

  it('navigates to send page when clicking Ask Referral', async () => {
    vi.mocked(api.applications.list).mockResolvedValue({
      applications: mockApps,
      total: 2,
    });

    render(<ApplicationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Software Engineer')).toBeInTheDocument();
    });

    const askBtns = screen.getAllByText('Ask Referral');
    fireEvent.click(askBtns[0]!);

    expect(mockPush).toHaveBeenCalledWith('/send?jobId=job-1&companyName=Stripe');
  });

  it('opens outreach history modal when clicking on sent emails count', async () => {
    vi.mocked(api.applications.list).mockResolvedValue({
      applications: mockApps,
      total: 2,
    });
    vi.mocked(api.applications.getEmails).mockResolvedValue({
      data: [
        {
          id: 'email-1',
          subject: 'Referral for Backend Role',
          status: 'sent',
          prospect: { first_name: 'Sarah', last_name: 'Connor', email: 'sarah@stripe.com' },
          open_count: 2,
          opened_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        } as any,
      ],
    });

    render(<ApplicationsPage />);

    await waitFor(() => {
      expect(screen.getByText('2 emails sent')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('2 emails sent'));

    await waitFor(() => {
      expect(screen.getByText('Referral Outreach History')).toBeInTheDocument();
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
      expect(screen.getByText('sarah@stripe.com')).toBeInTheDocument();
    });

    const sendHistoryBtn = screen.getByRole('button', { name: /Open in Send History/i });
    expect(sendHistoryBtn).toBeInTheDocument();

    const gmailLink = screen.getByRole('link', { name: /Open in Gmail/i });
    expect(gmailLink).toBeInTheDocument();
    expect(gmailLink).toHaveAttribute(
      'href',
      'https://mail.google.com/mail/u/0/#search/to%3Asarah%40stripe.com%20subject%3A(%22Referral%20for%20Backend%20Role%22)'
    );
    expect(gmailLink).toHaveAttribute('target', '_blank');

    fireEvent.click(sendHistoryBtn);
    expect(mockPush).toHaveBeenCalledWith('/history?search=sarah%40stripe.com');
  });

  it('opens edit modal and saves updates', async () => {
    vi.mocked(api.applications.list).mockResolvedValue({
      applications: mockApps,
      total: 2,
    });
    vi.mocked(api.applications.update).mockResolvedValue({
      ...mockApps[0]!,
      company_name: 'Stripe Inc',
      job_title: 'Staff Engineer',
    });

    render(<ApplicationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Stripe')).toBeInTheDocument();
    });

    const editBtns = screen.getAllByTitle('Edit');
    fireEvent.click(editBtns[0]!);

    await waitFor(() => {
      expect(screen.getByText('Edit Application')).toBeInTheDocument();
    });

    const companyInput = screen.getByDisplayValue('Stripe');
    fireEvent.change(companyInput, { target: { value: 'Stripe Inc' } });

    const saveBtn = screen.getByText('Save Changes');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.applications.update).toHaveBeenCalledWith(
        'app-1',
        expect.objectContaining({
          company_name: 'Stripe Inc',
        })
      );
    });
  });

  it('opens create modal and saves a new application', async () => {
    vi.mocked(api.applications.list).mockResolvedValue({
      applications: [],
      total: 0,
    });
    vi.mocked(api.applications.create).mockResolvedValue({
      id: 'app-new',
      user_id: 'u1',
      company_name: 'OpenAI',
      job_title: 'ML Platform Engineer',
      job_url: 'https://jobs.lever.co/openai/1',
      platform: 'Lever',
      status: 'not_applied',
      notes: 'New opening',
      applied_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    render(<ApplicationsPage />);

    const addBtn = screen.getAllByText(/Add Application|Add First Application/i)[0];
    fireEvent.click(addBtn);

    expect(screen.getByPlaceholderText('e.g. Airtel, Stripe')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('e.g. Airtel, Stripe'), {
      target: { value: 'OpenAI' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. ML Platform Engineer'), {
      target: { value: 'ML Platform Engineer' },
    });
    fireEvent.change(screen.getByPlaceholderText('https://jobs.lever.co/company/...'), {
      target: { value: 'https://jobs.lever.co/openai/1' },
    });

    fireEvent.click(screen.getByText('Save Application'));

    await waitFor(() => {
      expect(api.applications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          company_name: 'OpenAI',
          job_title: 'ML Platform Engineer',
          job_url: 'https://jobs.lever.co/openai/1',
        })
      );
    });
  });
});
