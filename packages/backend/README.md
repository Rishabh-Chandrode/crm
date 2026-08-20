# Backend

Express 4 API server. TypeScript strict mode, ESM (`"type": "module"`), Node.js 20.

---

## Entry point

`src/index.ts` — creates the Express app, runs the DB migration, seeds the admin user, then starts listening.

Startup order:
1. Validate env vars (`src/config.ts`)
2. `migrate()` — creates tables, runs incremental column migrations
3. `seedAdminUser()` — upserts the admin account from `ADMIN_USERNAME` / `ADMIN_PASSWORD`
4. `startScheduler()` — starts the cron job that fires pending email schedules
5. HTTP server starts

---

## Project layout

```
src/
├── config.ts                    # Typed env vars — add new ones here
├── index.ts                     # App bootstrap
├── db/
│   ├── index.ts                 # pg Pool singleton (import `pool` from here)
│   └── migrate.ts               # Schema + incremental column migrations (idempotent)
├── middleware/
│   ├── auth.ts                  # JWT verification, attaches req.user
│   ├── ownerFilter.ts           # Row-level isolation helper
│   └── errorHandler.ts          # Global Express error handler
├── routes/
│   ├── index.ts                 # Mounts all routers
│   ├── auth.ts                  # /auth — login, signup, me, profile
│   ├── gmailOAuth.ts            # /auth/gmail — Gmail OAuth2 connect/disconnect + shared callback
│   ├── googleLogin.ts           # /auth/google — Google sign-in (login/signup via OAuth2)
│   ├── users.ts                 # /users — admin-only user management
│   ├── companies.ts             # /companies — CRUD + merge
│   ├── prospects.ts             # /prospects — CRUD + quick-add + global search
│   ├── templates.ts             # /templates — CRUD + detect-variables
│   ├── email.ts                 # /email — preview, send, send-company, history, retry
│   ├── schedules.ts             # /schedules — future sends
│   ├── documents.ts             # /documents — file upload/delete
│   ├── variable-presets.ts      # /variable-presets — saved variable mappings
│   ├── import.ts                # /import — CSV parsing + bulk prospect import
│   ├── stats.ts                 # /stats — dashboard stats
│   ├── settings.ts              # /settings — key/value store
│   └── track.ts                 # /track — email open pixel (public, no auth)
├── services/
│   ├── email/
│   │   ├── types.ts             # EmailProvider interface
│   │   ├── resend.ts            # Resend implementation
│   │   ├── gmail.ts             # Gmail OAuth2/Nodemailer implementation
│   │   └── index.ts             # Factory — picks provider per user
│   ├── templateEngine.ts        # {{variable}} resolution + plain-text → HTML
│   ├── attachmentHelper.ts      # Loads documents from disk for attachments
│   ├── driveSync.ts             # Google Drive URL parsing + file download + 2-hour sync
│   └── scheduler.ts             # node-cron job — processes pending email_schedules + Drive sync
└── types/
    └── index.ts                 # Shared TypeScript interfaces
```

---

## Authentication

JWT-based. Every protected route requires `Authorization: Bearer <token>`.

### Username / password

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | public | `{ username, password }` → `{ token, user }` |
| POST | `/api/auth/signup` | public | `{ username, password, email? }` → `{ token, user }` |
| GET | `/api/auth/me` | required | Returns current user with all profile fields |
| PATCH | `/api/auth/profile` | required | Update profile — accepts `first_name`, `last_name`, `email`, `current_company`, `job_title`, `phone`, `phone_country_code`, `city`, `state`, `country`, `address_line1`, `postal_code`, `location`, `hometown`, `work_authorization`, `years_of_experience`, `notice_period`, `current_ctc`, `expected_ctc`, `education`, `college_name`, `graduation_year`, `linkedin_url`, `github_url`, `website`, `bio`, `gender`, `veteran_status`, `skills`, `projects`, `work_experiences`, `from_name`, `reply_to_email` |

### Google sign-in (login / signup)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/google/connect` | public | Returns a Google OAuth2 URL; redirects user to Google for login |
| GET | `/api/auth/gmail/callback` | public | Shared callback — handles both Google login and Gmail connect flows via `flow` in state JWT |

On Google login the callback finds or creates a user matched by `google_id` or email. If a Gmail refresh token is returned (user approved Gmail access), it is stored immediately so Gmail is connected from first login.

