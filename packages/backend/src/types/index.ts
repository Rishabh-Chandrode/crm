export interface Company {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Prospect {
  id: string;
  company_id: string | null;
  first_name: string;
  last_name: string | null;
  email: string;
  job_title: string | null;
  linkedin_url: string | null;
  phone: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  company?: Company;
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
  created_at: Date;
  updated_at: Date;
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
  sent_at: Date | null;
  error_message: string | null;
  created_at: Date;
  prospect?: Pick<Prospect, 'first_name' | 'last_name' | 'email'>;
  company?: Pick<Company, 'name'>;
  template?: Pick<EmailTemplate, 'name'>;
}

export type ApiResponse<T> = {
  data: T;
  message?: string;
};

export type ApiError = {
  error: string;
  details?: unknown;
};
