'use client';

import { useRef, useState, DragEvent } from 'react';
import { api } from '@/lib/api';
import type { Company } from '@/lib/types';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ParseResult {
  headers: string[];
  preview: Record<string, string>[];
  rows: Record<string, string>[];
  rowCount: number;
  suggestedMapping: Record<string, string>;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; email?: string; error: string }[];
}

type Step = 'upload' | 'map' | 'importing' | 'done';

// Fields the user can map. `full_name` is an alternative to first+last.
const MAPPABLE_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: 'first_name',   label: 'First Name',   required: true },
  { key: 'last_name',    label: 'Last Name' },
  { key: 'full_name',    label: 'Full Name (split into first + last)' },
  { key: 'email',        label: 'Email',        required: true },
  { key: 'company',      label: 'Company Name' },
  { key: 'job_title',    label: 'Job Title' },
  { key: 'phone',        label: 'Phone' },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'notes',        label: 'Notes' },
];

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  companies: Company[];
  onClose: () => void;
  onDone: () => void;
}

export default function ImportModal({ companies, onClose, onDone }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [dragging, setDragging] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultCompanyId, setDefaultCompanyId] = useState('');
  const [createMissing, setCreateMissing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // ── File handling ────────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setError('');
    try {
      const res = await api.import.parse(file);
      setParseResult(res.data);
      setMapping(res.data.suggestedMapping);
      setStep('map');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  // ── Import ───────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (!parseResult) return;
    setStep('importing');
    setError('');
    try {
      const res = await api.import.prospects({
        rows: parseResult.rows,
        mapping,
        defaultCompanyId: defaultCompanyId || undefined,
        createMissingCompanies: createMissing,
      });
      setResult(res.data);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('map');
    }
  }

  function setField(key: string, value: string) {
    setMapping((prev) => ({ ...prev, [key]: value }));
  }

  const hasRequiredFields =
    (mapping['first_name'] || mapping['full_name']) && mapping['email'];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl my-8 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Import Prospects from Excel / CSV
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1.5 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">

          {/* ── Step: upload ──────────────────────────────────────────────────── */}
          {step === 'upload' && (
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Upload a <strong className="text-slate-700 dark:text-slate-300">.xlsx</strong>, <strong className="text-slate-700 dark:text-slate-300">.xls</strong>, or <strong className="text-slate-700 dark:text-slate-300">.csv</strong> file.
                The first row must be a header row. Column names are auto-detected.
              </p>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
                  dragging
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                    : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="w-12 h-12 mx-auto mb-3 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 dark:text-slate-500">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-slate-800 dark:text-slate-200 font-semibold text-sm">Drop your file here</p>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">or click to browse from computer</p>
                <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-2">.xlsx · .xls · .csv · max 10 MB</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={onFileInput}
                />
              </div>

              {error && <p className="text-red-500 dark:text-red-400 text-sm mt-3">{error}</p>}
            </div>
          )}

          {/* ── Step: map ────────────────────────────────────────────────────── */}
          {step === 'map' && parseResult && (
            <div className="space-y-6">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                <strong className="text-slate-800 dark:text-slate-200">{parseResult.rowCount}</strong> rows found.
                Map each CRM field to a column from your spreadsheet.
              </p>

              {/* Column mapping table */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Column mapping</h3>
                <div className="space-y-2">
                  {MAPPABLE_FIELDS.map(({ key, label, required }) => (
                    <div key={key} className="grid grid-cols-2 gap-3 items-center">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {label}
                        {required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      <select
                        value={mapping[key] ?? ''}
                        onChange={(e) => setField(key, e.target.value)}
                        className="form-select text-xs py-1.5"
                      >
                        <option value="">— skip —</option>
                        {parseResult.headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-5 space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Options</h3>

                <div>
                  <label className="form-label text-xs">Default company (applies when no company column is mapped or value is empty)</label>
                  <select
                    value={defaultCompanyId}
                    onChange={(e) => setDefaultCompanyId(e.target.value)}
                    className="form-select text-xs"
                  >
                    <option value="">No default company</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createMissing}
                    onChange={(e) => setCreateMissing(e.target.checked)}
                    className="rounded-md border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300">
                    Create new companies automatically if they don't exist yet
                  </span>
                </label>
              </div>

              {/* Preview table */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Preview (first {parseResult.preview.length} rows)
                </h3>
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/40">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/60">
                        {parseResult.headers.map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {parseResult.preview.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/40">
                          {parseResult.headers.map((h) => (
                            <td key={h} className="px-3 py-2 text-slate-600 dark:text-slate-300 whitespace-nowrap max-w-[160px] truncate">
                              {row[h] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}
            </div>
          )}

          {/* ── Step: importing ───────────────────────────────────────────────── */}
          {step === 'importing' && (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-slate-600 dark:text-slate-300 font-medium text-sm">Importing prospects…</p>
            </div>
          )}

          {/* ── Step: done ────────────────────────────────────────────────────── */}
          {step === 'done' && result && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { label: 'Imported', value: result.imported, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50' },
                  { label: 'Skipped', value: result.skipped, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50' },
                  { label: 'Total',   value: result.imported + result.skipped, color: 'text-slate-800 dark:text-slate-200', bg: 'bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`${bg} rounded-2xl p-4`}>
                    <p className={`text-3xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{label}</p>
                  </div>
                ))}
              </div>

              {result.errors.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Skipped rows ({result.errors.length})
                  </h3>
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {result.errors.map((e, i) => (
                      <div key={i} className="flex gap-3 text-xs px-3.5 py-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl">
                        <span className="text-red-500 dark:text-red-400 font-semibold whitespace-nowrap">Row {e.row}</span>
                        {e.email && <span className="text-red-400 font-mono">{e.email}</span>}
                        <span className="text-red-700 dark:text-red-300 flex-1">{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/30">
          <button
            onClick={onClose}
            className="text-slate-600 dark:text-slate-400 text-sm font-medium px-4 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {step === 'done' ? 'Close' : 'Cancel'}
          </button>

          {step === 'map' && (
            <button
              onClick={() => void handleImport()}
              disabled={!hasRequiredFields}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors shadow-xs"
            >
              Import {parseResult?.rowCount} rows →
            </button>
          )}

          {step === 'done' && result && result.imported > 0 && (
            <button
              onClick={() => { onDone(); onClose(); }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors shadow-xs"
            >
              View prospects
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
