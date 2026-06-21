const BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)crm_token=([^;]*)/);
  return match ? decodeURIComponent(match[1] ?? '') : null;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const json = (await res.json()) as unknown;

  if (!res.ok) {
    if (
      typeof json === 'object' && json !== null &&
      'error' in json && 'fields' in json &&
      typeof (json as { fields: unknown }).fields === 'object'
    ) {
      const fields = (json as { fields: Record<string, string> }).fields;
      const lines = Object.entries(fields).map(([f, m]) => `${f}: ${m}`).join('\n');
      const err = new Error(lines) as Error & { fields: Record<string, string> };
      err.fields = fields;
      throw err;
    }
    const msg =
      typeof json === 'object' && json !== null && 'error' in json
        ? String((json as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return json as T;
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<{ token: string; user: { id: string; username: string; email: string | null; role: string } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    me: () => request<{ user: import('./types').CrmUser }>('/auth/me'),
    updateProfile: (body: {
      first_name?: string | null; last_name?: string | null; email?: string | null;
      current_company?: string | null; job_title?: string | null; phone?: string | null; phone_country_code?: string | null;
      website?: string | null; bio?: string | null;
      linkedin_url?: string | null; github_url?: string | null;
      location?: string | null; city?: string | null; state?: string | null;
      country?: string | null; work_authorization?: string | null;
      gender?: string | null; veteran_status?: string | null;
      hometown?: string | null; years_of_experience?: string | null;
      notice_period?: string | null; current_ctc?: string | null; expected_ctc?: string | null;
      education?: string | null; college_name?: string | null;
      graduation_year?: string | null;
      skills?: string[]; projects?: import('./types').Project[];
      work_experiences?: import('./types').WorkExperience[];
      from_name?: string | null; reply_to_email?: string | null;
    }) =>
      request<{ user: import('./types').CrmUser }>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    gmailConnect: () =>
      request<{ url: string }>('/auth/gmail/connect'),
    gmailDisconnect: () =>
      request<{ ok: boolean }>('/auth/gmail/disconnect', { method: 'DELETE' }),
    gmailSaveAppPassword: (gmail_user: string, app_password: string) =>
      request<{ ok: boolean }>('/auth/gmail/app-password', {
        method: 'POST',
        body: JSON.stringify({ gmail_user, app_password }),
      }),
    gmailRemoveAppPassword: () =>
      request<{ ok: boolean }>('/auth/gmail/app-password', { method: 'DELETE' }),
    googleLoginUrl: () =>
      request<{ url: string }>('/auth/google/connect'),
    signup: (username: string, password: string, email?: string) =>
      request<{ token: string; user: { id: string; username: string; email: string | null; role: string } }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ username, password, email }),
      }),
  },

  users: {
    list: () => request<{ data: import('./types').CrmUser[] }>('/users'),
    create: (body: { username: string; password: string; email?: string; role?: string }) =>
      request<{ data: import('./types').CrmUser }>('/users', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: { email?: string; role?: string; is_active?: boolean; password?: string }) =>
      request<{ data: import('./types').CrmUser }>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ data: { id: string } }>(`/users/${id}`, { method: 'DELETE' }),
  },

  companies: {
    list: () => request<{ data: import('./types').Company[] }>('/companies'),
    get: (id: string) =>
      request<{ data: import('./types').Company & { prospects: import('./types').Prospect[] } }>(
        `/companies/${id}`
      ),
    create: (body: Partial<import('./types').Company>) =>
      request<{ data: import('./types').Company }>('/companies', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Partial<import('./types').Company>) =>
      request<{ data: import('./types').Company }>(`/companies/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ data: { id: string } }>(`/companies/${id}`, { method: 'DELETE' }),
    merge: (targetId: string, sourceId: string) =>
      request<{ data: { targetId: string; sourceId: string; merged: boolean } }>(`/companies/${targetId}/merge`, {
        method: 'POST',
        body: JSON.stringify({ sourceId }),
      }),
  },

  prospects: {
    list: (params?: {
      companyId?: string;
      roleCategory?: string;
      search?: string;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    }) => {
      const p = new URLSearchParams();
      if (params?.companyId) p.set('company_id', params.companyId);
      if (params?.roleCategory) p.set('role_category', params.roleCategory);
      if (params?.search) p.set('search', params.search);
      if (params?.sortBy) p.set('sort_by', params.sortBy);
      if (params?.sortDir) p.set('sort_dir', params.sortDir);
      if (params?.limit != null) p.set('limit', String(params.limit));
      if (params?.offset != null) p.set('offset', String(params.offset));
      const qs = p.toString();
      return request<{ data: import('./types').Prospect[]; total: number }>(
        qs ? `/prospects?${qs}` : '/prospects'
      );
    },
    get: (id: string) => request<{ data: import('./types').Prospect }>(`/prospects/${id}`),
    create: (body: Partial<import('./types').Prospect>) =>
      request<{ data: import('./types').Prospect }>('/prospects', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Partial<import('./types').Prospect>) =>
      request<{ data: import('./types').Prospect }>(`/prospects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ data: { id: string } }>(`/prospects/${id}`, { method: 'DELETE' }),
  },

  templates: {
    list: () =>
      request<{ data: import('./types').EmailTemplate[] }>('/templates'),
    get: (id: string) =>
      request<{ data: import('./types').EmailTemplate }>(`/templates/${id}`),
    create: (body: Partial<import('./types').EmailTemplate>) =>
      request<{ data: import('./types').EmailTemplate }>('/templates', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Partial<import('./types').EmailTemplate>) =>
      request<{ data: import('./types').EmailTemplate }>(`/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ data: { id: string } }>(`/templates/${id}`, { method: 'DELETE' }),
    detectVariables: (id: string, existing: import('./types').TemplateVariable[]) =>
      request<{
        data: {
          detected: string[];
          newVariables: import('./types').TemplateVariable[];
        };
      }>(`/templates/${id}/detect-variables`, {
        method: 'POST',
        body: JSON.stringify({ existing }),
      }),
  },

  email: {
    preview: (templateId: string, prospectId: string, customValues?: Record<string, string>) =>
      request<{ data: { subject: string; body: string; html: string } }>('/email/preview', {
        method: 'POST',
        body: JSON.stringify({ templateId, prospectId, customValues }),
      }),
    send: (templateId: string, prospectId: string, customValues?: Record<string, string>, documentIds?: string[]) =>
      request<{ data: { id: string; status: string } }>('/email/send', {
        method: 'POST',
        body: JSON.stringify({ templateId, prospectId, customValues, documentIds }),
      }),
    sendCompany: (
      templateId: string,
      companyId: string,
      prospectIds?: string[],
      customValues?: Record<string, string>,
      documentIds?: string[]
    ) =>
      request<{
        data: {
          sent: number;
          failed: number;
          total: number;
          results: { email: string; status: string; error?: string }[];
        };
      }>('/email/send-company', {
        method: 'POST',
        body: JSON.stringify({ templateId, companyId, prospectIds, customValues, documentIds }),
      }),
    sendBatch: (
      templateId: string,
      prospectIds: string[],
      customValues?: Record<string, string>,
      documentIds?: string[]
    ) =>
      request<{
        data: {
          sent: number;
          failed: number;
          total: number;
          results: { email: string; status: string; error?: string }[];
        };
      }>('/email/send-batch', {
        method: 'POST',
        body: JSON.stringify({ templateId, prospectIds, customValues, documentIds }),
      }),
    history: (limit = 50, offset = 0, filters?: { status?: string; search?: string; company_id?: string; template_id?: string; prospect_id?: string }) => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.company_id) params.set('company_id', filters.company_id);
      if (filters?.template_id) params.set('template_id', filters.template_id);
      if (filters?.prospect_id) params.set('prospect_id', filters.prospect_id);
      return request<{ data: import('./types').EmailSend[]; total: number }>(`/email/history?${params.toString()}`);
    },
    retry: (id: string) =>
      request<{ data: { id: string; status: string } }>(`/email/retry/${id}`, { method: 'POST' }),
  },

  schedules: {
    list: () =>
      request<{ data: import('./types').EmailSchedule[] }>('/schedules'),
    create: (body: {
      templateId: string;
      companyId?: string | null;
      prospectIds?: string[];
      customValues?: Record<string, string>;
      scheduledFor: string;
      documentIds?: string[];
    }) =>
      request<{ data: import('./types').EmailSchedule }>('/schedules', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    get: (id: string) =>
      request<{ data: import('./types').EmailScheduleDetail }>(`/schedules/${id}`),
    cancel: (id: string) =>
      request<{ data: import('./types').EmailSchedule }>(`/schedules/${id}`, {
        method: 'DELETE',
      }),
  },

  documents: {
    list: () =>
      request<{ data: import('./types').Document[] }>('/documents'),
    upload: async (file: File, name: string): Promise<{ data: import('./types').Document }> => {
      const token = getToken();
      const form = new FormData();
      form.append('document', file);
      form.append('name', name);
      const res = await fetch(`${BASE_URL}/api/documents`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const json = (await res.json()) as unknown;
      if (!res.ok) {
        const msg =
          typeof json === 'object' && json !== null && 'error' in json
            ? String((json as { error: unknown }).error)
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return json as { data: import('./types').Document };
    },
    delete: (id: string) =>
      request<{ data: { id: string } }>(`/documents/${id}`, { method: 'DELETE' }),
  },

  variablePresets: {
    list: () =>
      request<{ data: import('./types').VariablePreset[] }>('/variable-presets'),
    create: (body: Omit<import('./types').VariablePreset, 'id' | 'created_at' | 'updated_at'>) =>
      request<{ data: import('./types').VariablePreset }>('/variable-presets', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Omit<import('./types').VariablePreset, 'id' | 'created_at' | 'updated_at'>) =>
      request<{ data: import('./types').VariablePreset }>(`/variable-presets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ data: { id: string } }>(`/variable-presets/${id}`, { method: 'DELETE' }),
  },

  stats: {
    get: () =>
      request<{
        companies: number;
        prospects: number;
        templates: number;
        emails: { total: number; sent: number; failed: number; pending: number; opened: number; openRate: number };
        prospectsByCategory: { category: string; count: number }[];
        topCompanies: { name: string; count: number }[];
        recentSends: import('./types').EmailSend[];
        upcomingSchedules: import('./types').EmailSchedule[];
        dailyActivity: { day: string; sent: number; failed: number }[];
      }>('/stats'),
  },

  import: {
    parse: async (file: File): Promise<{
      data: {
        headers: string[];
        preview: Record<string, string>[];
        rows: Record<string, string>[];
        rowCount: number;
        suggestedMapping: Record<string, string>;
      };
    }> => {
      const token = getToken();
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BASE_URL}/api/import/parse`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const json = (await res.json()) as unknown;
      if (!res.ok) {
        const msg =
          typeof json === 'object' && json !== null && 'error' in json
            ? String((json as { error: unknown }).error)
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return json as ReturnType<typeof api.import.parse> extends Promise<infer T> ? T : never;
    },

    prospects: (body: {
      rows: Record<string, string>[];
      mapping: Record<string, string>;
      defaultCompanyId?: string;
      createMissingCompanies?: boolean;
    }) =>
      request<{
        data: {
          imported: number;
          skipped: number;
          errors: { row: number; email?: string; error: string }[];
        };
      }>('/import/prospects', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
};
