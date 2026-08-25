export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  username: string;
  email: string | null;
  role: UserRole;
  is_active: boolean;
  first_name: string | null;
  last_name: string | null;
  current_company: string | null;
  job_title: string | null;
  phone: string | null;
  phone_country_code: string | null;
  website: string | null;
  bio: string | null;
  created_at: Date;
  updated_at: Date;
}

export type SenderProfile = Pick<User, 'first_name' | 'last_name' | 'email' | 'current_company' | 'job_title' | 'phone' | 'website'>;

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

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
  role_category: string | null;
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

export type VariableSource = 'prospect' | 'company' | 'static' | 'custom' | 'sender';

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
  document_ids: string[];
  created_at: Date;
  updated_at: Date;
}

export type EmailSendStatus = 'pending' | 'sent' | 'failed';

export interface EmailSend {
  id: string;
  template_id: string | null;
  prospect_id: string | null;
  company_id: string | null;
  job_id?: string | null;
  subject: string | null;
  body: string | null;
  status: EmailSendStatus;
  resend_id: string | null;
  sent_at: Date | null;
  error_message: string | null;
  opened_at: Date | null;
  open_count: number;
  job_url: string | null;
  created_at: Date;
  prospect?: Pick<Prospect, 'first_name' | 'last_name' | 'email'>;
  company?: Pick<Company, 'name'>;
  template?: Pick<EmailTemplate, 'name'>;
  job?: Pick<Job, 'id' | 'title' | 'job_url'>;
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
  created_at: Date;
  updated_at: Date;
  company?: Company;
  application?: JobApplication;
  email_count?: number;
  referral_requested_at?: Date | null;
}

// Job Applications
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
  applied_at: Date;
  created_at: Date;
  updated_at: Date;
  job?: Pick<Job, 'id' | 'title' | 'job_url'>;
  email_count?: number;
  referral_requested_at?: Date | null;
}

export type ApiResponse<T> = {
  data: T;
  message?: string;
};

export type ApiError = {
  error: string;
  details?: unknown;
};

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

