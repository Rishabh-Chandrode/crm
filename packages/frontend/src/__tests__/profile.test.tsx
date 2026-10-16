import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import ProfilePage from '../app/(dashboard)/profile/page';
import { api } from '../lib/api';

const nav = vi.hoisted(() => ({ tab: 'personal' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'tab' ? nav.tab : null),
  }),
}));

vi.mock('../lib/api', () => ({
  api: {
    auth: {
      me: vi.fn(),
      updateProfile: vi.fn(),
    },
    documents: {
      list: vi.fn(),
      upload: vi.fn(),
      fromDrive: vi.fn(),
      sync: vi.fn(),
      delete: vi.fn(),
      dailySync: {
        get: vi.fn(),
        set: vi.fn(),
      },
    },
  },
}));

const user = {
  id: 'u1',
  username: 'ada',
  email: 'ada@example.com',
  role: 'user',
  is_active: true,
  first_name: 'Ada',
  last_name: 'Lovelace',
  skills: [],
  target_roles: [],
  projects: [],
  work_experiences: [],
};

describe('ProfilePage documents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.tab = 'personal';
    vi.mocked(api.auth.me).mockResolvedValue({ user } as never);
    vi.mocked(api.documents.list).mockResolvedValue({ data: [] });
    vi.mocked(api.documents.dailySync.get).mockResolvedValue({
      data: { enabled: false, last_synced_at: null },
    });
  });

  it('replaces Resume Files with a Documents tab', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Candidate Profile')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.queryByText('Resume Files')).not.toBeInTheDocument();
  });

  it('lists profile documents, including Drive-linked files, for extension autofill', async () => {
    nav.tab = 'documents';
    vi.mocked(api.documents.list).mockResolvedValue({
      data: [{
        id: 'doc-1',
        name: 'Backend Resume',
        filename: 'backend.pdf',
        size: 2048,
        drive_url: 'https://drive.google.com/file/d/abc',
        drive_synced_at: '2026-10-01T12:00:00.000Z',
        drive_sync_error: null,
        created_at: '2026-10-01T12:00:00.000Z',
      }],
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Backend Resume')).toBeInTheDocument();
    });

    expect(screen.getByText(/browser extension attaches the file/i)).toBeInTheDocument();
    expect(screen.getByText('Drive')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-fetch' })).toBeInTheDocument();
    expect(api.documents.list).toHaveBeenCalled();
  });

  it('opens the documents tab when an old resume link is used', async () => {
    nav.tab = 'resume';
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Upload a file')).toBeInTheDocument();
    });
    expect(screen.getByText('Link from Google Drive / Docs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refetch daily' })).toBeInTheDocument();
  });

  it('turns on daily refetch and reloads the document list', async () => {
    nav.tab = 'documents';
    vi.mocked(api.documents.dailySync.set).mockResolvedValue({
      data: { enabled: true, last_synced_at: '2026-10-14T04:00:00.000Z' },
    });

    render(<ProfilePage />);

    const button = await screen.findByRole('button', { name: 'Refetch daily' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(api.documents.dailySync.set).toHaveBeenCalledWith(true);
    });
    expect(await screen.findByText(/Daily refetch is on/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Turn off daily refetch' })).toBeInTheDocument();
  });

  it('saves target roles typed as a comma-separated list', async () => {
    nav.tab = 'preferences';
    vi.mocked(api.auth.updateProfile).mockResolvedValue({ user } as never);
    render(<ProfilePage />);

    const input = await screen.findByLabelText('Target roles');
    fireEvent.change(input, { target: { value: 'SDE, SDE1' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(api.auth.updateProfile).toHaveBeenCalledWith({ target_roles: ['SDE', 'SDE1'] });
    });
  });

  it('saves a target role when the field is left', async () => {
    nav.tab = 'preferences';
    vi.mocked(api.auth.updateProfile).mockResolvedValue({ user } as never);
    render(<ProfilePage />);

    const input = await screen.findByLabelText('Target roles');
    fireEvent.change(input, { target: { value: 'Backend Developer' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(api.auth.updateProfile).toHaveBeenCalledWith({ target_roles: ['Backend Developer'] });
    });
  });

  it('saves a target role from the Add role button', async () => {
    nav.tab = 'preferences';
    vi.mocked(api.auth.updateProfile).mockResolvedValue({ user } as never);
    render(<ProfilePage />);

    const input = await screen.findByLabelText('Target roles');
    fireEvent.change(input, { target: { value: 'SDE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));

    await waitFor(() => {
      expect(api.auth.updateProfile).toHaveBeenCalledWith({ target_roles: ['SDE'] });
    });
  });
});
