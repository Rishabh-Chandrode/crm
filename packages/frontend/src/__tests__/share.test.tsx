import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import SharePage from '../app/(dashboard)/share/page';
import { api } from '../lib/api';

const search = vi.hoisted(() => ({ value: '' }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search.value),
}));

vi.mock('../lib/api', () => ({
  api: {
    applications: {
      create: vi.fn(),
    },
    auth: {
      me: vi.fn(),
    },
    prospects: {
      fromLinkedIn: vi.fn(),
      lookup: vi.fn(),
    },
  },
}));

describe('SharePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search.value = '';
    vi.mocked(api.auth.me).mockResolvedValue({ user: { target_roles: [] } } as never);
    vi.mocked(api.prospects.lookup).mockResolvedValue({ data: null, pending: null });
  });

  it('fills the form from a link shared in the text field', () => {
    search.value = `text=${encodeURIComponent('Opening https://jobs.lever.co/acme/123')}&title=${encodeURIComponent('Engineer - Acme')}`;
    render(<SharePage />);

    expect(screen.getByLabelText('Job URL *')).toHaveValue('https://jobs.lever.co/acme/123');
    expect(screen.getByLabelText('Company *')).toHaveValue('acme');
    expect(screen.getByLabelText('Role *')).toHaveValue('Engineer');
    expect(screen.getByLabelText('Platform')).toHaveValue('Lever');
  });

  it('saves the confirmed application', async () => {
    search.value = 'url=https%3A%2F%2Fcareers.example.com%2Fjobs%2F1&title=Designer';
    vi.mocked(api.applications.create).mockResolvedValue({ job_id: 'job-1' } as never);
    render(<SharePage />);

    fireEvent.change(screen.getByLabelText('Company *'), { target: { value: 'Example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save application' }));

    await waitFor(() => {
      expect(api.applications.create).toHaveBeenCalledWith(expect.objectContaining({
        company_name: 'Example',
        job_title: 'Designer',
        job_url: 'https://careers.example.com/jobs/1',
        platform: 'Generic',
        status: 'not_applied',
      }));
    });
    expect(await screen.findByText('Example is in your applications.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Send email' })).toHaveAttribute(
      'href',
      '/send?jobId=job-1&companyName=Example',
    );
  });

  it('fills company and role from chips', async () => {
    search.value = `url=${encodeURIComponent('https://boards.greenhouse.io/acme-corp/jobs/1')}&title=${encodeURIComponent('Engineer at Stripe | LinkedIn')}`;
    vi.mocked(api.auth.me).mockResolvedValue({
      user: { target_roles: ['SDE', 'Backend Developer'] },
    } as never);
    render(<SharePage />);

    expect(screen.getByRole('button', { name: 'Acme Corp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stripe' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'SDE' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Acme Corp' }));
    fireEvent.click(screen.getByRole('button', { name: 'SDE' }));

    expect(screen.getByLabelText('Company *')).toHaveValue('Acme Corp');
    expect(screen.getByLabelText('Role *')).toHaveValue('SDE');
  });

  it('adds a LinkedIn profile as a prospect when email is found', async () => {
    search.value = `url=${encodeURIComponent('https://www.linkedin.com/in/jane-doe')}`;
    vi.mocked(api.prospects.fromLinkedIn).mockResolvedValue({
      created: true,
      data: {
        id: 'p-1',
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@acme.com',
        job_title: 'Recruiter',
        company_name: 'Acme',
      },
    } as never);
    render(<SharePage />);

    expect(screen.getByRole('heading', { name: 'Shared profile' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Company *')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add prospect' }));

    await waitFor(() => {
      expect(api.prospects.fromLinkedIn).toHaveBeenCalledWith({
        linkedin_url: 'https://www.linkedin.com/in/jane-doe',
      });
    });
    expect(await screen.findByText('Jane Doe is in your prospects.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View prospect' })).toHaveAttribute('href', '/prospects/p-1');
  });

  it('routes to manual entry and Priority Action Center when neither API returns an email', async () => {
    search.value = `url=${encodeURIComponent('https://www.linkedin.com/in/jane-doe')}`;
    vi.mocked(api.prospects.fromLinkedIn).mockResolvedValue({
      created: true,
      manual_required: true,
      message: 'Email not found via Prospeo or Apollo. Added to Priority Action Center to manually enter prospect.',
      pendingProspect: {
        id: 'pend-1',
        user_id: 'u-1',
        linkedin_url: 'https://www.linkedin.com/in/jane-doe',
        first_name: 'Jane',
        last_name: 'Doe',
        company_name: 'Acme',
        job_title: 'Recruiter',
        dismissed_at: null,
        created_at: new Date().toISOString(),
      },
    } as never);
    render(<SharePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Add prospect' }));

    expect(await screen.findByRole('heading', { name: /Manual Entry Required/i })).toBeInTheDocument();
    expect(screen.getByText(/Email could not be found via Prospeo or Apollo/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manually Enter Prospect Now' })).toHaveAttribute(
      'href',
      expect.stringContaining('/prospects?new=true')
    );
    expect(screen.getByRole('link', { name: 'View Priority Action Center' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });

  it('says the profile is already a prospect', async () => {
    search.value = `url=${encodeURIComponent('https://www.linkedin.com/in/jane-doe/')}`;
    vi.mocked(api.prospects.fromLinkedIn).mockResolvedValue({
      created: false,
      data: {
        id: 'p-1',
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@acme.com',
        job_title: 'Recruiter',
        company_name: 'Acme',
      },
    } as never);
    render(<SharePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Add prospect' }));
    expect(await screen.findByText('Jane Doe is already in your prospects.')).toBeInTheDocument();
    expect(screen.queryByText('The enrichment provider did not return an email.')).not.toBeInTheDocument();
  });

  it('switches from a profile to the job form when the URL changes', () => {
    search.value = `url=${encodeURIComponent('https://www.linkedin.com/in/jane-doe')}`;
    render(<SharePage />);

    fireEvent.change(screen.getByLabelText('Profile URL *'), {
      target: { value: 'https://careers.example.com/jobs/1' },
    });

    expect(screen.getByRole('heading', { name: 'Shared job' })).toBeInTheDocument();
    expect(screen.getByLabelText('Company *')).toHaveValue('Example');
    expect(screen.getByLabelText('Job URL *')).toHaveValue('https://careers.example.com/jobs/1');
  });

  it('displays "Already in your CRM" banner when profile already exists in CRM', async () => {
    search.value = `url=${encodeURIComponent('https://www.linkedin.com/in/jane-doe')}`;
    vi.mocked(api.prospects.lookup).mockResolvedValue({
      data: {
        id: 'p-existing-1',
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@existing.com',
        job_title: 'Lead Recruiter',
        company_name: 'Acme Global',
      } as never,
      pending: null,
    });
    render(<SharePage />);

    expect(await screen.findByText('Already in your CRM')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Lead Recruiter')).toBeInTheDocument();
    expect(screen.getByText('Acme Global')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View prospect' })).toHaveAttribute(
      'href',
      '/prospects/p-existing-1',
    );
    expect(screen.getByRole('button', { name: 'Re-enrich / update prospect' })).toBeInTheDocument();
  });

  it('displays "Pending in Priority Action Center" banner when profile is pending', async () => {
    search.value = `url=${encodeURIComponent('https://www.linkedin.com/in/jane-doe')}`;
    vi.mocked(api.prospects.lookup).mockResolvedValue({
      data: null,
      pending: {
        id: 'pend-123',
        user_id: 'u-1',
        linkedin_url: 'https://www.linkedin.com/in/jane-doe',
        first_name: 'Jane',
        last_name: 'Doe',
        company_name: 'Acme Pending',
        job_title: 'Sourcer',
        notes: null,
        dismissed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    render(<SharePage />);

    expect(await screen.findByText('Pending in Priority Action Center')).toBeInTheDocument();
    expect(screen.getByText('Acme Pending')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manually Enter Prospect Now' })).toHaveAttribute(
      'href',
      expect.stringContaining('/prospects?new=true'),
    );
  });
});
