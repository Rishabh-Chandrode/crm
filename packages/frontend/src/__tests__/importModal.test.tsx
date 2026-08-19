import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import ImportModal from '../components/ImportModal';
import { api } from '../lib/api';
import type { Company } from '../lib/types';

vi.mock('../lib/api', () => ({
  api: {
    import: {
      parse: vi.fn(),
      prospects: vi.fn(),
    },
  },
}));

describe('ImportModal Component', () => {
  const mockCompanies: Company[] = [
    {
      id: 'c1',
      name: 'Acme Corp',
      website: 'https://acme.com',
      industry: 'Technology',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial upload step with drop zone', () => {
    render(
      <ImportModal
        companies={mockCompanies}
        onClose={vi.fn()}
        onDone={vi.fn()}
      />
    );

    expect(screen.getByText('Import Prospects from Excel / CSV')).toBeInTheDocument();
    expect(screen.getByText('Drop your file here')).toBeInTheDocument();
  });

  it('progresses to mapping step after file upload and allows executing import', async () => {
    const mockParseData = {
      headers: ['First', 'Last', 'Email', 'Company'],
      preview: [{ First: 'Alice', Last: 'Smith', Email: 'alice@test.com', Company: 'Acme Corp' }],
      rows: [{ First: 'Alice', Last: 'Smith', Email: 'alice@test.com', Company: 'Acme Corp' }],
      rowCount: 1,
      suggestedMapping: {
        first_name: 'First',
        last_name: 'Last',
        email: 'Email',
        company: 'Company',
      },
    };

    vi.mocked(api.import.parse).mockResolvedValue({ data: mockParseData } as any);
    vi.mocked(api.import.prospects).mockResolvedValue({
      data: { imported: 1, skipped: 0, errors: [] },
    } as any);

    const onDone = vi.fn();
    const onClose = vi.fn();

    const { container } = render(
      <ImportModal
        companies={mockCompanies}
        onClose={onClose}
        onDone={onDone}
      />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const dummyFile = new File(['dummy'], 'test.csv', { type: 'text/csv' });

    fireEvent.change(fileInput, { target: { files: [dummyFile] } });

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText(/Column mapping/i)).toBeInTheDocument();
    });

    const importButton = screen.getByRole('button', { name: /Import 1 rows →/i });
    expect(importButton).not.toBeDisabled();

    fireEvent.click(importButton);

    await waitFor(() => {
      expect(screen.getByText('Imported')).toBeInTheDocument();
    });

    const viewButton = screen.getByRole('button', { name: /View prospects/i });
    fireEvent.click(viewButton);

    expect(onDone).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
