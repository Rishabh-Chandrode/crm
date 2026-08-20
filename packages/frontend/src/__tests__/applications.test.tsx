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

  const mockApps: JobApplication[] = [
    {
      id: 'app-1',
      user_id: 'u1',
      company_name: 'Acme Corp',
      job_title: 'Software Engineer',
      job_url: 'https://acme.com/jobs/1',
      status: 'applied',
      platform: 'LinkedIn',
      notes: 'Initial note',
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

  it('renders status summary cards with full block styling and counts', async () => {
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

  it('opens edit modal and saves full application updates (company, title, URL, platform, notes)', async () => {
    vi.mocked(api.applications.list).mockResolvedValue({
      applications: mockApps,
      total: 2,
    });
    vi.mocked(api.applications.update).mockResolvedValue({
      ...mockApps[0]!,
      company_name: 'Acme Technologies',
      job_title: 'Staff Engineer',
      job_url: 'https://acme.com/jobs/staff',
      notes: 'Updated note',
    });

    render(<ApplicationsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0);
    });

    // Find and click the Edit button for Acme Corp
    const editBtns = screen.getAllByTitle('Edit');
    fireEvent.click(editBtns[0]!);

    await waitFor(() => {
      expect(screen.getByText('Edit Application')).toBeInTheDocument();
    });

    // Verify company name, title, url inputs exist and have initial values
    const companyInput = screen.getByDisplayValue('Acme Corp');
    const titleInput = screen.getByDisplayValue('Software Engineer');
    const urlInput = screen.getByDisplayValue('https://acme.com/jobs/1');
    const notesInput = screen.getByDisplayValue('Initial note');

    fireEvent.change(companyInput, { target: { value: 'Acme Technologies' } });
    fireEvent.change(titleInput, { target: { value: 'Staff Engineer' } });
    fireEvent.change(urlInput, { target: { value: 'https://acme.com/jobs/staff' } });
    fireEvent.change(notesInput, { target: { value: 'Updated note' } });

    const saveBtn = screen.getByText('Save Changes');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.applications.update).toHaveBeenCalledWith(
        'app-1',
        expect.objectContaining({
          company_name: 'Acme Technologies',
          job_title: 'Staff Engineer',
          job_url: 'https://acme.com/jobs/staff',
          notes: 'Updated note',
        })
      );
    });
  });

  it('opens create modal and tracks new application', async () => {
    vi.mocked(api.applications.list).mockResolvedValue({
      applications: [],
      total: 0,
    });
    vi.mocked(api.applications.create).mockResolvedValue({
      id: 'app-new',
      user_id: 'u1',
      company_name: 'OpenAI',
      job_title: 'Research Engineer',
      job_url: 'https://jobs.lever.co/openai/123',
      platform: 'Lever',
      status: 'applied',
      notes: 'Referral by friend',
      applied_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    render(<ApplicationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Add Application')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Application'));

    await waitFor(() => {
      expect(screen.getByText('Track New Application')).toBeInTheDocument();
    });

    const companyInput = screen.getByPlaceholderText('e.g. OpenAI');
    const titleInput = screen.getByPlaceholderText('e.g. Machine Learning Engineer');
    const urlInput = screen.getByPlaceholderText('https://jobs.lever.co/openai/...');
    const notesInput = screen.getByPlaceholderText(/Interview stages/);

    fireEvent.change(companyInput, { target: { value: 'OpenAI' } });
    fireEvent.change(titleInput, { target: { value: 'Research Engineer' } });
    fireEvent.change(urlInput, { target: { value: 'https://jobs.lever.co/openai/123' } });
    fireEvent.change(notesInput, { target: { value: 'Referral by friend' } });

    const submitBtn = screen.getByText('Track Application');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.applications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          company_name: 'OpenAI',
          job_title: 'Research Engineer',
          job_url: 'https://jobs.lever.co/openai/123',
          notes: 'Referral by friend',
        })
      );
    });
  });
});