### Gmail connection (Settings)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/gmail/connect` | required | Returns a Google OAuth2 URL requesting Gmail scopes for the logged-in user |
| DELETE | `/api/auth/gmail/disconnect` | required | Clears stored Gmail credentials for the current user |

**Shared callback:** both Google login and Gmail connect redirect to `GOOGLE_REDIRECT_URI` (`/api/auth/gmail/callback`). The `flow` field in the state JWT (`'login'` or `'gmail'`) determines which handler runs. Only one redirect URI needs to be registered in Google Cloud Console.

**JWT payload:**

```typescript
{ id: string; username: string; role: 'admin' | 'user' }
```

**Middleware:**

```typescript
authMiddleware          // verifies JWT, attaches req.user: AuthenticatedUser
requireRole('admin')    // factory — rejects requests from non-admin users
```

---

## Data isolation

Every data table has a `created_by UUID REFERENCES users(id)` column. Non-admin users only see their own rows; admins see everything.

The `ownerFilter` helper in `src/middleware/ownerFilter.ts` generates the WHERE clause fragment:

```typescript
ownerFilter(req.user!, 'es', params.length + 1)
// admin  → { sql: '',                          value: null }
// user   → { sql: 'es.created_by = $3',        value: '...' }
```

Apply it in every route that lists or looks up data. INSERT routes set `created_by = req.user!.id`.

---

## API Reference

`/api/auth/*` and `/api/track/*` are public. Everything else requires `Authorization: Bearer <token>`.

All authenticated endpoints scope data by `created_by` for non-admin users (see Data Isolation above).

---

### Auth — Login & Signup

| Method | Path | Auth | Body / Params | Response |
|--------|------|------|---------------|----------|
| `POST` | `/api/auth/login` | public | `{ username: string, password: string }` | `{ token, user: { id, username, email, role } }` |
| `POST` | `/api/auth/signup` | public | `{ username: string, password: string, email?: string }` — password min 8 chars, username min 3 chars | `{ token, user: { id, username, email, role } }` — `201` |
| `GET` | `/api/auth/me` | required | — | `{ user: CrmUser }` — full user object with all profile fields, `has_gmail_configured`, `has_gmail_app_password` |
| `PATCH` | `/api/auth/profile` | required | Any subset of: `first_name`, `last_name`, `email`, `current_company`, `job_title`, `phone`, `phone_country_code`, `website`, `bio`, `linkedin_url`, `github_url`, `city`, `state`, `country`, `address_line1`, `postal_code`, `work_authorization`, `location`, `hometown`, `years_of_experience`, `notice_period`, `current_ctc`, `expected_ctc`, `education`, `college_name`, `graduation_year`, `gender`, `veteran_status`, `skills` (string[]), `projects` (Project[]), `work_experiences` (WorkExperience[]), `from_name`, `reply_to_email` | `{ user: CrmUser }` — Validates email format, phone format, URL format, gender/veteran enum values, field lengths. Returns `400` with `{ error, fields: Record<string, string> }` on validation failure |

### Auth — Google Sign-In

| Method | Path | Auth | Body / Params | Response |
|--------|------|------|---------------|----------|
| `GET` | `/api/auth/google/connect` | public | — | `{ url: string }` — Google OAuth2 URL (login-only scopes: openid, email, profile) |
| `GET` | `/api/auth/gmail/callback` | public | Query: `code`, `state`, `error` | Redirect to frontend — shared callback for both Google login and Gmail connect. The `flow` field in state JWT determines the path. |
| `POST` | `/api/auth/gmail/exchange-code` | public | `{ code: string }` | `{ token: string }` — exchanges a one-time auth code (from callback redirect) for a JWT |

### Auth — Gmail Connection (Settings)

| Method | Path | Auth | Body / Params | Response |
|--------|------|------|---------------|----------|
| `GET` | `/api/auth/gmail/connect` | required | — | `{ url: string }` — Google OAuth2 URL requesting Gmail send scopes for the current user |
| `DELETE` | `/api/auth/gmail/disconnect` | required | — | `{ ok: true }` — clears Gmail OAuth credentials |
| `POST` | `/api/auth/gmail/app-password` | required | `{ gmail_user: string, app_password: string }` | `{ ok: true }` — saves Gmail app password credentials |
| `DELETE` | `/api/auth/gmail/app-password` | required | — | `{ ok: true }` — removes app password |

---

### Users (admin only)

