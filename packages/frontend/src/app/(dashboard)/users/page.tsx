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
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-slate-500 text-sm mt-1">Manage CRM users and their roles</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Add user
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {showCreate && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">New User</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Username *</label>
              <input
                className="form-input"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Password *</label>
              <input
                type="password"
                className="form-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Min 8 characters"
              />
            </div>
            <div>
              <label className="form-label">Role</label>
              <select className="form-input" value={newRole} onChange={(e) => setNewRole(e.target.value as 'user' | 'admin')}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {createError && <p className="col-span-2 text-red-500 text-sm">{createError}</p>}
            <div className="col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setCreateError(''); }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {creating ? 'Creating…' : 'Create user'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-slate-600 font-medium">User</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Role</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{user.username}</td>
                  <td className="px-4 py-3 text-slate-500">{user.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => changeRole(user, e.target.value as 'admin' | 'user')}
                      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(user)}
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        user.is_active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteUser(user)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
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
      )}
    </div>
  );
}
