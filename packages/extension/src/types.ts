export type VariableSource = 'prospect' | 'company' | 'static' | 'custom' | 'sender';

export interface TemplateVariable {
  key: string;
  label: string;
  source: VariableSource;
  field?: string;
  defaultValue?: string;
}

export interface TemplateInfo {
  id: string;
  name: string;
  variables: TemplateVariable[];
}

export interface ProspectData {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  jobTitle: string;
  linkedinUrl: string;
}

export interface Settings {
  backendUrl: string;
}

export interface AuthState {
  token: string;
  username: string;
  role: string;
  email?: string;
}

export interface ScrapeMessage {
  action: 'scraped';
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  linkedinUrl: string;
  email?: string;
}

export interface WorkExperience {
  id?: string;
  company: string;
  title: string;
  start_date?: string;
  end_date?: string;
  location?: string;
  description?: string;
}

export interface Project {
  id?: string;
  name: string;
  description?: string;
  tech?: string;
  url?: string;
  role?: string;
}

export interface UserProfile {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  phone_country_code: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address_line1: string | null;
  postal_code: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  website: string | null;
  current_company: string | null;
  job_title: string | null;
  work_authorization: string | null;
  location: string | null;
  hometown: string | null;
  years_of_experience: string | null;
  notice_period: string | null;
  current_ctc: string | null;
  expected_ctc: string | null;
  education: string | null;
  college_name: string | null;
  graduation_year: string | null;
  gender: string | null;
  veteran_status: string | null;
  skills: string[] | null;
  projects: Project[] | null;
  work_experiences: WorkExperience[] | null;
}

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

export interface AutofillResultMessage {
  action: 'autofillResult';
  filled: string[];
  skipped: string[];
  platform: string;
  error?: string;
}

export interface ScrapeErrorMessage {
  action: 'scrapeError';
  error: string;
}

export interface TriggerScrapeMessage {
  action: 'triggerScrape';
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

export interface Company {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  created_at: string | Date;
  updated_at: string | Date;
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
  created_at: string | Date;
  updated_at: string | Date;
  company?: Company;
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
