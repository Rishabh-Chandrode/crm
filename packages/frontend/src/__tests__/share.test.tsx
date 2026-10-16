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
  },
}));

describe('SharePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search.value = '';
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
});
