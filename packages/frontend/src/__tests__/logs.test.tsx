import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import LogsPage from '../app/(dashboard)/logs/page';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    auth: {
      me: vi.fn(),
    },
    logs: {
      list: vi.fn(),
      stats: vi.fn(),
      clear: vi.fn(),
      prune: vi.fn(),
    },
  },
}));

describe('LogsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Access Restricted when user does not have admin role', async () => {
    vi.mocked(api.auth.me).mockResolvedValueOnce({
      user: { id: 'user-1', username: 'john', role: 'user' },
    } as any);

    render(<LogsPage />);

    await waitFor(() => {
      expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Viewing system logs and error telemetry requires administrator privileges/i)
    ).toBeInTheDocument();
  });

  it('renders system logs and stats when user is admin', async () => {
    vi.mocked(api.auth.me).mockResolvedValueOnce({
      user: { id: 'admin-1', username: 'admin', role: 'admin' },
    } as any);

    vi.mocked(api.logs.stats).mockResolvedValueOnce({
      total: 25,
      errors: 3,
      warnings: 5,
      info: 17,
      last24Hours: 12,
    });

    vi.mocked(api.logs.list).mockResolvedValueOnce({
      data: [
        {
          id: 'log-uuid-1',
          level: 'error',
          message: 'Failed to enrich prospect email',
          source: 'backend',
          error_name: 'EnrichmentError',
          stack_trace: 'Error: Failed to enrich prospect email\n    at Object.enrich',
          request_id: 'req-abc-123',
          method: 'POST',
          path: '/api/prospects/enrich',
          status_code: 500,
          github_issue_url: 'https://github.com/Rishabh-Chandrode/crm/issues/42',
          created_at: new Date('2026-10-17T10:00:00Z').toISOString(),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    render(<LogsPage />);

    await waitFor(() => {
      expect(screen.getByText('System Logs & Observability')).toBeInTheDocument();
      expect(screen.getByText('Failed to enrich prospect email')).toBeInTheDocument();
    });

    // Verify stats cards
    expect(screen.getByText('3')).toBeInTheDocument(); // Total Errors
    expect(screen.getByText('5')).toBeInTheDocument(); // Warnings
    expect(screen.getByText('12')).toBeInTheDocument(); // Activity (24h)
    expect(screen.getByText('30 Days')).toBeInTheDocument(); // Retention Window

    // Verify log item
    expect(screen.getByText('backend')).toBeInTheDocument();
    expect(screen.getByText('POST /api/prospects/enrich')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();

    // Click to expand log details
    const logItem = screen.getByText('Failed to enrich prospect email');
    fireEvent.click(logItem);

    // Verify expanded details
    await waitFor(() => {
      expect(screen.getByText(/Request ID:/i)).toBeInTheDocument();
      expect(screen.getByText('req-abc-123')).toBeInTheDocument();
      expect(screen.getByText(/EnrichmentError/i)).toBeInTheDocument();
      expect(screen.getByText('GitHub Issue')).toBeInTheDocument();
    });
  });

  it('opens and cancels clear logs modal', async () => {
    vi.mocked(api.auth.me).mockResolvedValueOnce({
      user: { id: 'admin-1', username: 'admin', role: 'admin' },
    } as any);
    vi.mocked(api.logs.stats).mockResolvedValueOnce({
      total: 0,
      errors: 0,
      warnings: 0,
      info: 0,
      last24Hours: 0,
    });
    vi.mocked(api.logs.list).mockResolvedValueOnce({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    render(<LogsPage />);

    await waitFor(() => {
      expect(screen.getByText('Clear Logs')).toBeInTheDocument();
    });

    const clearBtn = screen.getByText('Clear Logs');
    fireEvent.click(clearBtn);

    expect(screen.getByText(/permanently delete all recorded system logs/i)).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(screen.queryByText(/permanently delete all recorded system logs/i)).not.toBeInTheDocument();
  });
});
