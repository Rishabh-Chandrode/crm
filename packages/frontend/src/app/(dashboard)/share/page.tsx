'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { prospectFullName, type Prospect, type LinkedInProspectResult, type ProspectLookupResult } from '@/lib/types';
import { companyOptionsFromShare, inferJobFromUrl, isLinkedInProfileUrl, resolveSharedLink } from '@/lib/shareTarget';

const PLATFORM_OPTIONS = [
  'Greenhouse',
  'Lever',
  'Workday',
  'LinkedIn',
  'Ashby',
  'SmartRecruiters',
  'Email',
  'Direct',
  'Generic',
] as const;

const STATUS_OPTIONS = [
  'not_applied',
  'referral_requested',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
  'closed',
  'ineligible',
] as const;

function formatLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

function OptionChips({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {options.map((option) => {
        const active = option.toLowerCase() === selected.trim().toLowerCase();
        return (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
              active
                ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function ShareForm() {
  const searchParams = useSearchParams();
  const sharedUrl = resolveSharedLink(searchParams.get('url'), searchParams.get('text'));
  const inferred = inferJobFromUrl(sharedUrl, searchParams.get('title') ?? '');

  const [jobUrl, setJobUrl] = useState(inferred.job_url);
  const [company, setCompany] = useState(inferred.company_name);
  const [jobTitle, setJobTitle] = useState(inferred.job_title);
  const [platform, setPlatform] = useState(inferred.platform);
  const [status, setStatus] = useState<string>('not_applied');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedCompany, setSavedCompany] = useState('');
  const [savedJobId, setSavedJobId] = useState<string | null>(null);
  const [savedProspect, setSavedProspect] = useState<LinkedInProspectResult | null>(null);
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [checkingProspect, setCheckingProspect] = useState(false);
  const [existingLookup, setExistingLookup] = useState<ProspectLookupResult | null>(null);
  const profileMode = isLinkedInProfileUrl(jobUrl);

  const companyOptions = companyOptionsFromShare(
    jobUrl,
    searchParams.get('title') ?? '',
    searchParams.get('text') ?? '',
  );

  useEffect(() => {
    api.auth.me()
      .then((res) => setTargetRoles(res.user.target_roles ?? []))
      .catch(() => setTargetRoles([]));
  }, []);

  useEffect(() => {
    if (!profileMode || !jobUrl.trim()) {
      setExistingLookup(null);
      setCheckingProspect(false);
      return;
    }

    let cancelled = false;
    setCheckingProspect(true);

    api.prospects.lookup({ linkedin_url: jobUrl.trim() })
      .then((res) => {
        if (!cancelled) setExistingLookup(res);
      })
      .catch(() => {
        if (!cancelled) setExistingLookup(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingProspect(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobUrl, profileMode]);

  function applyUrl(nextUrl: string) {
    const wasProfile = isLinkedInProfileUrl(jobUrl);
    setJobUrl(nextUrl);
    const next = inferJobFromUrl(nextUrl, jobTitle);
    setPlatform(next.platform);
    if (!company.trim() || wasProfile) setCompany(next.company_name);
  }

  async function handleAddProspect(e: FormEvent) {
    e.preventDefault();
    if (!isLinkedInProfileUrl(jobUrl)) {
      setError('A LinkedIn profile URL is required');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const result = await api.prospects.fromLinkedIn({ linkedin_url: jobUrl.trim() });
      setSavedProspect(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add prospect');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!company.trim()) { setError('Company name is required'); return; }
    if (!jobTitle.trim()) { setError('Job title is required'); return; }
    if (!jobUrl.trim()) { setError('Job URL is required'); return; }

    setSaving(true);
    setError('');
    try {
      const created = await api.applications.create({
        company_name: company.trim(),
        job_title: jobTitle.trim(),
        job_url: jobUrl.trim(),
        platform: platform.trim() || 'Generic',
        status,
        notes: notes.trim() || undefined,
        applied_at: new Date().toISOString(),
      });
      setSavedJobId(created.job_id ?? null);
      setSavedCompany(company.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save application');
    } finally {
      setSaving(false);
    }
  }

  if (savedProspect) {
    if (savedProspect.manual_required || savedProspect.pendingProspect) {
      const p = savedProspect.pendingProspect;
      const name = p ? [p.first_name, p.last_name].filter(Boolean).join(' ') || 'LinkedIn Contact' : 'LinkedIn Contact';
      const companyName = p?.company_name?.trim() ?? '';
      const enterUrl = `/prospects?new=true&firstName=${encodeURIComponent(p?.first_name || '')}&lastName=${encodeURIComponent(p?.last_name || '')}&companyName=${encodeURIComponent(companyName)}&jobTitle=${encodeURIComponent(p?.job_title || '')}&linkedinUrl=${encodeURIComponent(p?.linkedin_url || jobUrl.trim())}${p?.id ? `&pendingId=${p.id}` : ''}`;
      return (
        <div className="p-4 md:p-8 max-w-lg mx-auto">
          <div className="card p-6 space-y-4 border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20">
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-lg">⚡</span>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Manual Entry Required</h1>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Email could not be found via Prospeo or Apollo. An entry was added to your Priority Action Center to manually enter this prospect.
            </p>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">{name}</p>
              {p?.job_title ? <p>{p.job_title}</p> : null}
              {companyName ? <p>{companyName}</p> : null}
              <p className="text-zinc-400 break-all">{p?.linkedin_url || jobUrl.trim()}</p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Link href={enterUrl} className="btn-primary text-xs py-2.5 justify-center">
                Manually Enter Prospect Now
              </Link>
              <Link href="/dashboard" className="btn-secondary text-xs py-2.5 justify-center">
                View Priority Action Center
              </Link>
            </div>
          </div>
        </div>
      );
    }

    if (savedProspect.data) {
      const name = prospectFullName(savedProspect.data);
      const companyName = savedProspect.data.company_name?.trim() ?? '';
      return (
        <div className="p-4 md:p-8 max-w-lg mx-auto">
          <div className="card p-6 space-y-4">
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Saved</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {savedProspect.created
                ? `${name} is in your prospects.`
                : `${name} is already in your prospects.`}
            </p>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
              {savedProspect.data.job_title ? <p>{savedProspect.data.job_title}</p> : null}
              {companyName ? <p>{companyName}</p> : null}
              <p>{savedProspect.data.email}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Link href={`/prospects/${savedProspect.data.id}`} className="btn-primary text-xs py-2.5 justify-center">
                View prospect
              </Link>
              <Link
                href={companyName ? `/send?companyName=${encodeURIComponent(companyName)}` : '/send'}
                className="btn-secondary text-xs py-2.5 justify-center"
              >
                Send email
              </Link>
            </div>
          </div>
        </div>
      );
    }
  }

  if (savedCompany) {
    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto">
        <div className="card p-6 space-y-4">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Saved</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {savedCompany} is in your applications.
          </p>
          <div className="flex flex-col gap-2">
            <Link href="/applications" className="btn-primary text-xs py-2.5 justify-center">
              View applications
            </Link>
            <Link
              href={savedJobId
                ? `/send?jobId=${encodeURIComponent(savedJobId)}&companyName=${encodeURIComponent(savedCompany)}`
                : `/send?companyName=${encodeURIComponent(savedCompany)}`}
              className="btn-secondary text-xs py-2.5 justify-center"
            >
              Send email
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (profileMode) {
    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto space-y-4">
        <div className="pb-1 border-b border-zinc-200/80 dark:border-zinc-800/80">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Shared profile</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">
            Add this LinkedIn profile as a prospect. Name, title, company, and email come from enrichment.
          </p>
        </div>

        {checkingProspect && (
          <div className="card p-4 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <svg className="animate-spin h-3.5 w-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Checking CRM for this profile…
          </div>
        )}

        {!checkingProspect && existingLookup?.data && (
          <div className="card p-4 sm:p-5 space-y-3 border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20">
            <div className="flex items-center gap-2">
              <span className="text-emerald-500 text-base font-bold">✓</span>
              <h2 className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                Already in your CRM
              </h2>
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-0.5">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                {prospectFullName(existingLookup.data)}
              </p>
              {existingLookup.data.job_title && <p>{existingLookup.data.job_title}</p>}
              {existingLookup.data.company_name && (
                <p className="font-medium text-zinc-700 dark:text-zinc-200">{existingLookup.data.company_name}</p>
              )}
              {existingLookup.data.email && (
                <p className="font-mono text-[11px] text-zinc-500">{existingLookup.data.email}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                href={`/prospects/${existingLookup.data.id}`}
                className="btn-primary text-xs py-2 px-3.5 justify-center"
              >
                View prospect
              </Link>
              <Link
                href={
                  existingLookup.data.company_name
                    ? `/send?companyName=${encodeURIComponent(existingLookup.data.company_name)}`
                    : '/send'
                }
                className="btn-secondary text-xs py-2 px-3.5 justify-center"
              >
                Send email
              </Link>
            </div>
          </div>
        )}

        {!checkingProspect && !existingLookup?.data && existingLookup?.pending && (
          <div className="card p-4 sm:p-5 space-y-3 border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20">
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-base">⚡</span>
              <h2 className="text-sm font-bold text-amber-900 dark:text-amber-100">
                Pending in Priority Action Center
              </h2>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              This profile was previously shared without an email. You can manually enter the contact details.
            </p>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-0.5">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                {[existingLookup.pending.first_name, existingLookup.pending.last_name].filter(Boolean).join(' ') || 'LinkedIn Contact'}
              </p>
              {existingLookup.pending.job_title && <p>{existingLookup.pending.job_title}</p>}
              {existingLookup.pending.company_name && <p>{existingLookup.pending.company_name}</p>}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                href={`/prospects?new=true&firstName=${encodeURIComponent(existingLookup.pending.first_name || '')}&lastName=${encodeURIComponent(existingLookup.pending.last_name || '')}&companyName=${encodeURIComponent(existingLookup.pending.company_name || '')}&jobTitle=${encodeURIComponent(existingLookup.pending.job_title || '')}&linkedinUrl=${encodeURIComponent(existingLookup.pending.linkedin_url || jobUrl.trim())}&pendingId=${existingLookup.pending.id}`}
                className="btn-primary text-xs py-2 px-3.5 justify-center"
              >
                Manually Enter Prospect Now
              </Link>
            </div>
          </div>
        )}

        <form onSubmit={(e) => void handleAddProspect(e)} className="card p-4 sm:p-5 space-y-3.5">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-medium border border-rose-200 dark:border-rose-900">
              {error}
            </div>
          )}

          <div>
            <label className="form-label text-xs" htmlFor="share-url">Profile URL *</label>
            <input
              id="share-url"
              type="url"
              value={jobUrl}
              onChange={(e) => applyUrl(e.target.value)}
              placeholder="https://www.linkedin.com/in/"
              className="form-input text-sm"
              required
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="btn-primary w-full py-2.5 text-xs font-semibold justify-center"
          >
            {saving ? 'Adding…' : existingLookup?.data ? 'Re-enrich / update prospect' : 'Add prospect'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto space-y-4">
      <div className="pb-1 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Shared job</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">
          Confirm the company and role, then save this link to your applications.
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="card p-4 sm:p-5 space-y-3.5">
        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-medium border border-rose-200 dark:border-rose-900">
            {error}
          </div>
        )}

        <div>
          <label className="form-label text-xs" htmlFor="share-url">Job URL *</label>
          <input
            id="share-url"
            type="url"
            value={jobUrl}
            onChange={(e) => applyUrl(e.target.value)}
            placeholder="https://"
            className="form-input text-sm"
            required
          />
        </div>

        <div>
          <label className="form-label text-xs" htmlFor="share-company">Company *</label>
          <input
            id="share-company"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company"
            className="form-input text-sm"
            required
          />
          <OptionChips options={companyOptions} selected={company} onSelect={setCompany} />
        </div>

        <div>
          <label className="form-label text-xs" htmlFor="share-title">Role *</label>
          <input
            id="share-title"
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="Role"
            className="form-input text-sm"
            required
          />
          {targetRoles.length > 0 ? (
            <OptionChips options={targetRoles} selected={jobTitle} onSelect={setJobTitle} />
          ) : (
            <p className="text-[11px] text-zinc-400 mt-2">
              Add target roles on your{' '}
              <Link href="/profile?tab=preferences" className="underline">Profile</Link>.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label text-xs" htmlFor="share-platform">Platform</label>
            <select
              id="share-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="form-select text-sm"
            >
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label text-xs" htmlFor="share-status">Status</label>
            <select
              id="share-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="form-select text-sm"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{formatLabel(option)}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="form-label text-xs" htmlFor="share-notes">Notes</label>
          <textarea
            id="share-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="form-input text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary w-full py-2.5 text-xs font-semibold justify-center"
        >
          {saving ? 'Saving…' : 'Save application'}
        </button>
      </form>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-zinc-400">Loading…</div>}>
      <ShareForm />
    </Suspense>
  );
}
