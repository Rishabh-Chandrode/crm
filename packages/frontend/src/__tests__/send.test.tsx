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

  it('picks a template and defaults the version dropdown to the latest version', async () => {
    vi.mocked(api.templates.list).mockResolvedValue({
      data: [
        {
          id: 't-1',
          family_id: 'fam-1',
          name: 'Referral Request',
          version: 1,
          subject: 'Old subject',
          body: 'Old body',
          variables: [],
          document_ids: [],
          deleted_at: null,
        },
        {
          id: 't-2',
          family_id: 'fam-1',
          name: 'Referral Request',
          version: 2,
          subject: 'New subject',
          body: 'New body',
          variables: [],
          document_ids: [],
          deleted_at: null,
        },
        {
          id: 't-3',
          family_id: 'fam-2',
          name: 'Follow Up',
          version: 1,
          subject: 'Following up',
          body: 'Hello',
          variables: [],
          document_ids: [],
          deleted_at: null,
        },
      ] as any,
    });

    render(<SendPage />);

    await waitFor(() => {
      expect(screen.getByText('Choose a template…')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Choose a template…'));
    expect(screen.getByRole('option', { name: 'Follow Up' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Referral Request v2' })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Referral Request' }));

    await waitFor(() => {
      expect(screen.getByText('v2')).toBeInTheDocument();
    });
    expect(screen.getByText('Subject: New subject')).toBeInTheDocument();

    fireEvent.click(screen.getByText('v2'));
    fireEvent.mouseDown(screen.getByRole('option', { name: /^v1/ }));
    expect(screen.getByText('Subject: Old subject')).toBeInTheDocument();
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

  it('checks every prospect when All is selected by default', async () => {
    mockSearchParams.set('companyId', 'comp-1');
    vi.mocked(api.prospects.list).mockResolvedValue({
      data: [
        { id: 'p1', first_name: 'Ada', last_name: 'Lovelace', email: 'ada@airtel.in', role_category: 'engineer' },
        { id: 'p2', first_name: 'Grace', last_name: 'Hopper', email: 'grace@airtel.in', role_category: 'hr' },
      ] as any,
      total: 2,
    });

    render(<SendPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'All (2)' })).toBeInTheDocument();
    });

    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes.every((box) => (box as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText(/Sending to all 2 prospects/)).toBeInTheDocument();

    fireEvent.click(boxes[0]);
    await waitFor(() => {
      expect(screen.getByText('1 of 2 selected')).toBeInTheDocument();
    });
    expect((boxes[0] as HTMLInputElement).checked).toBe(false);
    expect((boxes[1] as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'All (2)' }));
    await waitFor(() => {
      expect(screen.getByText(/Sending to all 2 prospects/)).toBeInTheDocument();
    });
    expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(true);
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
