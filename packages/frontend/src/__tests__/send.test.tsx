import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import SendPage from '../app/(dashboard)/send/page';
import { api } from '../lib/api';

const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../lib/api', () => ({
  api: {
    templates: {
      list: vi.fn(),
    },
    companies: {
      list: vi.fn(),
    },
    jobs: {
      list: vi.fn(),
    },
    prospects: {
      list: vi.fn(),
    },
    documents: {
      list: vi.fn(),
    },
    email: {
      send: vi.fn(),
      sendCompany: vi.fn(),
      sendBatch: vi.fn(),
      quickSend: vi.fn(),
      preview: vi.fn(),
    },
    schedules: {
      create: vi.fn(),
    },
  },
}));

describe('SendPage', () => {
  const mockTemplates = [
    {
      id: 't-1',
      name: 'Referral Request',
      subject: 'Inquiry about {{job_title}} at {{company_name}}',
      body: 'Hi {{first_name}}, I saw the {{job_title}} opening at {{company_name}}.',
      variables: [
        { key: 'first_name', label: 'First Name', source: 'prospect' },
        { key: 'job_title', label: 'Job Title', source: 'custom' },
        { key: 'company_name', label: 'Company Name', source: 'custom' },
      ],
      document_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockCompanies = [
    {
      id: 'comp-1',
      name: 'Airtel',
      website: 'https://airtel.in',
      industry: 'Telecom',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'comp-2',
      name: 'Stripe',
      website: 'https://stripe.com',
      industry: 'Finance',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockJobs = [
    {
      id: 'job-1',
      title: 'Senior Software Engineer',
      job_url: 'https://airtel.in/careers/1',
      company_id: 'comp-1',
      status: 'open',
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      company: { id: 'comp-1', name: 'Airtel' },
    },
    {
      id: 'job-2',
      title: 'Backend Engineer',
      job_url: 'https://stripe.com/jobs/2',
      company_id: 'comp-2',
      status: 'open',
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      company: { id: 'comp-2', name: 'Stripe' },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.delete('jobId');
    mockSearchParams.delete('companyId');
    mockSearchParams.delete('companyName');

    vi.mocked(api.templates.list).mockResolvedValue({ data: mockTemplates as any });
    vi.mocked(api.companies.list).mockResolvedValue({ data: mockCompanies as any });
    vi.mocked(api.jobs.list).mockResolvedValue({ data: mockJobs as any, total: 2 });
    vi.mocked(api.prospects.list).mockResolvedValue({ data: [] as any, total: 0 });
    vi.mocked(api.documents.list).mockResolvedValue({ data: [] as any });
  });

  it('renders send page with mode switch and form fields', async () => {
    render(<SendPage />);

    await waitFor(() => {
      expect(screen.getByText('Send Emails')).toBeInTheDocument();
    });

    expect(screen.getByText('Template Outreach')).toBeInTheDocument();
    expect(screen.getByText('Quick Email')).toBeInTheDocument();
  });

  it('auto-selects company when jobId and companyName are present in search params', async () => {
    mockSearchParams.set('jobId', 'job-1');
    mockSearchParams.set('companyName', 'Airtel');

    render(<SendPage />);

    await waitFor(() => {
      expect(screen.getByText('Senior Software Engineer at Airtel')).toBeInTheDocument();
      expect(screen.getAllByText('Airtel').length).toBeGreaterThan(0);
    });
  });

  it('auto-selects company by matching companyName query param even if companyId is not provided', async () => {
    mockSearchParams.set('companyName', 'Stripe');

    render(<SendPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Stripe').length).toBeGreaterThan(0);
    });
  });

  it('switches to Quick Email mode and renders distinct Subject and Body inputs', async () => {
    vi.mocked(api.email.quickSend).mockResolvedValueOnce({ data: { success: true } } as any);

    render(<SendPage />);

    await waitFor(() => {
      expect(screen.getByText('Quick Email')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Quick Email'));

    expect(screen.getByText('Compose Quick Message')).toBeInTheDocument();
    expect(screen.getByText('To:')).toBeInTheDocument();
    expect(screen.getByText('Subject:')).toBeInTheDocument();

    const toInput = screen.getByPlaceholderText('recipient@example.com');
    const subjectInput = screen.getByPlaceholderText('Email subject line…');
    const bodyInput = screen.getByPlaceholderText('Type your message here...');

    expect(toInput).toBeInTheDocument();
    expect(subjectInput).toBeInTheDocument();
    expect(bodyInput).toBeInTheDocument();

    fireEvent.change(toInput, { target: { value: 'recruiter@example.com' } });
    fireEvent.change(subjectInput, { target: { value: 'Frontend Developer Inquiry' } });
    fireEvent.change(bodyInput, { target: { value: 'Hello, I am interested in this role.' } });

    expect((subjectInput as HTMLInputElement).value).toBe('Frontend Developer Inquiry');
    expect((bodyInput as HTMLTextAreaElement).value).toBe('Hello, I am interested in this role.');

    const sendBtn = screen.getByRole('button', { name: /send now/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(api.email.quickSend).toHaveBeenCalledWith(
        'recruiter@example.com',
        'Frontend Developer Inquiry',
        'Hello, I am interested in this role.',
        [],
        undefined
      );
    });
  });
});
