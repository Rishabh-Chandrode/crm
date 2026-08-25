import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import HistoryPage from '../app/(dashboard)/history/page';
import { api } from '../lib/api';

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

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
    mockSearchParams = new URLSearchParams();
  });

  it('renders history logs with status tabs, items, and Open in Gmail link', async () => {
    const mockSends = [
      {
        id: 's1',
        recipient_email: 'recruiter@tech.com',
        status: 'sent',
        subject: 'Intro - Full Dev',
        body_preview: 'Hi there, I saw your job posting...',
        created_at: new Date().toISOString(),
        prospect: { first_name: 'John', last_name: 'Smith', email: 'recruiter@tech.com' },
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

    // Check Open in Gmail link
    const gmailLinks = screen.getAllByRole('link', { name: /Open in Gmail/i });
    expect(gmailLinks.length).toBeGreaterThan(0);
    expect(gmailLinks[0]).toHaveAttribute(
      'href',
      'https://mail.google.com/mail/u/0/#search/to%3Arecruiter%40tech.com%20subject%3A(%22Intro%20-%20Full%20Dev%22)'
    );
    expect(gmailLinks[0]).toHaveAttribute('target', '_blank');
    expect(gmailLinks[0]).toHaveAttribute('rel', 'noopener noreferrer');
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

  it('initializes search input from searchParams', async () => {
    mockSearchParams = new URLSearchParams('search=sarah@stripe.com');
    vi.mocked(api.email.history).mockResolvedValue({
      data: [],
      total: 0,
    });

    render(<HistoryPage />);

    await waitFor(() => {
      expect(api.email.history).toHaveBeenCalledWith(
        25,
        0,
        expect.objectContaining({ search: 'sarah@stripe.com' })
      );
    });

    const input = screen.getByPlaceholderText('Search recipient, email, subject…') as HTMLInputElement;
    expect(input.value).toBe('sarah@stripe.com');
  });
});
