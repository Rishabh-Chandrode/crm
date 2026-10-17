'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { CrmUser, Document, DocumentDailySync, Project, WorkExperience } from '@/lib/types';

// ─── types ─────────────────────────────────────────────────────────────────────

type Tab = 'personal' | 'preferences' | 'work' | 'education' | 'documents' | 'projects' | 'skills';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'personal', label: 'Personal Info',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  },
  {
    id: 'preferences', label: 'Job Preferences',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" /></svg>,
  },
  {
    id: 'work', label: 'Work Experience',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  },
  {
    id: 'education', label: 'Education',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" /></svg>,
  },
  {
    id: 'documents', label: 'Documents',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  },
  {
    id: 'projects', label: 'Projects',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>,
  },
  {
    id: 'skills', label: 'Skills',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
  },
];

// ─── shared helpers ─────────────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{description}</p>
    </div>
  );
}

function Alert({ type, message }: { type: 'error' | 'success'; message: string }) {
  const s = type === 'error'
    ? 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300';
  return <div className={`border rounded-xl px-3.5 py-2.5 text-xs font-medium mb-4 ${s}`}>{message}</div>;
}

function SaveRow({ saving, onSave, error, success }: { saving: boolean; onSave: () => void; error?: string; success?: string }) {
  return (
    <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
      {error   && <Alert type="error"   message={error} />}
      {success && <Alert type="success" message={success} />}
      <button
        onClick={onSave}
        disabled={saving}
        className="btn-primary"
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  );
}

function FieldGroup({ label }: { label: string }) {
  return <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider pt-2">{label}</p>;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── personal info tab ─────────────────────────────────────────────────────────

function PersonalTab({ user }: { user: CrmUser }) {
  const [form, setForm] = useState({
    first_name: user.first_name ?? '', last_name: user.last_name ?? '',
    email: user.email ?? '', phone: user.phone ?? '', phone_country_code: user.phone_country_code ?? '',
    website: user.website ?? '',
    linkedin_url: user.linkedin_url ?? '', github_url: user.github_url ?? '',
    location: user.location ?? '', city: user.city ?? '',
    state: user.state ?? '', country: user.country ?? '',
    address_line1: user.address_line1 ?? '', postal_code: user.postal_code ?? '',
    hometown: user.hometown ?? '', work_authorization: user.work_authorization ?? '',
    gender: user.gender ?? '',
    veteran_status: user.veteran_status ?? '',
    bio: user.bio ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setForm({
      first_name: user.first_name ?? '', last_name: user.last_name ?? '',
      email: user.email ?? '', phone: user.phone ?? '', phone_country_code: user.phone_country_code ?? '',
      website: user.website ?? '',
      linkedin_url: user.linkedin_url ?? '', github_url: user.github_url ?? '',
      location: user.location ?? '', city: user.city ?? '',
      state: user.state ?? '', country: user.country ?? '',
      address_line1: user.address_line1 ?? '', postal_code: user.postal_code ?? '',
      hometown: user.hometown ?? '', work_authorization: user.work_authorization ?? '',
      gender: user.gender ?? '',
      veteran_status: user.veteran_status ?? '',
      bio: user.bio ?? '',
    });
  }, [user]);

  function inp(id: keyof typeof form, label: string, placeholder?: string, type = 'text') {
    return (
      <div key={id}>
        <label className="form-label text-xs">{label}</label>
        <input
          className="form-input text-xs" type={type} placeholder={placeholder}
          value={form[id]}
          onChange={e => setForm(p => ({ ...p, [id]: e.target.value }))}
        />
      </div>
    );
  }

  async function save() {
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.auth.updateProfile({
        first_name: form.first_name.trim() || null,
        last_name:  form.last_name.trim()  || null,
        email:      form.email.trim()      || null,
        phone:      form.phone.trim()      || null,
        phone_country_code: form.phone_country_code.trim() || null,
        website:    form.website.trim()    || null,
        linkedin_url: form.linkedin_url.trim() || null,
        github_url:   form.github_url.trim()   || null,
        location:   form.location.trim()   || null,
        city:         form.city.trim()         || null,
        state:        form.state.trim()        || null,
        country:      form.country.trim()      || null,
        address_line1: form.address_line1.trim() || null,
        postal_code:  form.postal_code.trim()  || null,
        hometown:     form.hometown.trim()     || null,
        work_authorization: form.work_authorization.trim() || null,
        gender:         form.gender || null,
        veteran_status: form.veteran_status || null,
        bio:        form.bio.trim()        || null,
      });
      setSuccess('Profile updated successfully.');
    } catch (e) {
      if (e instanceof Error && 'fields' in e) {
        const fields = (e as Error & { fields: Record<string, string> }).fields;
        setError(Object.entries(fields).map(([f, m]) => `${f.replace(/_/g, ' ')}: ${m}`).join(' · '));
      } else {
        setError(e instanceof Error ? e.message : 'Save failed');
      }
    } finally { setSaving(false); }
  }

  return (
    <div>
      <SectionHeader title="Personal Info" description="Your identity and contact details — used by the extension to fill job application forms." />

      <div className="space-y-3.5">
        <FieldGroup label="Name" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {inp('first_name', 'First name', 'Jane')}
          {inp('last_name',  'Last name',  'Smith')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label text-xs">Gender</label>
            <select
              className="form-select text-xs"
              value={form.gender}
              onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}
            >
              <option value="">Prefer not to say</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Non-binary">Non-binary</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="form-label text-xs">Veteran status</label>
            <select
              className="form-select text-xs"
              value={form.veteran_status}
              onChange={e => setForm(p => ({ ...p, veteran_status: e.target.value }))}
            >
              <option value="">Prefer not to say</option>
              <option value="I am not a protected veteran">I am not a protected veteran</option>
              <option value="I identify as one or more of the classifications of a protected veteran">I am a protected veteran</option>
              <option value="I don't wish to answer">I don&apos;t wish to answer</option>
            </select>
          </div>
        </div>

        <FieldGroup label="Contact" />
        {inp('email', 'Email address', 'jane@example.com', 'email')}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label text-xs">Phone</label>
            <div className="flex gap-2">
              <input
                className="form-input text-xs w-16 shrink-0"
                type="text"
                placeholder="+1"
                value={form.phone_country_code}
                onChange={e => setForm(p => ({ ...p, phone_country_code: e.target.value }))}
              />
              <input
                className="form-input text-xs flex-1"
                type="tel"
                placeholder="555-000-0000"
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              />
            </div>
          </div>
          {inp('website', 'Website', 'https://yoursite.com', 'url')}
        </div>

        <FieldGroup label="Online profiles" />
        {inp('linkedin_url', 'LinkedIn URL', 'https://linkedin.com/in/yourname', 'url')}
        {inp('github_url',   'GitHub URL',   'https://github.com/yourname',      'url')}

        <FieldGroup label="Location" />
        {inp('location', 'Current location (combined)', 'San Francisco, CA, USA')}
        <p className="text-[11px] text-zinc-400 -mt-1.5">
          Single-line location string — used by Lever and similar ATS platforms
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {inp('city',    'City',             'San Francisco')}
          {inp('state',   'State / Province', 'California')}
          {inp('country', 'Country',          'United States')}
        </div>
        {inp('address_line1', 'Address Line 1', '123 Main St, Apt 4B')}
        <div className="grid grid-cols-2 gap-3">
          {inp('postal_code', 'Postal / ZIP Code', '94105')}
          <div />
        </div>
        {inp('hometown', 'Hometown / birthplace', 'New York, NY')}

        <FieldGroup label="Work authorization" />
        {inp('work_authorization', 'Authorization status', 'US Citizen · Green Card · H1B')}

        <FieldGroup label="Bio" />
        <div>
          <label className="form-label text-xs">Short bio</label>
          <textarea
            className="form-textarea text-xs" rows={3}
            placeholder="A brief intro about yourself…"
            value={form.bio}
            onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
          />
        </div>
      </div>

      <SaveRow saving={saving} onSave={() => void save()} error={error} success={success} />
    </div>
  );
}

