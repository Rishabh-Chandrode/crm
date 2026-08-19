import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import ProspectsPage from '../app/(dashboard)/prospects/page';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    prospects: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    companies: {
      list: vi.fn(),
    },
    import: {
      parse: vi.fn(),
      prospects: vi.fn(),
    },
  },
}));

describe('ProspectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders prospects list and filters with Combobox for both companies and categories', async () => {
    const mockProspects = [
      {
        id: 'p-1',
        user_id: 'u1',
        company_id: 'c-1',
        company_name: 'Acme Corp',
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@acme.com',
        job_title: 'Engineering Lead',
        role_category: 'engineer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const mockCompanies = [
      { id: 'c-1', name: 'Acme Corp', created_at: '', updated_at: '', user_id: 'u1' },
    ];

    vi.mocked(api.prospects.list).mockResolvedValue({
      data: mockProspects,
      total: 1,
    } as any);
    vi.mocked(api.companies.list).mockResolvedValue({
      data: mockCompanies,
    } as any);

    render(<ProspectsPage />);

    await waitFor(() => {
      expect(screen.getByText('Prospects')).toBeInTheDocument();
    });

    // Both filters should use Combobox placeholders
    expect(screen.getByText('All companies')).toBeInTheDocument();
    expect(screen.getByText('All categories')).toBeInTheDocument();

    // Check prospect item
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('jane@acme.com')).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();

    // Open category dropdown
    const categoryTrigger = screen.getByText('All categories');
    fireEvent.click(categoryTrigger);

    // Should find category options in the open combobox
    expect(screen.getByText('HR / Recruiter')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });
});
