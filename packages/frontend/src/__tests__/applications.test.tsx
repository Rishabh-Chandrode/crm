import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import ApplicationsPage from '../app/(dashboard)/applications/page';
import { api } from '../lib/api';
import type { JobApplication } from '../lib/types';

vi.mock('../lib/api', () => ({
  api: {
    applications: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('ApplicationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders status summary cards with full block styling and counts', async () => {
    const mockApps: JobApplication[] = [
      {
        id: 'app-1',
        user_id: 'u1',
        company_name: 'Acme Corp',
        job_title: 'Software Engineer',
        job_url: 'https://acme.com/jobs/1',
        status: 'applied',
        platform: 'LinkedIn',
        notes: null,
        applied_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'app-2',
        user_id: 'u1',
        company_name: 'Globex Inc',
        job_title: 'Frontend Engineer',
        job_url: 'https://globex.com/jobs/2',
        status: 'interview',
        platform: 'Lever',
        notes: null,
        applied_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    vi.mocked(api.applications.list).mockResolvedValue({
      applications: mockApps,
      total: 2,
    });

    render(<ApplicationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Job Applications')).toBeInTheDocument();
    });

    // Check status counts in summary blocks
    expect(screen.getAllByText('applied').length).toBeGreaterThan(0);
    expect(screen.getAllByText('interview').length).toBeGreaterThan(0);
    expect(screen.getByText('screening')).toBeInTheDocument();
    expect(screen.getByText('offer')).toBeInTheDocument();
    expect(screen.getByText('rejected')).toBeInTheDocument();

    // Check application items rendered
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Globex Inc').length).toBeGreaterThan(0);
  });

  it('filters applications when clicking a status card', async () => {
    vi.mocked(api.applications.list).mockResolvedValue({
      applications: [],
      total: 0,
    });

    render(<ApplicationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Job Applications')).toBeInTheDocument();
    });

    const appliedButton = screen.getAllByText('applied')[0].closest('button');
    expect(appliedButton).not.toBeNull();
    fireEvent.click(appliedButton!);

    await waitFor(() => {
      expect(api.applications.list).toHaveBeenCalledWith({
        search: undefined,
        status: 'applied',
      });
    });
  });
});