All routes require `authMiddleware` + `requireRole('admin')`.

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/users` | — | `{ data: User[] }` — `id, username, email, role, is_active, created_at, updated_at` |
| `POST` | `/api/users` | `{ username: string, password: string, email?: string, role?: 'admin' \| 'user' }` — password min 8 chars | `{ data: User }` — `201` |
| `PATCH` | `/api/users/:id` | `{ email?, role?, is_active?: boolean, password?: string }` | `{ data: User }` — `404` if not found |
| `DELETE` | `/api/users/:id` | — | `{ data: { id } }` — `400` if deleting self, `404` if not found |

---

### Companies

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/companies` | — | `{ data: Company[] }` — each with `prospect_count: number` |
| `POST` | `/api/companies` | `{ name: string, website?: string, industry?: string }` | `{ data: Company }` — `201`. `409` if name duplicate |
| `GET` | `/api/companies/:id` | — | `{ data: Company & { prospects: Prospect[] } }` — `404` if not found |
| `PATCH` | `/api/companies/:id` | `{ name?, website?, industry? }` | `{ data: Company }` — `409` if name duplicate |
| `DELETE` | `/api/companies/:id` | — | `{ data: { id } }` |
| `POST` | `/api/companies/:id/merge` | `{ sourceId: string }` | `{ data: { targetId, sourceId, merged: true } }` — moves all prospects, email_sends, email_schedules from source to target, then deletes source. Uses DB transaction. |

---

### Prospects

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/prospects` | **Query:** `company_id?`, `role_category?`, `search?` (searches first_name, last_name, email, job_title), `sort_by?` (`first_name` \| `last_name` \| `email` \| `job_title` \| `company_name` \| `created_at`), `sort_dir?` (`asc` \| `desc`), `limit?` (1–100, default 25), `offset?` | `{ data: Prospect[], total: number }` — each prospect includes `company_name` |
| `POST` | `/api/prospects` | `{ first_name: string, email: string, company_id?, last_name?, job_title?, role_category?, linkedin_url?, phone?, notes? }` — auto-infers `role_category` from `job_title` if not provided | `{ data: Prospect }` — `201`. `409` if email duplicate |
| `POST` | `/api/prospects/quick-add` | `{ first_name: string, email: string, last_name?, company_name?, job_title?, linkedin_url? }` — resolves or creates company by name (scoped to user). Returns existing if email already exists. | `{ data: Prospect, existed?: true }` — used by the Chrome extension |
| `GET` | `/api/prospects/lookup` | **Query:** `linkedin_url?`, `email?` — at least one required. Normalizes LinkedIn URL (strips query params, trailing slashes). | `{ data: Prospect \| null }` — returns first match for current user. Used by extension match card. |
| `POST` | `/api/prospects/enrich` | `{ first_name?, last_name?, company_name?, linkedin_url? }` | Enrichment result from the active provider (Apollo/Prospeo) |
| `GET` | `/api/prospects/enrich/credits` | — | `{ credits: number \| null, provider: string }` |
| `GET` | `/api/prospects/:id` | — | `{ data: Prospect }` — includes nested `company` object |
| `PATCH` | `/api/prospects/:id` | `{ company_id?, first_name?, last_name?, email?, job_title?, role_category?, linkedin_url?, phone?, notes? }` — auto-updates `role_category` if `job_title` changed and no explicit `role_category` | `{ data: Prospect }` |
| `DELETE` | `/api/prospects/:id` | — | `{ data: { id } }` |

---

### Email Templates

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/templates` | — | `{ data: EmailTemplate[] }` |
| `POST` | `/api/templates` | `{ name: string, subject: string, body: string, description?, job_description?, variables?: TemplateVariable[], document_ids?: string[] }` | `{ data: EmailTemplate }` — `201` |
| `GET` | `/api/templates/:id` | — | `{ data: EmailTemplate }` |
| `PATCH` | `/api/templates/:id` | Any subset of: `name`, `description`, `subject`, `body`, `job_description`, `variables`, `document_ids` | `{ data: EmailTemplate }` |
| `DELETE` | `/api/templates/:id` | — | `{ data: { id } }` |
| `POST` | `/api/templates/:id/detect-variables` | `{ existing: TemplateVariable[] }` | `{ data: { detected: string[], newVariables: TemplateVariable[] } }` — scans `subject + body` for `{{key}}` placeholders, returns keys not already in `existing`. New variables are auto-matched against saved variable presets. |

