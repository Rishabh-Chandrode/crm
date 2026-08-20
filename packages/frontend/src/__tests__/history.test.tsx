import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import HistoryPage from '../app/(dashboard)/history/page';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    email: {
      history: vi.fn(),
      retry: vi.fn(),
    },
  },
}));

describe('HistoryPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders history logs with status tabs and items', async () => {
    const mockSends = [
      {
        id: 's1',
        recipient_email: 'recruiter@tech.com',
        status: 'sent',
        subject: 'Intro - Full Dev',
        body_preview: 'Hi there, I saw your job posting...',
        created_at: new Date().toISOString(),
        prospect: { first_name: 'John', last_name: 'Smith' },
        company: { name: 'TechCorp' },
        open_count: 3,
        opened_at: new Date().toISOString(),
      },
    ];

    vi.mocked(api.email.history).mockResolvedValue({
      data: mockSends as any,
      total: 1,
    });

    render(<HistoryPage />);

    expect(screen.getByText('Send History')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Failed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pending' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Intro - Full Dev')).toBeInTheDocument();
    });
  });

  it('filters history when clicking status buttons', async () => {
    vi.mocked(api.email.history).mockResolvedValue({
      data: [],
      total: 0,
    });

    const { fireEvent } = await import('@testing-library/react');
    render(<HistoryPage />);

    const sentBtn = screen.getByRole('button', { name: 'Sent' });
    fireEvent.click(sentBtn);

    await waitFor(() => {
      expect(api.email.history).toHaveBeenCalledWith(
        25,
        0,
        expect.objectContaining({ status: 'sent' })
      );
    });

    const failedBtn = screen.getByRole('button', { name: 'Failed' });
    fireEvent.click(failedBtn);

    await waitFor(() => {
      expect(api.email.history).toHaveBeenCalledWith(
        25,
        0,
        expect.objectContaining({ status: 'failed' })
      );
    });
  });
});
