export type VariableSource = 'prospect' | 'company' | 'static' | 'custom';

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