---

### Email Sending

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `POST` | `/api/email/preview` | `{ templateId: string, prospectId: string, customValues?: Record<string, string> }` | `{ data: { subject, body, html } }` — resolves template variables without sending |
| `POST` | `/api/email/send` | `{ templateId: string, prospectId: string, customValues?: Record<string, string>, documentIds?: string[] }` | `{ data: { id, status: 'sent', resend_id } }` — sends via user's Gmail (OAuth or app password). `502` on delivery failure. Auto-tracks job application if `customValues.jobUrl` present. |
| `POST` | `/api/email/send-company` | `{ templateId: string, companyId: string, prospectIds?: string[], customValues?: Record<string, string>, documentIds?: string[] }` — if `prospectIds` omitted, sends to ALL prospects at the company | `{ data: { sent, failed, total, results: [{ email, status, error? }] } }` |
| `POST` | `/api/email/send-batch` | `{ templateId: string, prospectIds: string[], customValues?: Record<string, string>, documentIds?: string[] }` — sends to an explicit list of prospects (no company constraint, each resolved with own company) | `{ data: { sent, failed, total, results: [{ email, status, error? }] } }` |
| `POST` | `/api/email/quick-send` | `{ email: string, subject: string, body: string, documentIds?: string[] }` — sends without a template. Auto-creates prospect if email doesn't exist. | `{ data: { id, status: 'sent' } }` |
| `GET` | `/api/email/history` | **Query:** `limit?` (default 50), `offset?`, `status?` (all \| sent \| failed \| pending), `search?`, `company_id?`, `template_id?`, `prospect_id?` | `{ data: EmailSend[], total: number }` — each includes nested `prospect`, `company`, `template` objects |
| `POST` | `/api/email/retry/:id` | — | `{ data: { id, status: 'sent' } }` — only works for `status = 'failed'`. `502` if retry also fails. |

---

### Schedules (Future Sends)

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/schedules` | — | `{ data: EmailSchedule[] }` — each includes nested `company`, `template` |
| `POST` | `/api/schedules` | `{ templateId: string, companyId?: string, prospectIds?: string[], customValues?: Record<string, string>, scheduledFor: string (ISO datetime), documentIds?: string[] }` — must provide either `companyId` or at least one `prospectId`. `scheduledFor` must be in the future. | `{ data: EmailSchedule }` — `201` |
| `POST` | `/api/schedules/quick` | `{ email: string, subject: string, body: string, scheduledFor: string, documentIds?: string[] }` — schedules a quick email without a template. Auto-creates prospect. | `{ data: EmailSchedule }` — `201` |
| `GET` | `/api/schedules/:id` | — | `{ data: EmailScheduleDetail }` — includes `prospects[]` array and nested `company`, `template` |
| `DELETE` | `/api/schedules/:id` | — | `{ data: EmailSchedule }` — sets status to `cancelled` (only works for `pending`). `404` if already sent/cancelled. |
| `POST` | `/api/schedules/:id/retry` | — | `{ data: EmailSchedule }` — resets status to `pending` and re-fires. Only works for `failed` or schedules with `failed_count > 0`. |

---

### Variable Presets

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/variable-presets` | — | `{ data: VariablePreset[] }` |
| `POST` | `/api/variable-presets` | `{ key: string, label: string, source: VariableSource, field?: string, default_value?: string }` | `{ data: VariablePreset }` — `201` |
| `PUT` | `/api/variable-presets/:id` | `{ key: string, label: string, source: VariableSource, field?: string, default_value?: string }` — full replace | `{ data: VariablePreset }` |
| `DELETE` | `/api/variable-presets/:id` | — | `{ data: { id } }` |

---

