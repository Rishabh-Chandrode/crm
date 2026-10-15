import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import TemplatesPage from '../app/(dashboard)/templates/page';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    templates: {
      list: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteOlderVersions: vi.fn(),
      detectVariables: vi.fn(),
    },
    variablePresets: { list: vi.fn() },
    documents: { list: vi.fn() },
  },
}));

const referralV2 = {
  id: 't-2',
  family_id: 'fam-1',
  name: 'referral',
  description: null,
  subject: 'Hello',
  body: 'Body',
  job_description: null,
  variables: [],
  document_ids: [],
  version: 2,
  deleted_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const referralV1 = {
  ...referralV2,
  id: 't-1',
  version: 1,
  subject: 'Old hello',
};

const deletedOutreach = {
  ...referralV2,
  id: 't-del',
  family_id: 'fam-2',
  name: 'outreach',
  version: 1,
  deleted_at: '2026-01-01T00:00:00.000Z',
};

describe('TemplatesPage versions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.templates.list).mockResolvedValue({ data: [referralV2, referralV1, deletedOutreach] as any });
    vi.mocked(api.variablePresets.list).mockResolvedValue({ data: [] as any });
    vi.mocked(api.documents.list).mockResolvedValue({ data: [] as any });
    vi.mocked(api.templates.update).mockResolvedValue({ data: { ...referralV2, id: 't-3', version: 3 } as any });
    vi.mocked(api.templates.deleteOlderVersions).mockResolvedValue({ data: { ids: ['t-1'] } });
  });

  it('shows one card per template and edits the latest version by default', async () => {
    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('v2')).toBeInTheDocument();
    });

    expect(api.templates.list).toHaveBeenCalledWith({ all: true });
    expect(screen.getAllByText('referral')).toHaveLength(1);
    expect(screen.queryByText('Old hello')).not.toBeInTheDocument();
    expect(screen.getByText('Deleted')).toBeInTheDocument();
    expect(screen.getByText('outreach')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete older versions' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('referral'));
    const versionSelect = screen.getByLabelText('Version') as HTMLSelectElement;
    expect(versionSelect.value).toBe('t-2');
    expect(screen.getByRole('option', { name: 'v2' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'v1' })).toBeInTheDocument();

    fireEvent.change(versionSelect, { target: { value: 't-1' } });
    expect(screen.getByDisplayValue('Old hello')).toBeInTheDocument();

    fireEvent.change(versionSelect, { target: { value: 't-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Template' }));

    await waitFor(() => {
      expect(api.templates.update).toHaveBeenCalledWith('t-2', expect.objectContaining({
        name: 'referral',
        subject: 'Hello',
        body: 'Body',
      }));
    });
  });

  it('hides the attachment badge when the attached document no longer exists', async () => {
    vi.mocked(api.templates.list).mockResolvedValue({
      data: [{ ...referralV2, document_ids: ['deleted-doc'] }] as any,
    });
    vi.mocked(api.documents.list).mockResolvedValue({ data: [] as any });

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('referral')).toBeInTheDocument();
    });
    expect(screen.queryByText(/attachment/)).not.toBeInTheDocument();
  });

  it('counts only documents that still exist as attachments', async () => {
    vi.mocked(api.templates.list).mockResolvedValue({
      data: [{ ...referralV2, document_ids: ['doc-1', 'deleted-doc'] }] as any,
    });
    vi.mocked(api.documents.list).mockResolvedValue({
      data: [{ id: 'doc-1', name: 'Resume', filename: 'resume.pdf' }] as any,
    });

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('1 attachment')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('referral'));
    const resume = screen.getByRole('checkbox', { name: /Resume/ });
    expect(resume).toBeChecked();
  });

  it('detects a placeholder pasted into an open template before it is saved', async () => {
    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('referral')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('referral'));
    const body = screen.getByDisplayValue('Body');
    fireEvent.change(body, { target: { value: 'Hello {{lastName}}' } });
    fireEvent.click(screen.getByRole('button', { name: /auto-detect/i }));

    expect(screen.getByDisplayValue('lastName')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Last Name')).toBeInTheDocument();
    expect(api.templates.detectVariables).not.toHaveBeenCalled();
    expect(api.templates.update).not.toHaveBeenCalled();
  });

  it('deletes older versions from the latest card', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete older versions' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete older versions' }));

    await waitFor(() => {
      expect(api.templates.deleteOlderVersions).toHaveBeenCalledWith('t-2');
    });
  });
});
