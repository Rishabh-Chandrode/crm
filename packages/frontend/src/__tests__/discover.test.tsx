import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import DiscoverProspectsModal from '../components/DiscoverProspectsModal';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    prospects: {
      discover: vi.fn(),
      bulkImport: vi.fn(),
    },
  },
}));

describe('DiscoverProspectsModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders search modal with preset role tabs', () => {
    render(
      <DiscoverProspectsModal
        initialCompany=""
        onClose={vi.fn()}
        onImportDone={vi.fn()}
      />
    );

    expect(screen.getByText('Discover Decision Makers & Prospects')).toBeInTheDocument();
    expect(screen.getByText('Recruiters & HR')).toBeInTheDocument();
    expect(screen.getByText('Hiring Managers')).toBeInTheDocument();
    expect(screen.getByText('Upper Management')).toBeInTheDocument();
  });


  it('triggers search and renders candidate list with CRM status', async () => {
    vi.mocked(api.prospects.discover).mockResolvedValueOnce({
      data: [
        {
          id: 'p-1',
          first_name: 'Jessica',
          last_name: 'Alba',
          full_name: 'Jessica Alba',
          job_title: 'Talent Acquisition Partner',
          role_category: 'hr',
          company_name: 'Stripe',
          linkedin_url: 'https://linkedin.com/in/jessicaalba',
          already_in_crm: false,
        },
        {
          id: 'p-2',
          first_name: 'Patrick',
          last_name: 'Collison',
          full_name: 'Patrick Collison',
          job_title: 'CEO',
          role_category: 'executive',
          company_name: 'Stripe',
          linkedin_url: 'https://linkedin.com/in/patrickcollison',
          already_in_crm: true,
        },
      ],
      total: 2,
      free: true,
      provider: 'prospeo',
    });

    render(
      <DiscoverProspectsModal
        initialCompany="Stripe"
        onClose={vi.fn()}
        onImportDone={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Jessica Alba')).toBeInTheDocument();
      expect(screen.getByText('Patrick Collison')).toBeInTheDocument();
      expect(screen.getByText('Already in CRM')).toBeInTheDocument();
      expect(screen.getByText('New Contact')).toBeInTheDocument();
    });
  });

  it('allows importing selected contacts', async () => {
    vi.mocked(api.prospects.discover).mockResolvedValueOnce({
      data: [
        {
          id: 'p-1',
          first_name: 'Elena',
          last_name: 'Rostova',
          full_name: 'Elena Rostova',
          job_title: 'Engineering Manager',
          role_category: 'engineer',
          company_name: 'Stripe',
          linkedin_url: 'https://linkedin.com/in/elenarostova',
          already_in_crm: false,
        },
      ],
      total: 1,
      free: true,
      provider: 'prospeo',
    });

    vi.mocked(api.prospects.bulkImport).mockResolvedValueOnce({
      data: [] as any,
      imported_count: 1,
      skipped_count: 0,
      total: 1,
    });

    const onImportDoneMock = vi.fn();

    render(
      <DiscoverProspectsModal
        initialCompany="Stripe"
        onClose={vi.fn()}
        onImportDone={onImportDoneMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Elena Rostova')).toBeInTheDocument();
    });

    const importBtn = screen.getByRole('button', { name: /import selected/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(api.prospects.bulkImport).toHaveBeenCalledTimes(1);
      expect(onImportDoneMock).toHaveBeenCalledWith(1);
      expect(screen.getByText(/successfully imported/i)).toBeInTheDocument();
    });
  });
});
