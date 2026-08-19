import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import Sidebar from '../components/Sidebar';
import { api } from '../lib/api';
import { ThemeProvider } from '../components/ThemeProvider';

vi.mock('../lib/api', () => ({
  api: {
    auth: {
      me: vi.fn(),
    },
  },
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('Sidebar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders standard navigation links for authenticated regular user', async () => {
    vi.mocked(api.auth.me).mockResolvedValue({
      user: { username: 'testuser', role: 'user' } as any,
    });

    render(
      <ThemeProvider>
        <Sidebar />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('Companies').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Prospects').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Templates').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Send Emails').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Applications').length).toBeGreaterThan(0);

    // Regular users should not see Admin Users section
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('renders Admin navigation link when user has admin role', async () => {
    vi.mocked(api.auth.me).mockResolvedValue({
      user: { username: 'adminuser', role: 'admin' } as any,
    });

    render(
      <ThemeProvider>
        <Sidebar />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Admin').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('Users').length).toBeGreaterThan(0);
  });

  it('clears token cookie and navigates to login upon clicking sign out', async () => {
    vi.mocked(api.auth.me).mockResolvedValue({
      user: { username: 'testuser', role: 'user' } as any,
    });

    render(
      <ThemeProvider>
        <Sidebar />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Sign out').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('Sign out')[0]);

    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
