'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { CrmUser, Document, Project, WorkExperience } from '@/lib/types';

// ─── types ─────────────────────────────────────────────────────────────────────

type Tab = 'personal' | 'work' | 'education' | 'resume' | 'projects' | 'skills';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'personal', label: 'Personal Info',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
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
    id: 'resume', label: 'Resume Files',
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
    <div className="mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{description}</p>
    </div>
  );
}

function Alert({ type, message }: { type: 'error' | 'success'; message: string }) {
  const s = type === 'error'
    ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300'
    : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300';
  return <div className={`border rounded-xl px-4 py-3 text-xs font-medium mb-4 ${s}`}>{message}</div>;
}

function SaveRow({ saving, onSave, error, success }: { saving: boolean; onSave: () => void; error?: string; success?: string }) {
  return (
    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
      {error   && <Alert type="error"   message={error} />}
      {success && <Alert type="success" message={success} />}
      <button
        onClick={onSave}
        disabled={saving}
        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-xs"
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  );
}

function FieldGroup({ label }: { label: string }) {
  return <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider pt-2">{label}</p>;
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

      <div className="space-y-4">
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
                className="form-input text-xs w-20 shrink-0"
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
        <p className="text-[11px] text-slate-400 -mt-2">
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
            <div className="form-input text-xs flex items-center gap-2 text-slate-500 bg-slate-50 dark:bg-slate-950">
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
              className="rounded border-slate-300 dark:border-slate-700 text-indigo-600"
            />
            <span className="text-[11px] text-slate-500">Currently working here</span>
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
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-xs"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button onClick={onCancel} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-semibold px-4 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

function WorkTab({ user }: { user: CrmUser }) {
  const [experiences, setExperiences] = useState<WorkExperience[]>(user.work_experiences ?? []);
  const [jobForm, setJobForm] = useState({
    current_company:     user.current_company     ?? '',
    job_title:           user.job_title           ?? '',
    years_of_experience: user.years_of_experience ?? '',
    notice_period:       user.notice_period       ?? '',
    current_ctc:         user.current_ctc         ?? '',
    expected_ctc:        user.expected_ctc        ?? '',
  });
  const [savingJob, setSavingJob] = useState(false);
  const [savingExp, setSavingExp] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [adding,  setAdding]  = useState(false);
  const [draft,   setDraft]   = useState<WorkDraft>(EMPTY_WORK);
  const [editId,  setEditId]  = useState<string | null>(null);

  useEffect(() => {
    setExperiences(user.work_experiences ?? []);
    setJobForm({
      current_company:     user.current_company     ?? '',
      job_title:           user.job_title           ?? '',
      years_of_experience: user.years_of_experience ?? '',
      notice_period:       user.notice_period       ?? '',
      current_ctc:         user.current_ctc         ?? '',
      expected_ctc:        user.expected_ctc        ?? '',
    });
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

  async function saveJob() {
    setSavingJob(true); setError(''); setSuccess('');
    try {
      await api.auth.updateProfile({
        current_company:     jobForm.current_company.trim()     || null,
        job_title:           jobForm.job_title.trim()           || null,
        years_of_experience: jobForm.years_of_experience.trim() || null,
        notice_period:       jobForm.notice_period.trim()       || null,
        current_ctc:         jobForm.current_ctc.trim()         || null,
        expected_ctc:        jobForm.expected_ctc.trim()        || null,
      });
      setSuccess('Job search preferences saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSavingJob(false); }
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
      <SectionHeader title="Work Experience" description="Your employment history and job search details — used to autofill job application forms." />

      {/* Experience list */}
      <div className="space-y-3 mb-4">
        {experiences.map(exp => (
          <div key={exp.id} className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-950/40">
            {editId === exp.id ? (
              <div className="p-4 bg-white dark:bg-slate-900">
                <ExpForm draft={draft} setDraft={setDraft} saving={savingExp} onSubmit={commitEdit} submitLabel="Save" onCancel={cancelEdit} />
              </div>
            ) : (
              <div className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{exp.title}{exp.company && ` · ${exp.company}`}</p>
                  {(exp.start_date || exp.end_date) && (
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5 font-medium">
                      {formatMonthYear(exp.start_date)}{exp.end_date ? ` — ${formatMonthYear(exp.end_date)}` : ''}
                      {exp.location ? ` · ${exp.location}` : ''}
                    </p>
                  )}
                  {exp.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed whitespace-pre-wrap">{exp.description}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEdit(exp)} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => void persistExp(experiences.filter(x => x.id !== exp.id))} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div className="border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/50 dark:bg-indigo-950/40 rounded-2xl p-4 mb-6">
          <ExpForm draft={draft} setDraft={setDraft} saving={savingExp} onSubmit={commitAdd} submitLabel="Add experience" onCancel={cancelEdit} />
        </div>
      ) : (
        <button
          onClick={() => { setAdding(true); setEditId(null); setDraft(EMPTY_WORK); }}
          className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Experience
        </button>
      )}

      {/* Job search info */}
      <div className="border-t border-slate-100 dark:border-slate-800 pt-6 mt-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Job Search Preferences</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {jobInp('current_company', 'Current company', 'Acme Inc.')}
            {jobInp('job_title',       'Current job title', 'Software Engineer')}
          </div>
          {jobInp('years_of_experience', 'Total years of experience', '5')}
          {jobInp('notice_period', 'Notice period', 'Immediate · 30 days · 60 days')}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {jobInp('current_ctc',  'Current CTC / salary',  '$140,000')}
            {jobInp('expected_ctc', 'Expected CTC / salary', '$175,000')}
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
          {error   && <Alert type="error"   message={error} />}
          {success && <Alert type="success" message={success} />}
          <button
            onClick={() => void saveJob()}
            disabled={savingJob}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-xs"
          >
            {savingJob ? 'Saving…' : 'Save Preferences'}
          </button>
        </div>
      </div>
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

      <div className="space-y-4">
        {inp('education',       'Degree / Qualification', 'B.S. in Computer Science')}
        {inp('college_name',    'College / University',   'University of California, Berkeley')}
        {inp('graduation_year', 'Graduation year',        '2022')}
      </div>

      <SaveRow saving={saving} onSave={() => void save()} error={error} success={success} />
    </div>
  );
}

// ─── resume files tab ───────────────────────────────────────────────────────────

function ResumeTab() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading,  setUploading]  = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api.documents.list().then(r => setDocuments(r.data)).catch(console.error);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function upload() {
    if (!uploadFile) return;
    setUploading(true); setError(''); setSuccess('');
    try {
      await api.documents.upload(uploadFile, uploadName || uploadFile.name);
      setUploadFile(null); setUploadName('');
      if (fileRef.current) fileRef.current.value = '';
      setSuccess('File uploaded successfully.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally { setUploading(false); }
  }

  async function del(id: string) {
    try {
      await api.documents.delete(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div>
      <SectionHeader title="Resume Files" description="Upload your resume and cover letter files. These can be attached when sending outreach emails." />

      <div className="border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-5 mb-5 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Upload New Resume or Document</p>
        <input
          ref={fileRef}
          type="file"
          className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-950 file:text-indigo-700 dark:file:text-indigo-300 hover:file:bg-indigo-100 cursor-pointer"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) { setUploadFile(f); setUploadName(f.name.replace(/\.[^.]+$/, '')); }
          }}
        />
        {uploadFile && (
          <div className="space-y-2 pt-2">
            {error   && <Alert type="error"   message={error} />}
            {success && <Alert type="success" message={success} />}
            <div className="flex gap-2">
              <input
                className="form-input text-xs flex-1"
                placeholder="Display name"
                value={uploadName}
                onChange={e => setUploadName(e.target.value)}
              />
              <button
                onClick={() => void upload()}
                disabled={uploading}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl shrink-0 transition-colors shadow-xs"
              >
                {uploading ? 'Uploading…' : 'Upload File'}
              </button>
            </div>
          </div>
        )}
        {!uploadFile && (error || success) && (
          <div>
            {error   && <Alert type="error"   message={error} />}
            {success && <Alert type="success" message={success} />}
          </div>
        )}
      </div>

      {documents.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">No resume documents uploaded yet.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map(doc => (
            <li key={doc.id} className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{doc.name}</p>
                <p className="text-[11px] text-slate-400 font-mono">
                  {doc.filename}{formatBytes(doc.size) ? ` · ${formatBytes(doc.size)}` : ''}
                </p>
              </div>
              <button
                onClick={() => void del(doc.id)}
                className="ml-3 shrink-0 p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
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
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-xs"
          >
            {saving ? 'Saving…' : submitLabel}
          </button>
          <button onClick={cancelEdit} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-semibold px-4 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
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
      <div className="space-y-3 mb-4">
        {projects.map(p => (
          <div key={p.id} className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-950/40">
            {editId === p.id ? (
              <div className="p-4 bg-white dark:bg-slate-900">
                <ProjectForm onSubmit={commitEdit} submitLabel="Save project" />
              </div>
            ) : (
              <div className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{p.name}</p>
                  {p.role && <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5 font-medium">{p.role}</p>}
                  {p.description && <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">{p.description}</p>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {p.tech && (
                      <span className="text-[11px] bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-0.5 rounded-md font-mono">{p.tech}</span>
                    )}
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1">
                        Link →
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(p)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => void persist(projects.filter(x => x.id !== p.id))}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div className="border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/50 dark:bg-indigo-950/40 rounded-2xl p-4">
          <ProjectForm onSubmit={commitAdd} submitLabel="Add project" />
        </div>
      ) : (
        <button
          onClick={() => { setAdding(true); setEditId(null); setDraft(EMPTY_PROJECT); }}
          className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Project
        </button>
      )}
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

      <div className="flex flex-wrap gap-2 mb-5 min-h-[44px] p-3.5 bg-slate-50 dark:bg-slate-950/50 border border-slate-200/90 dark:border-slate-800 rounded-2xl">
        {skills.map(skill => (
          <span
            key={skill}
            className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold px-3 py-1 rounded-full shadow-xs"
          >
            {skill}
            <button
              onClick={() => removeSkill(skill)}
              className="text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200 transition-colors ml-0.5"
            >
              ✕
            </button>
          </span>
        ))}
        {skills.length === 0 && (
          <p className="text-xs text-slate-400 py-1">No skills added yet.</p>
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
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl shrink-0 transition-colors shadow-xs"
        >
          Add Skill
        </button>
      </div>

      <p className="text-[11px] text-slate-400 mt-2">
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

  const tab = (searchParams.get('tab') as Tab | null) ?? 'personal';

  function goTab(id: Tab) {
    router.replace(`/profile?tab=${id}`);
  }

  useEffect(() => {
    api.auth.me()
      .then(r => { setUser(r.user); setLoading(false); })
      .catch(console.error);
  }, []);

  if (loading) {
    return <div className="p-8 text-sm text-slate-400">Loading profile…</div>;
  }
  if (!user) {
    return <div className="p-8 text-sm text-red-500">Could not load profile data.</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Candidate Profile</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Your autofill details and resume files — used by the browser extension to fill job applications.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-5 items-start">
        {/* Left nav */}
        <nav className="w-full md:w-52 shrink-0 flex flex-row md:flex-col overflow-x-auto gap-1.5 md:gap-1 pb-1 md:pb-0 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => goTab(t.id)}
              className={`flex-none md:w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all text-left whitespace-nowrap ${
                tab === t.id
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        {/* Content panel */}
        <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-xs min-w-0 w-full">
          {tab === 'personal'  && <PersonalTab  user={user} />}
          {tab === 'work'      && <WorkTab      user={user} />}
          {tab === 'education' && <EducationTab user={user} />}
          {tab === 'resume'    && <ResumeTab />}
          {tab === 'projects'  && <ProjectsTab  initialProjects={user.projects ?? []} />}
          {tab === 'skills'    && <SkillsTab    initialSkills={user.skills ?? []} />}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-400">Loading…</div>}>
      <ProfileContent />
    </Suspense>
  );
}
