'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Company, DiscoveredPerson, DiscoverRoleCategory } from '@/lib/types';

interface Props {
  companies?: Company[];
  initialCompany?: string;
  initialDomain?: string;
  onClose: () => void;
  onImportDone: (count: number) => void;
}

const PRESET_TABS: { key: DiscoverRoleCategory; label: string; icon: string; desc: string }[] = [
  { key: 'recruiter', label: 'Recruiters & HR', icon: '🎯', desc: 'Talent Acquisition, Sourcers, Recruiters, Head of People' },
  { key: 'hiring_manager', label: 'Hiring Managers', icon: '💼', desc: 'Engineering Managers, Tech Leads, Directors of Eng' },
  { key: 'executive', label: 'Upper Management', icon: '👑', desc: 'CTO, VP of Engineering, Founders, CEO' },
  { key: 'all', label: 'All Decision Makers', icon: '🌐', desc: 'Combined search across all decision-making roles' },
  { key: 'custom', label: 'Custom Titles', icon: '✏️', desc: 'Specific job titles of your choice' },
];

export default function DiscoverProspectsModal({
  companies = [],
  initialCompany = '',
  initialDomain = '',
  onClose,
  onImportDone,
}: Props) {
  const [companyName, setCompanyName] = useState(initialCompany);
  const [companyDomain, setCompanyDomain] = useState(initialDomain);
  const [roleCategory, setRoleCategory] = useState<DiscoverRoleCategory>('recruiter');
  const [customTitles, setCustomTitles] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<DiscoveredPerson[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [autoEnrich, setAutoEnrich] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

  // If initialCompany is provided on mount, auto-search once
  useEffect(() => {
    if (initialCompany.trim()) {
      void handleSearch();
    }
  }, []);

  async function handleSearch() {
    const targetComp = companyName.trim();
    const targetDom = companyDomain.trim();
    if (!targetComp && !targetDom) {
      setError('Please enter a company name or website domain');
      return;
    }

    setError('');
    setLoading(true);
    setHasSearched(true);
    setImportResult(null);

    try {
      const titles = roleCategory === 'custom' && customTitles.trim()
        ? customTitles.split(',').map((t) => t.trim()).filter(Boolean)
        : undefined;

      const res = await api.prospects.discover({
        company_name: targetComp || undefined,
        company_domain: targetDom || undefined,
        role_category: roleCategory,
        job_titles: titles,
        limit: 25,
      });

      setResults(res.data);
      // Auto-select all that are NOT already in CRM
      const newIds = new Set<string>();
      res.data.forEach((p, idx) => {
        if (!p.already_in_crm) {
          newIds.add(p.id || p.linkedin_url || String(idx));
        }
      });
      setSelectedIds(newIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find decision makers');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  }

  function toggleSelectAll() {
    const nonCrmPeople = results.filter((p) => !p.already_in_crm);
    if (selectedIds.size === nonCrmPeople.length) {
      setSelectedIds(new Set());
    } else {
      const all = new Set<string>();
      nonCrmPeople.forEach((p, idx) => {
        all.add(p.id || p.linkedin_url || String(idx));
      });
      setSelectedIds(all);
    }
  }

  async function handleImport() {
    if (selectedIds.size === 0) return;
    setImporting(true);
    setError('');

    try {
      const toImport = results
        .filter((p, idx) => selectedIds.has(p.id || p.linkedin_url || String(idx)))
        .map((p) => ({
          first_name: p.first_name,
          last_name: p.last_name,
          company_name: p.company_name || companyName.trim(),
          job_title: p.job_title,
          linkedin_url: p.linkedin_url,
          role_category: p.role_category,
          email: p.email,
          auto_enrich_email: autoEnrich,
        }));

      const res = await api.prospects.bulkImport({
        prospects: toImport,
      });

      setImportResult({ imported: res.imported_count, skipped: res.skipped_count });
      onImportDone(res.imported_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🔍</span>
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Discover Decision Makers & Prospects
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Find recruiters, hiring managers, and executives at any company
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Search Controls */}
        <div className="p-6 pb-4 space-y-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Target Company Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Stripe, Airbnb, Google"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Company Website Domain (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. stripe.com"
                value={companyDomain}
                onChange={(e) => setCompanyDomain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Role Category Tabs */}
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Who are you looking for?
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1 bg-zinc-200/50 dark:bg-zinc-800/60 rounded-xl">
              {PRESET_TABS.map((tab) => {
                const active = roleCategory === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setRoleCategory(tab.key)}
                    className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      active
                        ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-sm'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Titles Input */}
          {roleCategory === 'custom' && (
            <div className="animate-in fade-in duration-150">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Job Titles (comma-separated)
              </label>
              <input
                type="text"
                placeholder="e.g. Lead iOS Engineer, Staff Product Manager, Head of Growth"
                value={customTitles}
                onChange={(e) => setCustomTitles(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          )}

          {/* Search Button */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Searching Decision Makers...</span>
                </>
              ) : (
                <>
                  <span>🔍</span>
                  <span>Search Contacts</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {error && (
            <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {importResult && (
            <div className="p-3 text-xs bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
              <span>
                ✅ Successfully imported <strong>{importResult.imported}</strong> prospect(s) into your CRM!
                {importResult.skipped > 0 && ` (${importResult.skipped} skipped as duplicates)`}
              </span>
              <button
                onClick={onClose}
                className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {!hasSearched && !loading && (
            <div className="py-12 text-center text-zinc-400 dark:text-zinc-500 text-xs">
              <span className="text-3xl block mb-2">🏢</span>
              Enter a company name and select a role type above to discover verified recruiters & managers.
            </div>
          )}

          {loading && (
            <div className="py-12 text-center text-zinc-500 dark:text-zinc-400 text-xs space-y-2">
              <svg className="w-6 h-6 animate-spin mx-auto text-zinc-900 dark:text-zinc-100" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p>Scanning company roster for relevant contacts...</p>
            </div>
          )}

          {hasSearched && !loading && results.length === 0 && !error && (
            <div className="py-12 text-center text-zinc-500 dark:text-zinc-400 text-xs">
              <span className="text-3xl block mb-2">🤷</span>
              No matching contacts found at this company. Try a different role category or search keyword.
            </div>
          )}

          {hasSearched && !loading && results.length > 0 && (
            <div className="space-y-2">
              {/* Table header / count */}
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="select-all"
                    checked={
                      results.filter((p) => !p.already_in_crm).length > 0 &&
                      selectedIds.size === results.filter((p) => !p.already_in_crm).length
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 focus:ring-zinc-900"
                  />
                  <label htmlFor="select-all" className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-300">
                    Select All New Contacts ({results.filter((p) => !p.already_in_crm).length})
                  </label>
                </div>
                <span>
                  Found <strong>{results.length}</strong> people at {companyName || companyDomain}
                </span>
              </div>

              {/* Candidate rows */}
              <div className="space-y-1.5">
                {results.map((person, idx) => {
                  const id = person.id || person.linkedin_url || String(idx);
                  const isSelected = selectedIds.has(id);
                  const isAlreadyInCrm = person.already_in_crm;

                  return (
                    <div
                      key={id}
                      onClick={() => !isAlreadyInCrm && toggleSelect(id)}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        isAlreadyInCrm
                          ? 'bg-zinc-50/50 dark:bg-zinc-800/30 border-zinc-100 dark:border-zinc-800/50 opacity-70 cursor-not-allowed'
                          : isSelected
                          ? 'bg-zinc-50 dark:bg-zinc-800/70 border-zinc-300 dark:border-zinc-600 shadow-xs cursor-pointer'
                          : 'bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800/80 hover:border-zinc-200 dark:hover:border-zinc-700 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isAlreadyInCrm}
                          onChange={() => !isAlreadyInCrm && toggleSelect(id)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 focus:ring-zinc-900 disabled:opacity-30"
                        />

                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase">
                          {person.first_name[0] || '?'}{person.last_name?.[0] || ''}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {person.full_name || `${person.first_name} ${person.last_name || ''}`}
                            </span>
                            {person.linkedin_url && (
                              <a
                                href={person.linkedin_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                title="View LinkedIn Profile"
                              >
                                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
                                </svg>
                              </a>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {person.job_title || 'Decision Maker'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isAlreadyInCrm ? (
                          <span className="px-2 py-0.5 text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 rounded-md">
                            Already in CRM
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-md">
                            New Contact
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoEnrich}
              onChange={(e) => setAutoEnrich(e.target.checked)}
              className="rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 focus:ring-zinc-900"
            />
            <span>Auto-enrich verified email on import</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded font-medium">
              1 credit/email
            </span>
          </label>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={selectedIds.size === 0 || importing}
              className="px-4 py-2 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-lg transition-colors shadow-sm disabled:opacity-40 flex items-center gap-2"
            >
              {importing ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <span>📥</span>
                  <span>Import Selected ({selectedIds.size})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
