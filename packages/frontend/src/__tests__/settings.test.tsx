import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import SettingsPage from '../app/(dashboard)/settings/page';
import { ThemeProvider } from '../components/ThemeProvider';
import { api } from '../lib/api';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn((key) => (key === 'tab' ? 'appearance' : null)),
  }),
}));

vi.mock('../lib/api', () => ({
  api: {
    auth: {
      me: vi.fn(),
      gmailConnect: vi.fn(),
      gmailDisconnect: vi.fn(),
      updateProfile: vi.fn(),
    },
    documents: {
      list: vi.fn(),
      upload: vi.fn(),
      delete: vi.fn(),
    },
    variablePresets: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('SettingsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it('renders settings navigation and appearance tab', async () => {
    vi.mocked(api.auth.me).mockResolvedValue({
      id: 'u1',
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin',
      has_gmail_configured: false,
    } as any);

    vi.mocked(api.documents.list).mockResolvedValue({ data: [] });
    vi.mocked(api.variablePresets.list).mockResolvedValue({ data: [] });

    render(
      <ThemeProvider>
        <SettingsPage />
      </ThemeProvider>
    );

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getAllByText('Appearance').length).toBeGreaterThan(0);
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('Template Variables')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Light Theme')).toBeInTheDocument();
      expect(screen.getByText('Dark Theme')).toBeInTheDocument();
      expect(screen.getByText('System (Auto)')).toBeInTheDocument();
    });
  });
});
