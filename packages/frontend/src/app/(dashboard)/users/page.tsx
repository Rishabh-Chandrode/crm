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
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">User Management</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Manage team members, permissions, and account statuses</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-xs shadow-indigo-500/20"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </button>
      </div>

      {error && <p className="text-red-500 dark:text-red-400 text-sm mb-4">{error}</p>}

      {showCreate && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 mb-8 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">Create New Account</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            {createError && <p className="col-span-1 sm:col-span-2 text-red-500 text-xs">{createError}</p>}
            <div className="col-span-1 sm:col-span-2 flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setCreateError(''); }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-xs"
              >
                {creating ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400 text-sm">Loading users…</p>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 text-left">
                  <th className="px-5 py-3.5 font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">User</th>
                  <th className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">Email</th>
                  <th className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">Role</th>
                  <th className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">Status</th>
                  <th className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">Joined</th>
                  <th className="px-5 py-3.5 text-right font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">
                        {user.username[0]?.toUpperCase()}
                      </div>
                      <span>{user.username}</span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400 text-xs font-mono">{user.email ?? '—'}</td>
                    <td className="px-4 py-3.5">
                      <select
                        value={user.role}
                        onChange={(e) => changeRole(user, e.target.value as 'admin' | 'user')}
                        className="text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-medium"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => toggleActive(user)}
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider transition-colors ${
                          user.is_active
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 hover:opacity-80'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:opacity-80'
                        }`}
                      >
                        {user.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-slate-400 text-xs font-mono">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => deleteUser(user)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                        title="Delete user"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
