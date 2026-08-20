'use client';

import { useState, useEffect, FormEvent } from 'react';
import { api } from '@/lib/api';
import type { CrmUser } from '@/lib/types';

export default function UsersPage() {
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.users.list();
      setUsers(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      await api.users.create({ username: newUsername, password: newPassword, email: newEmail || undefined, role: newRole });
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
      setShowCreate(false);
      void load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(user: CrmUser) {
    try {
      await api.users.update(user.id, { is_active: !user.is_active });
      void load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update user');
    }
  }

  async function changeRole(user: CrmUser, role: 'admin' | 'user') {
    try {
      await api.users.update(user.id, { role });
      void load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update role');
    }
  }

  async function deleteUser(user: CrmUser) {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try {
      await api.users.delete(user.id);
      void load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete user');
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-1 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">User Management</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">Manage team members, permissions, and account statuses</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </button>
      </div>

      {error && <p className="text-rose-600 dark:text-rose-400 text-xs">{error}</p>}

      {showCreate && (
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Create New Account</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label text-xs">Username *</label>
              <input
                className="form-input text-xs"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                required
                autoFocus
                placeholder="janesmith"
              />
            </div>
            <div>
              <label className="form-label text-xs">Email</label>
              <input
                type="email"
                className="form-input text-xs font-mono"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="jane@company.com"
              />
            </div>
            <div>
              <label className="form-label text-xs">Password *</label>
              <input
                type="password"
                className="form-input text-xs"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
              />
            </div>
            <div>
              <label className="form-label text-xs">Role</label>
              <select className="form-select text-xs" value={newRole} onChange={(e) => setNewRole(e.target.value as 'user' | 'admin')}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {createError && <p className="col-span-1 sm:col-span-2 text-rose-600 dark:text-rose-400 text-xs">{createError}</p>}
            <div className="col-span-1 sm:col-span-2 flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setCreateError(''); }}
                className="btn-ghost text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn-primary"
              >
                {creating ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-zinc-400 text-xs py-12 text-center">Loading users…</p>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30 text-left">
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">User</th>
                  <th className="px-3.5 py-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Email</th>
                  <th className="px-3.5 py-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Role</th>
                  <th className="px-3.5 py-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Status</th>
                  <th className="px-3.5 py-3 font-semibold text-[11px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Joined</th>
                  <th className="px-4 py-3 text-right font-semibold text-[11px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-850/60 transition-colors">
                    <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center text-[11px] font-bold">
                        {user.username[0]?.toUpperCase()}
                      </div>
                      <span>{user.username}</span>
                    </td>
                    <td className="px-3.5 py-3 text-zinc-600 dark:text-zinc-400 text-xs font-mono">{user.email ?? '—'}</td>
                    <td className="px-3.5 py-3">
                      <select
                        value={user.role}
                        onChange={(e) => changeRole(user, e.target.value as 'admin' | 'user')}
                        className="text-xs border border-zinc-200 dark:border-zinc-800 rounded-md px-2 py-1 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 font-medium"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-3.5 py-3">
                      <button
                        onClick={() => toggleActive(user)}
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                          user.is_active
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 hover:opacity-80'
                            : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:opacity-80'
                        }`}
                      >
                        {user.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-3.5 py-3 text-zinc-400 text-xs font-mono">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteUser(user)}
                        className="p-1 text-zinc-400 hover:text-rose-500 rounded transition-colors"
                        title="Delete user"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

