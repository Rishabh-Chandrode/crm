import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import UsersPage from '../app/(dashboard)/users/page';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    users: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('UsersPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders user list and handles user creation', async () => {
    const mockUsers = [
      {
        id: 'u1',
        username: 'alice',
        email: 'alice@example.com',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'u2',
        username: 'bob',
        email: null,
        role: 'user',
        is_active: false,
        created_at: new Date().toISOString(),
      },
    ];

    vi.mocked(api.users.list).mockResolvedValue({ data: mockUsers as any });

    render(<UsersPage />);

    expect(screen.getByText(/User Management/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
      expect(screen.getByText('bob')).toBeInTheDocument();
    });

    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();

    // Click Add User
    const addBtn = screen.getByRole('button', { name: /Add User/i });
    fireEvent.click(addBtn);

    expect(screen.getByText('Create New Account')).toBeInTheDocument();
  });
});
