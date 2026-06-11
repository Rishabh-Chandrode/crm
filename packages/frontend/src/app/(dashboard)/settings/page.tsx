'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { ResumeInfo } from '@/lib/types';

export default function SettingsPage() {
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.settings.getResume().then((r) => setResume(r.data)).catch(console.error);
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setSuccess('');
    setUploading(true);
    try {
      const r = await api.settings.uploadResume(file);
      setResume(r.data);
      setSuccess('Resume uploaded successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete() {
    if (!confirm('Remove your resume? You can upload a new one anytime.')) return;
    setError('');
    setSuccess('');
    setDeleting(true);
    try {
      await api.settings.deleteResume();
      setResume({ exists: false, filename: null, uploadedAt: null });
      setSuccess('Resume removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your resume and account preferences</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Resume</h2>
        <p className="text-slate-500 text-sm mb-5">
          Upload your resume once and attach it to any outreach email with a single checkbox.
          Accepts PDF, DOC, and DOCX (max 10 MB).
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-red-700 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4 text-green-700 text-sm">
            {success}
          </div>
        )}

        {resume === null ? (
          <div className="h-10 bg-slate-100 rounded animate-pulse w-48" />
        ) : resume.exists ? (
          <div className="flex items-center gap-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{resume.filename}</p>
              {resume.uploadedAt && (
                <p className="text-xs text-slate-500">
                  Uploaded {new Date(resume.uploadedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                </p>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                Replace
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="text-sm font-medium text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                {deleting ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-3 w-full border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl p-6 text-slate-500 hover:text-indigo-600 transition-colors"
          >
            <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="text-sm font-medium">
              {uploading ? 'Uploading…' : 'Click to upload your resume'}
            </span>
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => void handleUpload(e)}
        />
      </div>
    </div>
  );
}
