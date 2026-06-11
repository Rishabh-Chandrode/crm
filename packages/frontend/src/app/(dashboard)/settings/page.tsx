'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { Document } from '@/lib/types';

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SettingsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  useEffect(() => {
    api.documents.list().then((r) => setDocuments(r.data)).catch(console.error);
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    if (!name.trim()) {
      const stem = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      setName(stem);
    }
  }

  async function handleUpload() {
    if (!pendingFile) { fileRef.current?.click(); return; }
    if (!name.trim()) { setError('Please enter a label for this document'); return; }
    setError('');
    setSuccess('');
    setUploading(true);
    try {
      const r = await api.documents.upload(pendingFile, name.trim());
      setDocuments((prev) => [r.data, ...prev]);
      setSuccess(`"${r.data.name}" uploaded.`);
      setName('');
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string, docName: string) {
    if (!confirm(`Remove "${docName}"?`)) return;
    setError('');
    setSuccess('');
    try {
      await api.documents.delete(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setSuccess(`"${docName}" removed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Manage documents for email outreach</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-slate-800 mb-1">Documents</h2>
          <p className="text-slate-500 text-sm">
            Upload any documents you send with job applications — resume, cover letter, portfolio, work samples, etc.
            Label each one so you can pick the right combination per send.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-700 text-sm">
            {success}
          </div>
        )}

        {/* Upload form */}
        <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
          <p className="text-sm font-medium text-slate-700">Add a document</p>

          <div>
            <label className="form-label">Label *</label>
            <input
              className="form-input"
              placeholder="e.g. Backend Resume, Cover Letter – Stripe, Portfolio"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">File * <span className="text-slate-400 font-normal">(PDF, DOC, DOCX · max 10 MB)</span></label>
            {pendingFile ? (
              <div className="flex items-center gap-3 px-3 py-2 border border-indigo-200 bg-indigo-50 rounded-lg text-sm">
                <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="flex-1 truncate text-slate-700">{pendingFile.name}</span>
                <button
                  onClick={() => { setPendingFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 w-full border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-lg px-4 py-3 text-sm text-slate-500 hover:text-indigo-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Choose file
              </button>
            )}
          </div>

          <button
            onClick={() => void handleUpload()}
            disabled={uploading || !pendingFile || !name.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {uploading ? 'Uploading…' : 'Upload document'}
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Document list */}
        {documents.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{doc.name}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {doc.filename}
                    {doc.size ? ` · ${formatBytes(doc.size)}` : ''}
                    {' · '}
                    {new Date(doc.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                  </p>
                </div>
                <button
                  onClick={() => void handleDelete(doc.id, doc.name)}
                  className="text-sm text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors flex-shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
