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
  },
}));

describe('SharePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search.value = '';
    vi.mocked(api.auth.me).mockResolvedValue({ user: { target_roles: [] } } as never);
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
    vi.mocked(api.applications.create).mockResolvedValue({} as never);
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
});
