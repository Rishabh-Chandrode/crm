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
  company_name?: string;
  created_at: string;
  updated_at: string;
}

export function prospectFullName(p: Pick<Prospect, 'first_name' | 'last_name'>): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ');
}

export type VariableSource = 'prospect' | 'company' | 'static' | 'custom';

export interface TemplateVariable {
  key: string;
  label: string;
  source: VariableSource;
  field?: string;
  defaultValue?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  body: string;
  job_description: string | null;
  variables: TemplateVariable[];
  created_at: string;
  updated_at: string;
}

export type EmailSendStatus = 'pending' | 'sent' | 'failed';

export interface EmailSend {
  id: string;
  template_id: string | null;
  prospect_id: string | null;
  company_id: string | null;
  subject: string | null;
  body: string | null;
  status: EmailSendStatus;
  resend_id: string | null;
  sent_at: string | null;
  error_message: string | null;
  opened_at: string | null;
  open_count: number;
  created_at: string;
  prospect?: { first_name: string; last_name: string | null; email: string; job_title?: string | null };
  company?: { name: string };
  template?: { name: string };
}

export type EmailScheduleStatus = 'pending' | 'sending' | 'sent' | 'cancelled' | 'failed';

export interface EmailSchedule {
  id: string;
  template_id: string | null;
  company_id: string | null;
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
}

export interface EmailScheduleDetail extends EmailSchedule {
  prospects: { id: string; first_name: string; last_name: string | null; email: string; job_title: string | null }[];
}

export interface Document {
  id: string;
  name: string;
  filename: string;
  size: number | null;
  created_at: string;
}

export interface VariablePreset {
  id: string;
  key: string;
  label: string;
  source: VariableSource;
  field: string | null;
  default_value: string;
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
    };
  }
  return { key, label: toVariableLabel(key), source: 'custom', field: undefined, defaultValue: '' };
}

export const PROSPECT_FIELDS: { value: string; label: string }[] = [
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'job_title', label: 'Job Title' },
  { value: 'phone', label: 'Phone' },
  { value: 'linkedin_url', label: 'LinkedIn URL' },
];

export const COMPANY_FIELDS: { value: string; label: string }[] = [
  { value: 'name', label: 'Company Name' },
  { value: 'website', label: 'Website' },
  { value: 'industry', label: 'Industry' },
];