### Documents

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/documents` | — | `{ data: Document[] }` — includes `drive_url`, `drive_synced_at`, `drive_sync_error` |
| `POST` | `/api/documents` | **multipart/form-data:** `document` (file, max 10MB, .pdf/.doc/.docx only) + `name` (string) | `{ data: Document }` — `201`. File stored via object storage service. |
| `POST` | `/api/documents/from-drive` | `{ name: string, drive_url: string }` — accepts Google Drive/Docs/Sheets/Slides share URLs | `{ data: Document }` — `201`. Downloads file immediately. |
| `GET` | `/api/documents/:id/download` | — | Binary file response with `Content-Disposition: attachment` header |
| `DELETE` | `/api/documents/:id` | — | `{ data: { id } }` — deletes from storage + removes document ID from any templates that reference it |

---

### Job Applications

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/applications` | **Query:** `status?` (`not_applied` \| `applied` \| `screening` \| `interview` \| `offer` \| `rejected` \| `withdrawn`), `search?` (company_name or job_title), `limit?` (default 100), `offset?` | `{ applications: JobApplication[], total: number }` |
| `POST` | `/api/applications` | `{ company_name: string, job_title: string, job_url: string, platform?: string, status?: string, notes?: string, applied_at?: string }` — platform defaults to `'Generic'`, status defaults to `'applied'` | `JobApplication` — `201` |
| `PATCH` | `/api/applications/:id` | `{ company_name?: string, job_title?: string, job_url?: string, platform?: string, status?: string, notes?: string, applied_at?: string }` — validates status against allowed values | `JobApplication` |
| `DELETE` | `/api/applications/:id` | — | `{ success: true }` |

---

### Settings (key-value store)

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/settings` | — | `{ data: Record<string, string> }` |
| `PUT` | `/api/settings/:key` | `{ value: string }` | `{ data: { key, value } }` — upserts |

---

### Stats (Dashboard)

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/stats` | — | `{ companies, prospects, templates, emails: { total, sent, failed, pending, opened, openRate }, prospectsByCategory, topCompanies, recentSends, upcomingSchedules, dailyActivity }` — scoped to user; admin sees all |

---

### Import (CSV/Excel)

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `POST` | `/api/import/parse` | **multipart/form-data:** `file` (.xlsx, .xls, or .csv, max 10MB) | `{ data: { headers: string[], preview: Row[], rows: Row[], rowCount, suggestedMapping: Record<string, string> } }` — auto-detects column mapping for `first_name`, `last_name`, `full_name`, `email`, `company`, `job_title`, `phone`, `linkedin_url`, `notes` |
| `POST` | `/api/import/prospects` | `{ rows: Row[], mapping: ImportMapping, defaultCompanyId?: string, createMissingCompanies?: boolean }` | `{ data: { imported, skipped, errors: [{ row, email?, error }] } }` — skips duplicates and invalid rows |

---

### Tracking (public, no auth)

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/track/open/:sendId.gif` | **Query:** `debug?=true` for JSON response instead of pixel | 1×1 transparent GIF — increments `open_count` and sets `opened_at` on `email_sends` |

---

### Health Check (public)

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/health` | — | `{ status: 'ok', timestamp: string }` |

---

## Database

### Schema (key tables)

```sql
users (id UUID PK, username, email, password_hash, role, is_active,
       first_name, last_name, current_company, job_title,
       phone, phone_country_code,          -- local number + dial-code prefix (e.g. "+91")
       city, state, country, address_line1, postal_code,
       location, hometown,
       work_authorization, years_of_experience, notice_period,
       current_ctc, expected_ctc,
       education, college_name, graduation_year,
       linkedin_url, github_url, website, bio,
       gender, veteran_status,
       skills JSONB, projects JSONB, work_experiences JSONB,
       google_id,                          -- links Google OAuth account
       gmail_user, gmail_refresh_token,    -- per-user Gmail OAuth2 credentials
       from_name, reply_to_email,          -- email display name / reply-to overrides
       created_at, updated_at)

job_applications (id UUID PK, user_id→users,
                  company_name, job_title, job_url, platform,
                  status,       -- applied|screening|interview|offer|rejected|withdrawn
                  notes, applied_at, created_at, updated_at)

companies      (id, name, website, industry, created_by→users, created_at, updated_at)
prospects      (id, company_id→companies, first_name, last_name, email,
                job_title, role_category, linkedin_url, phone, notes,
                created_by→users, created_at, updated_at)
email_templates (id, name, description, subject, body, job_description,
                 variables JSONB, document_ids UUID[],
                 created_by→users, created_at, updated_at)
email_sends     (id, template_id, prospect_id, company_id, subject, body,
                 status, resend_id, sent_at, error_message, opened_at, open_count,
                 created_by→users, created_at)
email_schedules (id, template_id, company_id, prospect_ids UUID[],
                 custom_values JSONB, scheduled_for, status,
                 total_prospects, sent_count, failed_count, document_ids UUID[],
                 created_by→users, created_at, sent_at)
documents       (id, name, filename, path, size,
                 drive_url,          -- original Drive share URL (NULL for uploads)
                 drive_file_id,      -- extracted Drive file ID
                 drive_synced_at,    -- timestamp of last successful sync
                 drive_sync_error,   -- last sync error message (NULL if OK)
                 created_by→users, created_at)
variable_presets (id, key, label, source, field, default_value,
                  created_by→users, created_at, updated_at)
```

