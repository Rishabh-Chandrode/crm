export interface WorkExperienceEntry {
  company: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  description?: string | null;
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
  work_experiences: WorkExperienceEntry[] | null;
}

export type FieldType =
  | 'first_name'
  | 'last_name'
  | 'full_name'
  | 'email'
  | 'phone'
  | 'phone_country_code'
  | 'city'
  | 'state'
  | 'country'
  | 'address_line1'
  | 'postal_code'
  | 'linkedin_url'
  | 'github_url'
  | 'website'
  | 'current_company'
  | 'job_title'
  | 'work_authorization'
  | 'location'
  | 'hometown'
  | 'years_of_experience'
  | 'notice_period'
  | 'current_ctc'
  | 'expected_ctc'
  | 'education'
  | 'college_name'
  | 'graduation_year'
  | 'gender'
  | 'veteran_status';

export const ALL_FIELD_TYPES: FieldType[] = [
  'first_name', 'last_name', 'full_name', 'email', 'phone', 'phone_country_code',
  'city', 'state', 'country', 'address_line1', 'postal_code', 'location', 'hometown',
  'linkedin_url', 'github_url', 'website',
  'current_company', 'job_title', 'work_authorization',
  'years_of_experience', 'notice_period', 'current_ctc', 'expected_ctc',
  'education', 'college_name', 'graduation_year',
  'gender', 'veteran_status',
];

export interface FillResult {
  filled: string[];
  skipped: string[];
  platform: string;
}

export type SelectorMap = Partial<Record<FieldType, string>>;
