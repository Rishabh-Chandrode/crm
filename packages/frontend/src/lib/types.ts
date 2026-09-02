export interface Project {
  id: string;
  name: string;
  description: string;
  tech: string;
  url: string;
  role: string;
}

export interface WorkExperience {
  id: string;
  company: string;
  title: string;
  start_date: string;
  end_date: string;
  location: string;
  description: string;
}

export interface CrmUser {
  id: string;
  username: string;
  email: string | null;
  role: 'admin' | 'user';
  is_active: boolean;
  first_name: string | null;
  last_name: string | null;
  current_company: string | null;
  job_title: string | null;
  phone: string | null;
  phone_country_code: string | null;
  website: string | null;
  bio: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address_line1: string | null;
  postal_code: string | null;
  work_authorization: string | null;
  gender: string | null;
  veteran_status: string | null;
  hometown: string | null;
  years_of_experience: string | null;
  notice_period: string | null;
  current_ctc: string | null;
  expected_ctc: string | null;
  education: string | null;
  college_name: string | null;
  graduation_year: string | null;
  skills: string[];
  projects: Project[];
  work_experiences: WorkExperience[];
  gmail_user: string | null;
  from_name: string | null;
  reply_to_email: string | null;
  has_gmail_configured: boolean;   // OAuth token present
  has_gmail_app_password: boolean; // App password present
  created_at: string;
  updated_at: string;
}

export const SENDER_FIELDS: { value: string; label: string }[] = [
  { value: 'first_name',         label: 'First Name' },
  { value: 'last_name',          label: 'Last Name' },
  { value: 'email',              label: 'Email' },
  { value: 'current_company',    label: 'Current Company' },
  { value: 'job_title',          label: 'Job Title' },
  { value: 'phone',              label: 'Phone' },
  { value: 'website',            label: 'Website' },
  { value: 'linkedin_url',       label: 'LinkedIn URL' },
  { value: 'github_url',         label: 'GitHub URL' },
  { value: 'location',           label: 'Location (combined)' },
  { value: 'city',               label: 'City' },
  { value: 'state',              label: 'State / Province' },
  { value: 'country',            label: 'Country' },
  { value: 'work_authorization', label: 'Work Authorization' },
  { value: 'hometown',           label: 'Hometown' },
  { value: 'years_of_experience', label: 'Years of Experience' },
  { value: 'notice_period',      label: 'Notice Period' },
  { value: 'current_ctc',        label: 'Current CTC / Salary' },
  { value: 'expected_ctc',       label: 'Expected CTC / Salary' },
  { value: 'education',          label: 'Education' },
  { value: 'college_name',       label: 'College / University' },
];

export interface Company {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  prospect_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Prospect {
  id: string;
  company_id: string | null;
  first_name: string;
  last_name: string | null;
  email: string;
  job_title: string | null;
  role_category: string | null;
  linkedin_url: string | null;
  phone: string | null;
  notes: string | null;
  gender?: string | null;
  company_name?: string;
  created_at: string;
  updated_at: string;
}

export function prospectFullName(p: Pick<Prospect, 'first_name' | 'last_name'>): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ');
}