### Migrations

`migrate.ts` runs on every startup. It is **idempotent** — `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `DO $$ ... END $$` blocks that check `information_schema.columns` before altering.

**To add a new column:**

```typescript
// In migrate.ts, append to migrate():
await pool.query(`
  ALTER TABLE my_table ADD COLUMN IF NOT EXISTS my_column VARCHAR(255);
`);
```

---

## Email providers

`EmailProvider` interface (`services/email/types.ts`):

```typescript
interface EmailProvider {
  send(options: { to: string; subject: string; html: string; attachments?: ...; replyTo?: string }): Promise<{ id: string }>;
}
```

`services/email/index.ts → getEmailProviderForUser()` returns a provider for the given user credentials:

- **Gmail** (default) — uses the user's stored `gmail_refresh_token` to send via the Gmail API. Each user connects their own account from Settings.
- **Resend** (fallback) — used only if `RESEND_API_KEY` is set and no Gmail credentials are provided.

**Display name fallback chain** (applied in both immediate and scheduled sends):

```
from_name (user setting) → first_name + last_name → username → 'CRM'
```

To add a new provider, implement `EmailProvider` and update the factory in `services/email/index.ts`.

---

## Email scheduler

`services/scheduler.ts` runs two `node-cron` jobs:

- **Every minute** — picks up `email_schedules` with `status = 'pending'` and `scheduled_for <= NOW()`, sends to all prospect IDs, updates counts. The sender profile (including Gmail credentials) is loaded from `created_by` so `{{sender…}}` variables resolve correctly.
- **Every 2 hours** (`0 */2 * * *`) — calls `syncDriveDocuments()` from `driveSync.ts`. For each document with a `drive_url`, it re-downloads the file from Google Drive and overwrites the local copy in place. If the file is gone from Drive (403/404), it is deleted from `documents` and its ID is removed from all `email_templates.document_ids` arrays. Sync also runs once 10 seconds after startup.

## Google Drive sync

`services/driveSync.ts` handles Drive-linked documents:

- **`parseDriveUrl(url)`** — extracts the file ID from Drive/Docs/Sheets/Slides share URLs.
- **`fetchAndSaveFile(driveUrl, existingPath?)`** — downloads the file. If `existingPath` is provided and exists on disk, it overwrites that path (no orphaned files). Handles Google's virus-scan confirmation redirect for large files.
- **`syncDriveDocuments()`** — iterates all documents with a `drive_url` and refreshes them. Removes deleted ones from the DB and templates.

---

## Template variable system

`TemplateVariable` (from `types/index.ts`):

```typescript
{
  key: string          // used as {{key}} in templates
  label: string        // shown in the UI
  source: 'prospect' | 'company' | 'sender' | 'static' | 'custom'
  field?: string       // which field to read (for prospect/company/sender)
  defaultValue?: string
}
```

Resolution in `services/templateEngine.ts → resolveTemplate()`:

| source | Resolved from |
|---|---|
| `prospect` | `prospect[field]` |
| `company` | `company[field]` |
| `sender` | sending user's profile (`first_name`, `last_name`, `email`, `current_company`, `job_title`, `phone`, `website`) |
| `static` | `variable.defaultValue` |
| `custom` | `customValues[key]` — provided by the caller at send time |

---

## TypeScript notes

- Module system: **ESM** (`"type": "module"`). All relative imports need `.js` extension even though source files are `.ts`.
- `pg` is CommonJS — import as `import pg from 'pg'; const { Pool } = pg;`
- Dev: `tsx watch`, prod: compile with `tsc` then run with `node`.

---

## Automated Testing

Backend uses **Vitest** for unit tests and **Supertest** for Express HTTP endpoint testing.

```bash
# Run backend tests once
pnpm test

# Run backend tests in watch mode
pnpm test:watch
```

Test suites live in `src/__tests__/`:
- `api.test.ts` — Express route tests (health check, route protection)
- `auth.test.ts` — JWT token generation, authMiddleware, session validation, requireRole
- `templateEngine.test.ts` — Variable resolution, HTML converters, tracking pixel injection