// ─── work experience tab ────────────────────────────────────────────────────────

const EMPTY_WORK: Omit<WorkExperience, 'id'> = {
  company: '', title: '', start_date: '', end_date: 'Present', location: '', description: '',
};

type WorkDraft = Omit<WorkExperience, 'id'>;

function formatMonthYear(value: string): string {
  if (!value || value === 'Present') return value;
  const [year, month] = value.split('-');
  if (!year || !month) return value;
  return new Date(Number(year), Number(month) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function ExpForm({
  draft, setDraft, saving, onSubmit, submitLabel, onCancel,
}: {
  draft: WorkDraft;
  setDraft: React.Dispatch<React.SetStateAction<WorkDraft>>;
  saving: boolean;
  onSubmit: () => void;
  submitLabel: string;
  onCancel: () => void;
}) {
  const isPresent = draft.end_date === 'Present';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="form-label text-xs">Company *</label>
          <input className="form-input text-xs" placeholder="Acme Inc." value={draft.company}
            onChange={e => setDraft(p => ({ ...p, company: e.target.value }))} />
        </div>
        <div>
          <label className="form-label text-xs">Job title *</label>
          <input className="form-input text-xs" placeholder="Software Engineer" value={draft.title}
            onChange={e => setDraft(p => ({ ...p, title: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="form-label text-xs">Start date</label>
          <input
            type="month"
            className="form-input text-xs"
            value={draft.start_date}
            onChange={e => setDraft(p => ({ ...p, start_date: e.target.value }))}
          />
        </div>
        <div>
          <label className="form-label text-xs">End date</label>
          {isPresent ? (
            <div className="form-input text-xs flex items-center gap-2 text-zinc-500 bg-zinc-50 dark:bg-zinc-950">
              Currently working here
            </div>
          ) : (
            <input
              type="month"
              className="form-input text-xs"
              value={draft.end_date}
              onChange={e => setDraft(p => ({ ...p, end_date: e.target.value }))}
            />
          )}
          <label className="flex items-center gap-2 mt-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPresent}
              onChange={e => setDraft(p => ({ ...p, end_date: e.target.checked ? 'Present' : '' }))}
              className="rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
            />
            <span className="text-[11px] text-zinc-500">Currently working here</span>
          </label>
        </div>
        <div>
          <label className="form-label text-xs">Location</label>
          <input className="form-input text-xs" placeholder="San Francisco, CA" value={draft.location}
            onChange={e => setDraft(p => ({ ...p, location: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="form-label text-xs">Description</label>
        <textarea className="form-textarea text-xs" rows={3}
          placeholder="Key responsibilities and achievements…"
          value={draft.description}
          onChange={e => setDraft(p => ({ ...p, description: e.target.value }))} />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSubmit}
          disabled={saving || (!draft.company.trim() && !draft.title.trim())}
          className="btn-primary"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}

function JobPreferencesTab({ user }: { user: CrmUser }) {
  const [jobForm, setJobForm] = useState({
    current_company:     user.current_company     ?? '',
    job_title:           user.job_title           ?? '',
    years_of_experience: user.years_of_experience ?? '',
    notice_period:       user.notice_period       ?? '',
    current_ctc:         user.current_ctc         ?? '',
    expected_ctc:        user.expected_ctc        ?? '',
  });

  const [targetSkills, setTargetSkills] = useState('');
  const [preferredLocations, setPreferredLocations] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [minExp, setMinExp] = useState('');
  const [maxExp, setMaxExp] = useState('');
  const [prefNotes, setPrefNotes] = useState('');

  const [savingJob, setSavingJob] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setJobForm({
      current_company:     user.current_company     ?? '',
      job_title:           user.job_title           ?? '',
      years_of_experience: user.years_of_experience ?? '',
      notice_period:       user.notice_period       ?? '',
      current_ctc:         user.current_ctc         ?? '',
      expected_ctc:        user.expected_ctc        ?? '',
    });
    if (user.years_of_experience && !minExp) {
      setMinExp(user.years_of_experience);
    }
    if (user.skills && user.skills.length > 0 && !targetSkills) {
      setTargetSkills(user.skills.join(', '));
    }
    if (user.location && !preferredLocations) {
      setPreferredLocations(user.location);
    }

    // Load candidate preferences
    api.applications?.getPreferences?.()
      ?.then(res => {
        const p = res?.data;
        if (!p) return;
        if (p.target_skills?.length) {
          setTargetSkills(p.target_skills.join(', '));
        }
        if (p.preferred_locations?.length) {
          setPreferredLocations(p.preferred_locations.join(', '));
        }
        if (p.remote_only !== undefined) {
          setRemoteOnly(Boolean(p.remote_only));
        }
        if (p.min_experience_years !== undefined) {
          setMinExp(String(p.min_experience_years));
        }
        if (p.max_experience_years !== undefined) {
          setMaxExp(String(p.max_experience_years));
        }
        if (p.notes) {
          setPrefNotes(p.notes);
        }
      })
      ?.catch(() => {
        // ignore if not yet configured
      });
  }, [user]);

  async function saveJob() {
    setSavingJob(true); setError(''); setSuccess('');
    try {
      const skillsArray = targetSkills.split(',').map(s => s.trim()).filter(Boolean);
      const locationsArray = preferredLocations.split(',').map(s => s.trim()).filter(Boolean);
      const minExpNum = minExp.trim() ? parseInt(minExp.trim(), 10) : undefined;
      const maxExpNum = maxExp.trim() ? parseInt(maxExp.trim(), 10) : undefined;

      const promises: Promise<unknown>[] = [
        api.auth.updateProfile({
          current_company:     jobForm.current_company.trim()     || null,
          job_title:           jobForm.job_title.trim()           || null,
          years_of_experience: minExp.trim() || jobForm.years_of_experience.trim() || null,
          notice_period:       jobForm.notice_period.trim()       || null,
          current_ctc:         jobForm.current_ctc.trim()         || null,
          expected_ctc:        jobForm.expected_ctc.trim()        || null,
        }),
      ];

      if (api.applications?.updatePreferences) {
        promises.push(
          api.applications.updatePreferences({
            target_skills: skillsArray,
            preferred_locations: locationsArray,
            remote_only: remoteOnly,
            min_experience_years: minExpNum,
            max_experience_years: maxExpNum,
            min_salary: jobForm.expected_ctc.trim() || undefined,
            notes: prefNotes.trim() || undefined,
          })
        );
      }

      await Promise.all(promises);
      setSuccess('Job preferences saved successfully. Email sync and opportunity scoring will evaluate incoming jobs using these preferences.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSavingJob(false); }
  }

  function jobInp(key: keyof typeof jobForm, label: string, placeholder?: string) {
    return (
      <div key={key}>
        <label className="form-label text-xs">{label}</label>
        <input
          className="form-input text-xs" placeholder={placeholder}
          value={jobForm[key]}
          onChange={e => setJobForm(p => ({ ...p, [key]: e.target.value }))}
        />
      </div>
    );
  }

  return (
    <div>
      <SectionHeader
        title="Job Preferences"
        description="Target roles, skills, locations, compensation, and criteria used to autofill job applications and evaluate job fit."
      />
      <div className="space-y-4">
        <FieldGroup label="Target Roles & Criteria" />
        <TargetRolesEditor initialRoles={user.target_roles ?? []} />

        <div>
          <label className="form-label text-xs">Core Skills &amp; Tech Stack (evaluated for fit)</label>
          <input
            className="form-input text-xs"
            placeholder="e.g. React, TypeScript, Node.js, PostgreSQL, Docker, AWS"
            value={targetSkills}
            onChange={e => setTargetSkills(e.target.value)}
          />
          <p className="text-[11px] text-zinc-400 mt-1">Comma-separated skills used by the AI/matching engine to evaluate job fit percentage.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label text-xs">Min Experience (years)</label>
            <input
              type="number"
              min="0"
              className="form-input text-xs"
              placeholder="e.g. 2"
              value={minExp}
              onChange={e => setMinExp(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label text-xs">Max Experience (years)</label>
            <input
              type="number"
              min="0"
              className="form-input text-xs"
              placeholder="e.g. 6"
              value={maxExp}
              onChange={e => setMaxExp(e.target.value)}
            />
          </div>
        </div>

        <FieldGroup label="Location & Work Mode" />
        <div>
          <label className="form-label text-xs">Preferred Locations</label>
          <input
            className="form-input text-xs"
            placeholder="e.g. Remote, Bangalore, San Francisco, New York"
            value={preferredLocations}
            onChange={e => setPreferredLocations(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 pt-0.5">
          <input
            type="checkbox"
            id="remoteOnlyPref"
            checked={remoteOnly}
            onChange={e => setRemoteOnly(e.target.checked)}
            className="rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 focus:ring-0 cursor-pointer"
          />
          <label htmlFor="remoteOnlyPref" className="text-xs font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer select-none">
            Prefer 100% Remote positions only
          </label>
        </div>

        <FieldGroup label="Current Role & Compensation" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {jobInp('current_company', 'Current company', 'Acme Inc.')}
          {jobInp('job_title',       'Current job title', 'Software Engineer')}
        </div>
        {jobInp('notice_period', 'Notice period', 'Immediate · 30 days · 60 days')}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {jobInp('current_ctc',  'Current CTC / salary',  '$140,000')}
          {jobInp('expected_ctc', 'Expected CTC / Min salary', '$175,000')}
        </div>

        <FieldGroup label="Scoring Criteria Notes" />
        <div>
          <label className="form-label text-xs">Evaluation Notes (Optional)</label>
          <textarea
            className="form-textarea text-xs resize-none"
            rows={2}
            placeholder="e.g. Prioritize Series A–C product startups, fintech or developer tools companies…"
            value={prefNotes}
            onChange={e => setPrefNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        {error   && <Alert type="error"   message={error} />}
        {success && <Alert type="success" message={success} />}
        <button
          onClick={() => void saveJob()}
          disabled={savingJob}
          className="btn-primary"
        >
          {savingJob ? 'Saving…' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}

function WorkTab({ user }: { user: CrmUser }) {
  const [experiences, setExperiences] = useState<WorkExperience[]>(user.work_experiences ?? []);
  const [savingExp, setSavingExp] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [adding,  setAdding]  = useState(false);
  const [draft,   setDraft]   = useState<WorkDraft>(EMPTY_WORK);
  const [editId,  setEditId]  = useState<string | null>(null);

  useEffect(() => {
    setExperiences(user.work_experiences ?? []);
  }, [user]);

  async function persistExp(updated: WorkExperience[]) {
    setSavingExp(true); setError(''); setSuccess('');
    try {
      await api.auth.updateProfile({ work_experiences: updated });
      setExperiences(updated);
      setSuccess('Work experience saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSavingExp(false); }
  }

  function commitAdd() {
    if (!draft.company.trim() && !draft.title.trim()) return;
    void persistExp([...experiences, { ...draft, id: crypto.randomUUID() }]);
    setAdding(false); setDraft(EMPTY_WORK);
  }

  function commitEdit() {
    if (!editId) return;
    void persistExp(experiences.map(e => e.id === editId ? { ...draft, id: editId } : e));
    setEditId(null); setDraft(EMPTY_WORK);
  }

  function startEdit(exp: WorkExperience) {
    setEditId(exp.id);
    setDraft({ company: exp.company, title: exp.title, start_date: exp.start_date,
               end_date: exp.end_date, location: exp.location, description: exp.description });
    setAdding(false);
  }

  function cancelEdit() { setEditId(null); setAdding(false); setDraft(EMPTY_WORK); }

  return (
    <div>
      <SectionHeader title="Work Experience" description="Your employment history — used to autofill job application forms." />

      {/* Experience list */}
      <div className="space-y-2.5 mb-4">
        {experiences.map(exp => (
          <div key={exp.id} className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-zinc-50/50 dark:bg-zinc-950/40">
            {editId === exp.id ? (
              <div className="p-3.5 bg-white dark:bg-zinc-900">
                <ExpForm draft={draft} setDraft={setDraft} saving={savingExp} onSubmit={commitEdit} submitLabel="Save" onCancel={cancelEdit} />
              </div>
            ) : (
              <div className="p-3.5 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{exp.title}{exp.company && ` · ${exp.company}`}</p>
                  {(exp.start_date || exp.end_date) && (
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 font-medium">
                      {formatMonthYear(exp.start_date)}{exp.end_date ? ` — ${formatMonthYear(exp.end_date)}` : ''}
                      {exp.location ? ` · ${exp.location}` : ''}
                    </p>
                  )}
                  {exp.description && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed whitespace-pre-wrap">{exp.description}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEdit(exp)} className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => void persistExp(experiences.filter(x => x.id !== exp.id))} className="p-1 text-zinc-400 hover:text-rose-500 rounded transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {adding ? (
        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl p-3.5 mb-5">
          <ExpForm draft={draft} setDraft={setDraft} saving={savingExp} onSubmit={commitAdd} submitLabel="Add experience" onCancel={cancelEdit} />
        </div>
      ) : (
        <button
          onClick={() => { setAdding(true); setEditId(null); setDraft(EMPTY_WORK); }}
          className="btn-secondary text-xs mb-5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Experience
        </button>
      )}
      {error   && <Alert type="error"   message={error} />}
      {success && <Alert type="success" message={success} />}
    </div>
  );
}

// ─── education tab ─────────────────────────────────────────────────────────────

function EducationTab({ user }: { user: CrmUser }) {
  const [form, setForm] = useState({
    education:       user.education       ?? '',
    college_name:    user.college_name    ?? '',
    graduation_year: user.graduation_year ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setForm({
      education:       user.education       ?? '',
      college_name:    user.college_name    ?? '',
      graduation_year: user.graduation_year ?? '',
    });
  }, [user]);

  function inp(id: keyof typeof form, label: string, placeholder?: string) {
    return (
      <div key={id}>
        <label className="form-label text-xs">{label}</label>
        <input
          className="form-input text-xs" placeholder={placeholder}
          value={form[id]}
          onChange={e => setForm(p => ({ ...p, [id]: e.target.value }))}
        />
      </div>
    );
  }

  async function save() {
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.auth.updateProfile({
        education:       form.education.trim()       || null,
        college_name:    form.college_name.trim()    || null,
        graduation_year: form.graduation_year.trim() || null,
      });
      setSuccess('Education updated.');
    } catch (e) {
      if (e instanceof Error && 'fields' in e) {
        const fields = (e as Error & { fields: Record<string, string> }).fields;
        setError(Object.entries(fields).map(([f, m]) => `${f.replace(/_/g, ' ')}: ${m}`).join(' · '));
      } else {
        setError(e instanceof Error ? e.message : 'Save failed');
      }
    } finally { setSaving(false); }
  }

  return (
    <div>
      <SectionHeader title="Education" description="Your academic background — used to fill education fields in job applications." />

      <div className="space-y-3">
        {inp('education',       'Degree / Qualification', 'B.S. in Computer Science')}
        {inp('college_name',    'College / University',   'University of California, Berkeley')}
        {inp('graduation_year', 'Graduation year',        '2022')}
      </div>

      <SaveRow saving={saving} onSave={() => void save()} error={error} success={success} />
    </div>
  );
}

// ─── documents tab ──────────────────────────────────────────────────────────────

function DocumentsTab() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [name, setName]           = useState('');
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [showDrive, setShowDrive]     = useState(false);
  const [driveName, setDriveName]     = useState('');
  const [driveUrl, setDriveUrl]       = useState('');
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError]   = useState('');
  const [syncingId, setSyncingId]     = useState<string | null>(null);
  const [dailySync, setDailySync]     = useState<DocumentDailySync>({ enabled: false, last_synced_at: null });
  const [dailyBusy, setDailyBusy]     = useState(false);

  useEffect(() => {
    api.documents.list().then((r) => setDocuments(r.data)).catch(console.error);
    api.documents.dailySync.get().then((r) => setDailySync(r.data)).catch(console.error);
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
  }

  async function handleUpload() {
    if (!pendingFile) { fileRef.current?.click(); return; }
    if (!name.trim()) { setError('Please enter a label for this document'); return; }
    setError(''); setSuccess(''); setUploading(true);
    try {
      const r = await api.documents.upload(pendingFile, name.trim());
      setDocuments((prev) => [r.data, ...prev]);
      setSuccess(`"${r.data.name}" uploaded.`);
      setName(''); setPendingFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally { setUploading(false); }
  }

  async function handleAddFromDrive() {
    if (!driveName.trim() || !driveUrl.trim()) return;
    setDriveError('');
    setDriveLoading(true);
    try {
      const r = await api.documents.fromDrive(driveName.trim(), driveUrl.trim());
      setDocuments((prev) => [r.data, ...prev]);
      setSuccess(`"${r.data.name}" linked from Drive.`);
      setDriveName(''); setDriveUrl(''); setShowDrive(false);
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Failed to fetch from Drive');
    } finally { setDriveLoading(false); }
  }

  async function handleSync(doc: Document) {
    setError(''); setSuccess(''); setSyncingId(doc.id);
    try {
      const r = await api.documents.sync(doc.id);
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? r.data : d)));
      setSuccess(`"${doc.name}" updated from Google Drive.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-fetch document from Google Drive');
    } finally {
      setSyncingId(null);
    }
  }

  async function toggleDailySync() {
    const next = !dailySync.enabled;
    setError(''); setSuccess(''); setDailyBusy(true);
    try {
      const r = await api.documents.dailySync.set(next);
      setDailySync(r.data);
      if (next) {
        const list = await api.documents.list();
        setDocuments(list.data);
        setSuccess('Daily refetch is on. Drive documents were updated and will refresh every day.');
      } else {
        setSuccess('Daily refetch is off. Use Re-fetch on a document to update it yourself.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update daily refetch');
    } finally {
      setDailyBusy(false);
    }
  }

  async function handleDelete(id: string, docName: string) {
    if (!confirm(`Remove "${docName}"?`)) return;
    setError(''); setSuccess('');
    try {
      await api.documents.delete(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setSuccess(`"${docName}" removed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div>
      <SectionHeader
        title="Documents"
        description="Resumes, cover letters, and portfolios. The browser extension attaches the file you pick here when autofilling job applications. The same files can be attached to outreach emails."
      />

      <div className="flex items-center justify-between gap-3 mb-4 px-3.5 py-3 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Daily refetch</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {dailySync.enabled
              ? `Drive-linked documents update once a day.${dailySync.last_synced_at ? ` Last update ${new Date(dailySync.last_synced_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.` : ''}`
              : 'Turn this on to re-fetch every Drive-linked document once a day.'}
          </p>
        </div>
        <button
          onClick={() => void toggleDailySync()}
          disabled={dailyBusy}
          className={dailySync.enabled ? 'btn-ghost shrink-0' : 'btn-primary shrink-0'}
        >
          {dailyBusy ? 'Updating…' : dailySync.enabled ? 'Turn off daily refetch' : 'Refetch daily'}
        </button>
      </div>

      {error   && <Alert type="error"   message={error} />}
      {success && <Alert type="success" message={success} />}

      <div className="bg-zinc-50/50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3 mb-4">
        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Upload a file</p>
        <div>
          <label className="form-label text-xs">Label *</label>
          <input
            className="form-input text-xs"
            placeholder="e.g. Backend Resume, Cover Letter – Stripe"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label text-xs">
            File * <span className="text-zinc-400 font-normal">(PDF, DOC, DOCX · max 10 MB)</span>
          </label>
          {pendingFile ? (
            <div className="flex items-center gap-2.5 px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-lg text-xs">
              <svg className="w-4 h-4 text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="flex-1 truncate text-zinc-800 dark:text-zinc-200 font-medium">{pendingFile.name}</span>
              <button
                onClick={() => { setPendingFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                className="text-zinc-400 hover:text-rose-500 transition-colors p-1"
              >✕</button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-2 w-full border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 rounded-lg px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors bg-white/50 dark:bg-zinc-900/30"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Choose file to upload
            </button>
          )}
        </div>
        <button
          onClick={() => void handleUpload()}
          disabled={uploading || !pendingFile || !name.trim()}
          className="btn-primary"
        >
          {uploading ? 'Uploading…' : 'Upload document'}
        </button>
      </div>

      <div className="bg-zinc-50/50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mb-4">
        <button
          onClick={() => { setShowDrive((v) => !v); setDriveError(''); }}
          className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors w-full text-left cursor-pointer"
        >
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.28 3l5.74 9.94L6.28 21H2.1l5.74-9.94L2.1 3h4.18zm7.44 0l5.74 9.94-5.74 9.06h-4.18l5.74-9.06L9.54 3h4.18z"/>
          </svg>
          Link from Google Drive / Docs
          <svg className={`w-3.5 h-3.5 text-zinc-400 ml-auto transition-transform ${showDrive ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showDrive && (
          <div className="mt-3 space-y-2.5 pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Paste a public Google Drive or Google Docs link. The document will be cached locally and can be re-fetched on demand.
            </p>
            <div>
              <label className="form-label text-xs">Label *</label>
              <input
                className="form-input text-xs"
                placeholder="e.g. My Resume"
                value={driveName}
                onChange={(e) => setDriveName(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label text-xs">Google Drive URL *</label>
              <input
                className="form-input text-xs"
                placeholder="https://drive.google.com/file/d/… or docs.google.com/document/d/…"
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
              />
            </div>
            {driveError && <p className="text-xs text-rose-600 dark:text-rose-400">{driveError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => void handleAddFromDrive()}
                disabled={driveLoading || !driveName.trim() || !driveUrl.trim()}
                className="btn-primary"
              >
                {driveLoading ? 'Fetching…' : 'Fetch & save'}
              </button>
              <button
                onClick={() => { setShowDrive(false); setDriveError(''); setDriveName(''); setDriveUrl(''); }}
                className="btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileChange} />

      {documents.length === 0 ? (
        <p className="text-zinc-400 text-xs text-center py-6">No documents added yet.</p>
      ) : (
        <div className="space-y-1.5">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 px-3.5 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-850/60 transition-colors">
              <div className="w-7 h-7 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0 text-zinc-600 dark:text-zinc-300">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{doc.name}</p>
                  {doc.drive_url && (
                    <span className="flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-1.5 py-0.2 rounded flex-shrink-0 font-medium">
                      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6.28 3l5.74 9.94L6.28 21H2.1l5.74-9.94L2.1 3h4.18zm7.44 0l5.74 9.94-5.74 9.06h-4.18l5.74-9.06L9.54 3h4.18z"/>
                      </svg>
                      Drive
                    </span>
                  )}
                  {doc.drive_sync_error && (
                    <span className="text-[10px] text-rose-500" title={doc.drive_sync_error}>sync error</span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                  {doc.filename}
                  {doc.size ? ` · ${formatBytes(doc.size)}` : ''}
                  {doc.drive_url && doc.drive_synced_at
                    ? ` · synced ${new Date(doc.drive_synced_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}`
                    : ` · ${new Date(doc.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}`}
                </p>
              </div>
              {doc.drive_url && (
                <button
                  onClick={() => void handleSync(doc)}
                  disabled={syncingId === doc.id}
                  className="flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 rounded transition-colors flex-shrink-0 disabled:opacity-50"
                  title="Re-fetch file from Google Drive"
                >
                  <svg className={`w-3 h-3 ${syncingId === doc.id ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {syncingId === doc.id ? 'Re-fetching…' : 'Re-fetch'}
                </button>
              )}
              <button
                onClick={() => void handleDelete(doc.id, doc.name)}
                className="text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline px-2 py-1 rounded transition-colors flex-shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── projects tab ───────────────────────────────────────────────────────────────

const EMPTY_PROJECT: Omit<Project, 'id'> = { name: '', description: '', tech: '', url: '', role: '' };

function ProjectsTab({ initialProjects }: { initialProjects: Project[] }) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [adding,  setAdding]  = useState(false);
  const [draft,   setDraft]   = useState<Omit<Project, 'id'>>(EMPTY_PROJECT);
  const [editId,  setEditId]  = useState<string | null>(null);

  useEffect(() => { setProjects(initialProjects); }, [initialProjects]);

  async function persist(updated: Project[]) {
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.auth.updateProfile({ projects: updated });
      setProjects(updated);
      setSuccess('Projects saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  function commitAdd() {
    if (!draft.name.trim()) return;
    void persist([...projects, { ...draft, id: crypto.randomUUID() }]);
    setAdding(false); setDraft(EMPTY_PROJECT);
  }

  function commitEdit() {
    if (!editId) return;
    void persist(projects.map(p => p.id === editId ? { ...draft, id: editId } : p));
    setEditId(null); setDraft(EMPTY_PROJECT);
  }

  function startEdit(p: Project) {
    setEditId(p.id);
    setDraft({ name: p.name, description: p.description, tech: p.tech, url: p.url, role: p.role });
    setAdding(false);
  }

  function cancelEdit() { setEditId(null); setAdding(false); setDraft(EMPTY_PROJECT); }

  function draftInp(key: keyof Omit<Project, 'id'>, label: string, placeholder?: string) {
    return (
      <div key={key}>
        <label className="form-label text-xs">{label}</label>
        <input
          className="form-input text-xs" placeholder={placeholder}
          value={draft[key]}
          onChange={e => setDraft(p => ({ ...p, [key]: e.target.value }))}
        />
      </div>
    );
  }

  function ProjectForm({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) {
    return (
      <div className="space-y-3">
        {draftInp('name', 'Project name *', 'Realtime Collaboration Engine')}
        <div>
          <label className="form-label text-xs">Description</label>
          <textarea
            className="form-textarea text-xs" rows={2}
            placeholder="Briefly describe what this project does and your impact…"
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {draftInp('tech', 'Tech stack', 'React, TypeScript, Go, PostgreSQL')}
          {draftInp('role', 'Your role',  'Lead Engineer')}
        </div>
        {draftInp('url', 'Project URL', 'https://github.com/you/project')}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onSubmit}
            disabled={saving || !draft.name.trim()}
            className="btn-primary"
          >
            {saving ? 'Saving…' : submitLabel}
          </button>
          <button onClick={cancelEdit} className="btn-ghost">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title="Projects" description="Highlight your notable work. Used to fill project-related fields in job applications." />
      {error   && <Alert type="error"   message={error} />}
      {success && <Alert type="success" message={success} />}
      <div className="space-y-2.5 mb-4">
        {projects.map(p => (
          <div key={p.id} className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-zinc-50/50 dark:bg-zinc-950/40">
            {editId === p.id ? (
              <div className="p-3.5 bg-white dark:bg-zinc-900">
                <ProjectForm onSubmit={commitEdit} submitLabel="Save project" />
              </div>
            ) : (
              <div className="p-3.5 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{p.name}</p>
                  {p.role && <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 font-medium">{p.role}</p>}
                  {p.description && <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">{p.description}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {p.tech && (
                      <span className="text-[10px] bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded font-mono">{p.tech}</span>
                    )}
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-zinc-800 dark:text-zinc-200 hover:underline font-semibold flex items-center gap-1">
                        Link →
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(p)}
                    className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => void persist(projects.filter(x => x.id !== p.id))}
                    className="p-1 text-zinc-400 hover:text-rose-500 rounded transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {adding ? (
        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl p-3.5">
          <ProjectForm onSubmit={commitAdd} submitLabel="Add project" />
        </div>
      ) : (
        <button
          onClick={() => { setAdding(true); setEditId(null); setDraft(EMPTY_PROJECT); }}
          className="btn-secondary text-xs"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Project
        </button>
      )}
    </div>
  );
}

function TargetRolesEditor({ initialRoles }: { initialRoles: string[] }) {
  const [roles, setRoles] = useState<string[]>(initialRoles);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draftRef = useRef('');

  useEffect(() => { setRoles(initialRoles); }, [initialRoles]);

  async function persist(updated: string[]) {
    setSaving(true);
    setError('');
    try {
      await api.auth.updateProfile({ target_roles: updated });
      setRoles(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function addRoles() {
    const raw = draftRef.current;
    if (!raw.trim()) return;
    draftRef.current = '';
    const next = raw
      .split(/[,;]+/)
      .map((role) => role.trim())
      .filter((role) => role && !roles.some((existing) => existing.toLowerCase() === role.toLowerCase()));
    setInput('');
    if (!next.length) return;
    void persist([...roles, ...next]);
  }

  function onDraftChange(value: string) {
    draftRef.current = value;
    setInput(value);
  }

  return (
    <div>
      <label className="form-label text-xs" htmlFor="target-roles-input">Target roles</label>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[36px]">
        {roles.map((role) => (
          <span
            key={role}
            className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-medium px-2.5 py-0.5 rounded-full"
          >
            {role}
            <button
              type="button"
              onClick={() => void persist(roles.filter((item) => item !== role))}
              className="text-zinc-400 hover:text-rose-500 transition-colors ml-0.5 cursor-pointer"
              aria-label={`Remove ${role}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addRoles();
        }}
      >
        <input
          id="target-roles-input"
          className="form-input text-xs flex-1"
          placeholder="SDE, SDE1, backend developer"
          value={input}
          enterKeyHint="done"
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRoles(); } }}
          onBlur={() => addRoles()}
          disabled={saving}
        />
        <button type="submit" disabled={saving || !input.trim()} className="btn-primary text-xs shrink-0">
          Add role
        </button>
      </form>
      {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
    </div>
  );
}

// ─── skills tab ─────────────────────────────────────────────────────────────────

function SkillsTab({ initialSkills }: { initialSkills: string[] }) {
  const [skills,  setSkills]  = useState<string[]>(initialSkills);
  const [input,   setInput]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { setSkills(initialSkills); }, [initialSkills]);

  async function persist(updated: string[]) {
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.auth.updateProfile({ skills: updated });
      setSkills(updated);
      setSuccess('Skills saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  function addSkill() {
    const newSkills = input
      .split(/[,;]+/)
      .map(s => s.trim())
      .filter(s => s && !skills.includes(s));
    if (!newSkills.length) { setInput(''); return; }
    void persist([...skills, ...newSkills]);
    setInput('');
  }

  function removeSkill(skill: string) {
    void persist(skills.filter(s => s !== skill));
  }

  return (
    <div>
      <SectionHeader title="Skills" description="List your technical and professional skills — used to fill skill fields in job applications." />
      {error   && <Alert type="error"   message={error} />}
      {success && <Alert type="success" message={success} />}

      <div className="flex flex-wrap gap-1.5 mb-4 min-h-[40px] p-3 bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl">
        {skills.map(skill => (
          <span
            key={skill}
            className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-medium px-2.5 py-0.5 rounded-full"
          >
            {skill}
            <button
              onClick={() => removeSkill(skill)}
              className="text-zinc-400 hover:text-rose-500 transition-colors ml-0.5 cursor-pointer"
            >
              ✕
            </button>
          </span>
        ))}
        {skills.length === 0 && (
          <p className="text-xs text-zinc-400 py-1">No skills added yet.</p>
        )}
      </div>

      <div className="flex gap-2">
        <input
          className="form-input text-xs flex-1"
          placeholder="Type a skill and press Enter — e.g. React, TypeScript, GraphQL"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
          disabled={saving}
        />
        <button
          onClick={addSkill}
          disabled={saving || !input.trim()}
          className="btn-primary"
        >
          Add Skill
        </button>
      </div>

      <p className="text-[11px] text-zinc-400 mt-2">
        Tip: You can paste a comma-separated list to add multiple skills at once.
      </p>
    </div>
  );
}

// ─── page ───────────────────────────────────────────────────────────────────────

function ProfileContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const [user,    setUser]    = useState<CrmUser | null>(null);
  const [loading, setLoading] = useState(true);

  const requested = searchParams.get('tab');
  const tab = ((requested === 'resume' ? 'documents' : requested) ?? 'personal') as Tab;

  function goTab(id: Tab) {
    router.replace(`/profile?tab=${id}`);
  }

  useEffect(() => {
    api.auth.me()
      .then(r => { setUser(r.user); setLoading(false); })
      .catch(console.error);
  }, []);

  if (loading) {
    return <div className="p-8 text-xs text-zinc-400">Loading profile…</div>;
  }
  if (!user) {
    return <div className="p-8 text-xs text-rose-500">Could not load profile data.</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="pb-1 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Candidate Profile</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Your autofill details and documents — used by the browser extension to fill job applications.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-5 items-start">
        {/* Left nav */}
        <nav className="w-full md:w-52 shrink-0 flex flex-row md:flex-col overflow-x-auto gap-1 md:gap-0.5 pb-1 md:pb-0 card p-1.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => goTab(t.id)}
              className={`flex-none md:w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left whitespace-nowrap cursor-pointer ${
                tab === t.id
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-850 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <span className={tab === t.id ? 'text-white dark:text-zinc-900' : 'text-zinc-400'}>
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </nav>

        {/* Content panel */}
        <div className="flex-1 card p-5 md:p-6 min-w-0 w-full">
          {tab === 'personal'     && <PersonalTab    user={user} />}
          {tab === 'preferences'  && <JobPreferencesTab   user={user} />}
          {tab === 'work'         && <WorkTab        user={user} />}
          {tab === 'education' && <EducationTab user={user} />}
          {tab === 'documents' && <DocumentsTab />}
          {tab === 'projects'  && <ProjectsTab  initialProjects={user.projects ?? []} />}
          {tab === 'skills'    && <SkillsTab    initialSkills={user.skills ?? []} />}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-zinc-400">Loading…</div>}>
      <ProfileContent />
    </Suspense>
  );
}