export function getGmailSearchUrl(query: {
  to?: string | null;
  subject?: string | null;
  messageId?: string | null;
}): string {
  const messageId = query.messageId?.trim();
  const to = query.to?.trim();
  const subject = query.subject?.trim();

  // 1. If it's a native Gmail hex ID (16+ hex characters from Gmail REST API), open the exact thread directly
  if (messageId && /^[0-9a-fA-F]{16,}$/.test(messageId)) {
    return `https://mail.google.com/mail/u/0/#all/${messageId}`;
  }

  // 2. If it's an RFC 822 Message-ID (e.g. <abc@domain.com>), search specifically for that Message-ID
  if (messageId && messageId.includes('@')) {
    const cleanId = messageId.replace(/^<|>$/g, '');
    return `https://mail.google.com/mail/u/0/#search/rfc822msgid%3A${encodeURIComponent(cleanId)}`;
  }

  // 3. Fallback: Search by recipient + exact subject
  let q = '';
  if (to && subject) {
    const cleanSubject = subject.replace(/"/g, '');
    q = `to:${to} subject:("${cleanSubject}")`;
  } else if (to) {
    q = `to:${to}`;
  } else if (subject) {
    const cleanSubject = subject.replace(/"/g, '');
    q = `subject:("${cleanSubject}")`;
  }

  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`;
}

export type VariableSource = 'prospect' | 'company' | 'static' | 'custom' | 'sender';

export interface TemplateVariable {
  key: string;
  label: string;
  source: VariableSource;
  field?: string;
  defaultValue?: string;
  maleValue?: string;
  femaleValue?: string;
  fallbackValue?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  body: string;
  job_description: string | null;
  variables: TemplateVariable[];
  document_ids: string[];
  created_at: string;
  updated_at: string;
}

export type EmailSendStatus = 'pending' | 'sent' | 'failed';

export interface EmailSend {
  id: string;
  template_id: string | null;
  prospect_id: string | null;
  company_id: string | null;
  job_id?: string | null;
  recipient_email?: string | null;
  subject: string | null;
  body: string | null;
  status: EmailSendStatus;
  resend_id: string | null;
  sent_at: string | null;
  error_message: string | null;
  opened_at: string | null;
  open_count: number;
  job_url: string | null;
  created_at: string;
  prospect?: { first_name: string; last_name: string | null; email: string; job_title?: string | null };
  company?: { name: string };
  template?: { name: string };
  job?: Pick<Job, 'id' | 'title' | 'job_url'>;
}

export type EmailScheduleStatus = 'pending' | 'sending' | 'sent' | 'cancelled' | 'failed';

export interface EmailSchedule {
  id: string;
  template_id: string | null;
  company_id: string | null;
  job_id?: string | null;
  prospect_ids: string[];
  custom_values: Record<string, string>;
  scheduled_for: string;
  status: EmailScheduleStatus;
  total_prospects: number;
  sent_count: number;
  failed_count: number;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
  company?: { name: string };
  template?: { name: string; subject?: string };
  job?: Pick<Job, 'id' | 'title' | 'job_url'>;
}

export interface EmailScheduleDetail extends EmailSchedule {
  prospects: { id: string; first_name: string; last_name: string | null; email: string; job_title: string | null }[];
}

export interface Document {
  id: string;
  name: string;
  filename: string;
  path?: string | null;
  size: number | null;
  drive_url: string | null;
  drive_file_id?: string | null;
  drive_synced_at: string | null;
  drive_sync_error: string | null;
  created_at: string;
}

export interface VariablePreset {
  id: string;
  key: string;
  label: string;
  source: VariableSource;
  field: string | null;
  default_value: string;
  male_value?: string | null;
  female_value?: string | null;
  created_at: string;
  updated_at: string;
}

export function toVariableLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function buildVariableFromKey(
  key: string,
  presets: VariablePreset[]
): TemplateVariable {
  const preset = presets.find((p) => p.key === key);
  if (preset) {
    return {
      key,
      label: preset.label,
      source: preset.source,
      field: preset.field ?? undefined,
      defaultValue: preset.default_value,
      maleValue: preset.male_value ?? (key === 'salutation' ? 'Sir' : key === 'honorific' ? 'Mr.' : undefined),
      femaleValue: preset.female_value ?? (key === 'salutation' ? 'Ma\'am' : key === 'honorific' ? 'Ms.' : undefined),
    };
  }
  if (key.toLowerCase() === 'salutation') {
    return {
      key,
      label: 'Salutation (Sir/Ma\'am)',
      source: 'prospect',
      field: 'salutation',
      defaultValue: 'Sir/Ma\'am',
      maleValue: 'Sir',
      femaleValue: 'Ma\'am',
    };
  }
  if (key.toLowerCase() === 'honorific') {
    return {
      key,
      label: 'Honorific (Mr./Ms.)',
      source: 'prospect',
      field: 'honorific',
      defaultValue: '',
      maleValue: 'Mr.',
      femaleValue: 'Ms.',
    };
  }
  return { key, label: toVariableLabel(key), source: 'custom', field: undefined, defaultValue: '' };
}

export const PROSPECT_FIELDS: { value: string; label: string }[] = [
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'job_title', label: 'Job Title' },
  { value: 'salutation', label: 'Salutation (Sir / Ma\'am)' },
  { value: 'gender', label: 'Gender' },
  { value: 'honorific', label: 'Honorific (Mr. / Ms.)' },
  { value: 'phone', label: 'Phone' },
  { value: 'linkedin_url', label: 'LinkedIn URL' },
];

export const COMPANY_FIELDS: { value: string; label: string }[] = [
  { value: 'name', label: 'Company Name' },
  { value: 'website', label: 'Website' },
  { value: 'industry', label: 'Industry' },
];

export const JOB_FIELDS: { value: string; label: string }[] = [
  { value: 'title', label: 'Job Title / Role' },
  { value: 'job_url', label: 'Job URL' },
];

// Jobs & Job Opportunities
export type JobStatus = 'open' | 'referral_requested' | 'applied' | 'interviewing' | 'closed';

export interface Job {
  id: string;
  company_id: string | null;
  title: string;
  job_url: string;
  status: JobStatus | string;
  notes: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  company?: Pick<Company, 'id' | 'name' | 'website' | 'industry'>;
  application?: JobApplication;
  email_count?: number;
  referral_requested_at?: string | null;
}

export type JobApplicationStatus =
  | 'not_applied'
  | 'referral_requested'
  | 'applied'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'closed';

export interface JobApplication {
  id: string;
  user_id: string;
  job_id?: string | null;
  company_id?: string | null;
  company_name: string;
  job_title: string;
  job_url: string;
  platform: string;
  status: JobApplicationStatus | string;
  notes: string | null;
  applied_at: string;
  created_at: string;
  updated_at: string;
  job?: Pick<Job, 'id' | 'title' | 'job_url'>;
  email_count?: number;
  referral_requested_at?: string | null;
}

// Enrichment
export interface EnrichmentResult {
  email?: string;
  job_title?: string;
  company_name?: string;
  linkedin_url?: string;
}

// Prospect Discovery & Bulk Import
export type DiscoverRoleCategory = 'recruiter' | 'hiring_manager' | 'executive' | 'all' | 'custom';


export interface DiscoverPeopleRequest {
  company_name?: string;
  company_domain?: string;
  role_category?: DiscoverRoleCategory | string;
  job_titles?: string[];
  seniorities?: string[];
  limit?: number;
  page?: number;
}

export interface DiscoveredPerson {
  id?: string;
  first_name: string;
  last_name?: string;
  full_name?: string;
  job_title?: string;
  role_category?: string;
  company_name?: string;
  linkedin_url?: string;
  email?: string;
  gender?: string | null;
  already_in_crm?: boolean;
  existing_prospect_id?: string;
}

export interface DiscoverPeopleResponse {
  data: DiscoveredPerson[];
  total: number;
  free?: boolean;
  provider: string;
}

export interface BulkImportProspectItem {
  first_name: string;
  last_name?: string;
  company_name?: string;
  job_title?: string;
  linkedin_url?: string;
  role_category?: string;
  email?: string;
  phone?: string;
  notes?: string;
  gender?: string | null;
  auto_enrich_email?: boolean;
}

export interface BulkImportProspectsRequest {
  prospects: BulkImportProspectItem[];
  default_company_id?: string;
}

export interface BulkImportProspectsResponse {
  data: Prospect[];
  imported_count: number;
  skipped_count: number;
  total: number;
}
