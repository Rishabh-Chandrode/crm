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
│   ├── aiSettings.ts            # /ai-settings — admin-only LLM provider, credentials & model configuration
│   ├── track.ts                 # /track — email open pixel (public, no auth)
│   ├── notifications.ts         # /notifications — Web Push VAPID key & browser subscriptions with systemLogger error tracking
│   └── logs.ts                  # /logs — admin-only system logs, stats, and retention pruning
├── services/
│   ├── llm/
│   │   ├── types.ts             # ILlmProvider interface & options
│   │   ├── factory.ts           # LlmProviderFactory (Strategy & Factory pattern)
│   │   ├── llmSettingsService.ts # Database-backed LLM settings & dynamic credential management
│   │   ├── heuristicFallback.ts # Deterministic rule engine for classification & scoring
│   │   └── providers/           # GeminiProvider, OpenAiProvider, NullLlmProvider
│   ├── jobEmailSync/
│   │   ├── gmailFetcher.ts      # Queries Gmail API for job recommendations & updates
│   │   ├── jobExtractor.ts      # Unwraps tracking links and parses jobs from HTML
│   │   ├── jobScraper.ts        # Server-side description scraper (LinkedIn guest API, fallback)
│   │   ├── jobClassifierAndScorer.ts # Coordinates LLM & heuristic scoring against preferences
│   │   └── syncOrchestrator.ts  # End-to-end sync workflow and scheduler integration
│   ├── email/
│   │   ├── types.ts             # EmailProvider interface
│   │   ├── resend.ts            # Resend implementation
│   │   ├── gmail.ts             # Gmail OAuth2/Nodemailer implementation
│   │   ├── gmailToken.ts        # Periodic Gmail access-token refresh + refresh-token rotation
│   │   └── index.ts             # Factory — picks provider per user
│   ├── templateEngine.ts        # {{variable}} resolution + dynamic salutations (Sir/Ma'am) + plain-text → HTML
│   ├── genderInference.ts       # Automated gender & pronoun inference from name and bio/profile
│   ├── attachmentHelper.ts      # Loads documents from disk for attachments
│   ├── documentRefs.ts          # Keeps template and schedule attachment ids limited to documents that still exist
│   ├── driveSync.ts             # Google Drive URL parsing + file download + 2-hour sync
│   ├── pushNotificationService.ts # Free Web Push (VAPID key management, browser delivery, scheduled email failure & expired authorization alerts)
│   ├── systemLogger.ts          # Self-hosted in-database telemetry & error logger with 30-day retention
│   ├── githubIssueService.ts    # Automated GitHub issue reporter for unhandled errors with deduplication
│   └── scheduler.ts             # node-cron job — processes email_schedules, Drive sync, and job email sync
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
| PATCH | `/api/auth/profile` | required | Update profile — accepts `first_name`, `last_name`, `email`, `current_company`, `job_title`, `phone`, `phone_country_code`, `city`, `state`, `country`, `address_line1`, `postal_code`, `location`, `hometown`, `work_authorization`, `years_of_experience`, `notice_period`, `current_ctc`, `expected_ctc`, `education`, `college_name`, `graduation_year`, `linkedin_url`, `github_url`, `website`, `bio`, `gender`, `veteran_status`, `skills`, `target_roles`, `projects`, `work_experiences`, `from_name`, `reply_to_email` |

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
| `PATCH` | `/api/auth/profile` | required | Any subset of: `first_name`, `last_name`, `email`, `current_company`, `job_title`, `phone`, `phone_country_code`, `website`, `bio`, `linkedin_url`, `github_url`, `city`, `state`, `country`, `address_line1`, `postal_code`, `work_authorization`, `location`, `hometown`, `years_of_experience`, `notice_period`, `current_ctc`, `expected_ctc`, `education`, `college_name`, `graduation_year`, `gender`, `veteran_status`, `skills` (string[]), `target_roles` (string[]), `projects` (Project[]), `work_experiences` (WorkExperience[]), `from_name`, `reply_to_email` | `{ user: CrmUser }` — Validates email format, phone format, URL format, gender/veteran enum values, field lengths. Returns `400` with `{ error, fields: Record<string, string> }` on validation failure |

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
| `GET` | `/api/prospects` | **Query:** `company_id?`, `role_category?`, `search?` (searches first_name, last_name, email, job_title), `sort_by?` (`first_name` \| `last_name` \| `email` \| `job_title` \| `company_name` \| `created_at`), `sort_dir?` (`asc` \| `desc`), `limit?` (1–100, default 25), `offset?` | `{ data: Prospect[], total: number }` — each prospect includes `company_name` and `gender` |
| `POST` | `/api/prospects` | `{ first_name: string, email: string, company_id?, last_name?, job_title?, role_category?, gender?, linkedin_url?, phone?, notes? }` — auto-infers `role_category` and auto-infers `gender` (from name / pronouns) if not provided. Automatically dismisses matching pending prospects in Priority Action Center. | `{ data: Prospect }` — `201`. `409` if email duplicate |
| `POST` | `/api/prospects/quick-add` | `{ first_name: string, email: string, last_name?, company_name?, job_title?, gender?, linkedin_url? }` — resolves or creates company by name (scoped to user). Auto-infers `gender` if omitted. Automatically checks for matching pending prospect in `pending_prospects` (by LinkedIn slug, normalized URL, or name + company), inherits missing fields, saves the prospect to CRM, and dismisses the pending prospect from the Priority Action Center. | `{ data: Prospect, existed?: true, pending_dismissed?: boolean }` — used by the Chrome extension |
| `GET` | `/api/prospects/lookup` | **Query:** `linkedin_url?`, `email?` — at least one required. Normalizes LinkedIn URL (strips query params, trailing slashes). Checks `prospects` first; if not found, checks for active matching `pending_prospects`. | `{ data: Prospect \| null, pending?: PendingProspect \| null }` — returns first match from prospects, or matching pending prospect from `pending_prospects` for current user. Used by extension match cards. |
| `POST` | `/api/prospects/from-linkedin` | `{ linkedin_url: string }` | `{ data?: Prospect, pendingProspect?: PendingProspect, created: boolean, manual_required?: boolean, message?: string }` — `201` when created, `200` when that profile is already saved or already pending. First attempts enrichment with Prospeo, then falls back to Apollo if Prospeo yields no email. If neither API returns an email, does NOT create a dummy email or prospect record; instead creates or returns an entry in `pending_prospects` for manual entry in the Priority Action Center. |
| `POST` | `/api/prospects/enrich` | `{ first_name?, last_name?, company_name?, linkedin_url? }` | Enrichment result from the active provider (Apollo/Prospeo), including `first_name` and `last_name` when the provider returns them. Apollo accepts a LinkedIn URL without a first name. |
| `GET` | `/api/prospects/enrich/credits` | — | `{ credits: number \| null, provider: string }` |
| `POST` | `/api/prospects/discover` | `{ company_name?, company_domain?, role_category?, job_titles?, seniorities?, limit?, page? }` | Discovers decision makers & recruiters at a company via Prospeo/Apollo, cross-referencing against user CRM for duplicate tagging. |
| `POST` | `/api/prospects/bulk-import` | `{ prospects: Array<{ first_name: string, last_name?, company_name?, job_title?, gender?, linkedin_url?, role_category?, auto_enrich_email? }>, default_company_id? }` | Bulk imports selected prospects, resolving/creating companies, auto-inferring gender, and optionally auto-enriching verified emails. |
| `GET` | `/api/prospects/:id` | — | `{ data: Prospect }` — includes nested `company` object |
| `PATCH` | `/api/prospects/:id` | `{ company_id?, first_name?, last_name?, email?, job_title?, role_category?, gender?, linkedin_url?, phone?, notes? }` — auto-updates `role_category` if `job_title` changed and no explicit `role_category` | `{ data: Prospect }` |
| `DELETE` | `/api/prospects/:id` | — | `{ data: { id } }` |


---

### Email Templates

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/templates` | **Query:** `all=true` returns every version, including deleted ones. Default returns the latest non-deleted version of each family | `{ data: EmailTemplate[] }` — each row includes `version`, `family_id`, `deleted_at`. `document_ids` is pruned to documents that still exist before the list is returned |
| `POST` | `/api/templates` | `{ name: string, subject: string, body: string, description?, job_description?, variables?: TemplateVariable[], document_ids?: string[] }` | `{ data: EmailTemplate }` — `201`. Creates version `1` and sets `family_id` to the new id |
| `GET` | `/api/templates/:id` | — | `{ data: EmailTemplate }` |
| `PATCH` | `/api/templates/:id` | Any subset of: `name`, `description`, `subject`, `body`, `job_description`, `variables`, `document_ids` | `{ data: EmailTemplate }` — inserts the next version in the same family. The previous row is unchanged. `400` if that version is deleted |
| `DELETE` | `/api/templates/:id` | — | `{ data: { id } }` — sets `deleted_at`. The row stays so history can show the name, version, and deleted mark |
| `DELETE` | `/api/templates/:id/older-versions` | — | `{ data: { ids: string[] } }` — soft-deletes every earlier live version in the family. The latest version stays |
| `POST` | `/api/templates/:id/detect-variables` | `{ existing: TemplateVariable[] }` | `{ data: { detected: string[], newVariables: TemplateVariable[] } }` — scans `subject + body` for `{{key}}` placeholders, returns keys not already in `existing`. New variables are auto-matched against saved variable presets. |

---

### Email Sending

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `POST` | `/api/email/preview` | `{ templateId: string, prospectId: string, customValues?: Record<string, string> }` | `{ data: { subject, body, html } }` — resolves template variables without sending |
| `POST` | `/api/email/send` | `{ templateId: string, prospectId: string, customValues?: Record<string, string>, documentIds?: string[], jobId?: string }` | `{ data: { id, status: 'sent', resend_id } }` — sends via user's Gmail (OAuth or app password). `502` on delivery failure. Stores `job_id` from `jobId`, or from the user's only open job at the prospect's company. That job's application becomes `referral_requested` so the dashboard can count sent mail. Auto-tracks job application if `customValues.jobUrl` present. |
| `POST` | `/api/email/send-company` | `{ templateId: string, companyId: string, prospectIds?: string[], customValues?: Record<string, string>, documentIds?: string[], jobId?: string }` — if `prospectIds` omitted, sends to ALL prospects at the company. `jobId` links every send; if omitted and the company has one open job, that job is used | `{ data: { sent, failed, total, results: [{ email, status, error? }] } }` |
| `POST` | `/api/email/send-batch` | `{ templateId: string, prospectIds: string[], customValues?: Record<string, string>, documentIds?: string[], jobId?: string }` — sends to an explicit list of prospects (no company constraint, each resolved with own company). Without `jobId`, each prospect is linked only when their company has a single open job | `{ data: { sent, failed, total, results: [{ email, status, error? }] } }` |
| `POST` | `/api/email/quick-send` | `{ email: string, subject: string, body: string, documentIds?: string[], jobId?: string }` — sends without a template. Auto-creates prospect if email doesn't exist. Links `jobId` the same way as `/send`. | `{ data: { id, status: 'sent' } }` |
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
| `POST` | `/api/variable-presets` | `{ key: string, label: string, source: VariableSource, field?: string, default_value?: string, male_value?: string, female_value?: string }` | `{ data: VariablePreset }` — `201` |
| `PUT` | `/api/variable-presets/:id` | `{ key: string, label: string, source: VariableSource, field?: string, default_value?: string, male_value?: string, female_value?: string }` — full replace | `{ data: VariablePreset }` |
| `DELETE` | `/api/variable-presets/:id` | — | `{ data: { id } }` |

---

### Documents

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/documents` | — | `{ data: Document[] }` — includes `drive_url`, `drive_synced_at`, `drive_sync_error` |
| `POST` | `/api/documents` | **multipart/form-data:** `document` (file, max 10MB, .pdf/.doc/.docx only) + `name` (string) | `{ data: Document }` — `201`. File stored via object storage service. |
| `POST` | `/api/documents/from-drive` | `{ name: string, drive_url: string }` — accepts Google Drive/Docs/Sheets/Slides share URLs | `{ data: Document }` — `201`. Downloads file immediately. |
| `POST` | `/api/documents/:id/sync` | — | `{ data: Document }` — Re-fetches one Drive-linked file on demand. |
| `GET` | `/api/documents/daily-sync` | — | `{ data: { enabled: boolean, last_synced_at: string \| null } }` — whether this user has daily Drive refetch turned on. |
| `PUT` | `/api/documents/daily-sync` | `{ enabled: boolean }` | `{ data: { enabled, last_synced_at } }`. Turning it on refetches that user's Drive documents immediately, then the scheduler repeats the refetch once a day. |
| `GET` | `/api/documents/:id/download` | — | Binary file response with `Content-Disposition: attachment` header |
| `DELETE` | `/api/documents/:id` | — | `{ data: { id } }` — deletes from storage and removes that document id from `email_templates.document_ids` and `email_schedules.document_ids`. The documents table is the source of truth for attachments |

---

### Jobs & Referral Outreach

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/jobs` | **Query:** `companyId?`, `status?` (`open` \| `referral_requested` \| `applied` \| `interviewing` \| `closed`), `search?` (job title or company name), `limit?` (default 50), `offset?` | `{ data: Job[], total: number }` — each includes nested `company`, `application`, `email_count` (sent emails only), and `referral_requested_at` |
| `POST` | `/api/jobs` | `{ title: string, job_url: string, company_id?: string, company_name?: string, status?: string, notes?: string }` — auto-creates/links company if `company_name` given, and creates a matching `job_applications` row so the dashboard can count outreach | `{ data: Job }` — `201` |
| `GET` | `/api/jobs/:id` | — | `{ data: Job & { emails: EmailSend[] } }` |
| `PATCH` | `/api/jobs/:id` | Any subset of: `title`, `job_url`, `company_id`, `status`, `notes` | `{ data: Job }` |
| `DELETE` | `/api/jobs/:id` | — | `{ data: { id, deleted: true } }` |
| `GET` | `/api/jobs/:id/emails` | — | `{ data: EmailSend[] }` — all outreach emails sent for this job |

---

### Job Applications

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/applications` | **Query:** `status?`, `search?`, `job_id?`, `min_match_score?` (number), `limit?` (default 100), `offset?` | `{ applications: JobApplication[], total: number }` — includes nested `job`, `company_id`, `email_count`, `referral_requested_at`, `match_score`, `match_reasons`, `missing_skills` |
| `POST` | `/api/applications/sync-emails` | — | `{ data: JobEmailSyncResult }` — scans connected Gmail for job alerts and application status updates |
| `GET` | `/api/applications/preferences` | — | `{ data: CandidatePreferences }` — candidate target roles, skills, and scoring criteria with automatic fallback to user profile settings |
| `PUT` | `/api/applications/preferences` | `{ target_roles?: string[], target_skills?: string[], min_experience_years?: number, max_experience_years?: number, preferred_locations?: string[], remote_only?: boolean, min_salary?: string, notes?: string }` | `{ data: CandidatePreferences }` — updates candidate criteria and synchronizes target roles with user profile |
| `POST` | `/api/applications` | `{ company_name: string, job_title: string, job_url: string, platform?: string, status?: string, notes?: string, applied_at?: string, job_id?: string }` — platform defaults to `'Generic'`, status defaults to `'open'`/`'applied'`. Auto-resolves/creates company in Companies table and links `company_id` to the associated `jobs` entry. | `JobApplication` (includes `company_id`) — `201` |
| `PATCH` | `/api/applications/:id` | `{ company_name?: string, job_title?: string, job_url?: string, platform?: string, status?: string, notes?: string, applied_at?: string, job_id?: string }` — validates status against allowed values, synchronizes company and title/URL updates with the linked `jobs` record | `JobApplication` |
| `DELETE` | `/api/applications/:id` | — | `{ success: true }` |
| `GET` | `/api/applications/:id/emails` | — | `{ data: EmailSend[] }` — all outreach emails sent for this application / role |

---

### Settings (key-value store)

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/settings` | — | `{ data: Record<string, string> }` |
| `PUT` | `/api/settings/:key` | `{ value: string }` | `{ data: { key, value } }` — upserts |

---

### AI & LLM Settings (Admin only)

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/ai-settings` | — | `{ data: LlmConfigSettings }` — current provider, model, hyperparameters, and masked API keys |
| `PUT` | `/api/ai-settings` | `{ enabled?, provider?, model?, geminiApiKey?, openaiApiKey?, temperature?, maxTokens? }` | `{ data: LlmConfigSettings }` — saves to database and refreshes factory cache instantly |
| `POST` | `/api/ai-settings/test` | `{ provider?, apiKey?, model? }` | `{ data: { success: boolean, latencyMs?: number, message?: string, error?: string } }` — live diagnostic connectivity test |

---

### Stats (Dashboard)

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/stats` | — | `{ companies, prospects, templates, applications, emails: { total, sent, failed, pending, opened, openRate }, applicationsByStatus, recentApplications, readyToApplyApplications, readyToApplyCount, referralSentApplications, referralSentCount, notAppliedApplications, notAppliedCount, activeInterviewApplications, activeInterviewCount, failedSends, pendingProspects, pendingProspectCount, prospectsByCategory, topCompanies, recentSends, upcomingSchedules, dailyActivity }` — scoped to user; admin sees all. `Cache-Control: no-store`. Before returning, links unassigned sends to the user's only open job at that company and counts **sent** emails. `referralSentApplications` are referral requests from the last 2 days (with `email_count`). `readyToApplyApplications` are the same status after the 2-day window. `failedSends` and `pendingProspects` omit rows with `dismissed_at` set. |
| `POST` | `/api/stats/dismissals` | `{ application_ids?: uuid[], failed_send_ids?: uuid[], pending_prospect_ids?: uuid[] }` | `{ closed, dismissed, pending_dismissed }` — closes the caller's applications, sets `dismissed_at` on the caller's failed sends, and sets `dismissed_at` on the caller's pending prospects. Other users' ids are ignored. |

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

### System Logs & Observability (Admin only)

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/logs` | **Query:** `level?` (`error` \| `warn` \| `info` \| `debug`), `source?`, `search?`, `startDate?`, `endDate?`, `page?`, `limit?` | `{ data: SystemLog[], total: number, page: number, limit: number, totalPages: number }` |
| `GET` | `/api/logs/stats` | — | `{ total: number, errors: number, warnings: number, info: number, last24Hours: number }` |
| `DELETE` | `/api/logs` | **Query:** `beforeDate?` (ISO date string) | `{ deleted: number }` — purges all logs or logs prior to `beforeDate`. Audited with warning. |
| `POST` | `/api/logs/prune` | `{ days?: number }` (default: 30) | `{ deleted: number, retentionDays: number }` — manual trigger for retention cleanup. |

---

### Push Notifications

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| `GET` | `/api/notifications/vapid-key` | — | `{ publicKey: string }` — returns the VAPID public key (auto-generated & stored if not exists). |
| `POST` | `/api/notifications/subscribe` | `{ endpoint: string, keys: { p256dh: string, auth: string }, userAgent?: string }` | `{ success: true, message: string }` — registers a browser push subscription for current user. |
| `POST` | `/api/notifications/unsubscribe` | `{ endpoint: string }` | `{ success: true, message: string }` — removes a push subscription. |
| `POST` | `/api/notifications/test` | — | `{ success: true, sent: number, failed: number }` — dispatches a test push notification to user's registered devices. |

- **VAPID Keys:** Automatically generated on first retrieval and persisted in the `settings` key-value table (`vapid_public_key`, `vapid_private_key`).
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
       skills JSONB, target_roles JSONB, projects JSONB, work_experiences JSONB,
       google_id,                          -- links Google OAuth account
       gmail_user, gmail_refresh_token,    -- per-user Gmail OAuth2 credentials
       gmail_access_token, gmail_access_token_expires_at, gmail_token_error,
       from_name, reply_to_email,          -- email display name / reply-to overrides
       daily_document_sync,                -- opt-in daily Drive document refetch
       daily_document_synced_at,           -- last time that daily refetch ran
       candidate_preferences,              -- JSONB target roles, skills, and fit criteria
       last_job_email_synced_at,           -- sync cursor for Gmail job discovery
       job_email_sync_enabled,             -- toggle for background email job sync
       created_at, updated_at)

jobs             (id UUID PK, company_id→companies, title, job_url,
                  status,       -- open|referral_requested|applied|interviewing|closed
                  notes, created_by→users, created_at, updated_at)

job_applications (id UUID PK, user_id→users, job_id→jobs,
                  company_name, job_title, job_url, platform,
                  status,       -- not_applied|applied|screening|interview|offer|rejected|withdrawn|closed|ineligible
                  match_score, match_reasons, missing_skills, description,
                  source_email_id, email_source,
                  notes, applied_at, created_at, updated_at)

companies      (id, name, website, industry, created_by→users, created_at, updated_at)
prospects      (id, company_id→companies, first_name, last_name, email,
                job_title, role_category, gender, linkedin_url, phone, notes,
                created_by→users, created_at, updated_at)
email_templates (id, family_id, version, name, description, subject, body, job_description,
                 variables JSONB, document_ids UUID[], deleted_at,
                 created_by→users, created_at, updated_at)
email_sends     (id, template_id, prospect_id, company_id, subject, body,
                 status, resend_id, sent_at, error_message, opened_at, open_count,
                 job_url, job_id→jobs, dismissed_at, created_by→users, created_at)
email_schedules (id, template_id, company_id, prospect_ids UUID[],
                 custom_values JSONB, scheduled_for, status,
                 total_prospects, sent_count, failed_count, document_ids UUID[],
                 job_id→jobs, created_by→users, created_at, sent_at)
documents       (id, name, filename, path, size,
                 drive_url,          -- original Drive share URL (NULL for uploads)
                 drive_file_id,      -- extracted Drive file ID
                 drive_synced_at,    -- timestamp of last successful sync
                 drive_sync_error,   -- last sync error message (NULL if OK)
                 created_by→users, created_at)
variable_presets (id, key, label, source, field, default_value, male_value, female_value,
                  created_by→users, created_at, updated_at)
pending_prospects (id, user_id→users, linkedin_url, first_name, last_name, company_name, job_title, notes,
                   dismissed_at, created_at, updated_at)
system_logs (id, level, message, source, context, error_name, stack_trace, request_id, method, path,
             status_code, user_id→users, ip, github_issue_url, created_at)
push_subscriptions (id UUID PK, user_id→users, endpoint UNIQUE, p256dh, auth,
                    user_agent, created_at, updated_at)
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

- **Gmail** (default) — uses the user's stored `gmail_refresh_token` to send via the Gmail REST API (returning `threadId` for direct thread linking in the web client). Each user connects their own account from Settings. Access tokens expire in about an hour. `services/email/gmailToken.ts` refreshes them on the 30-minute scheduler (when they expire within 45 minutes) and again immediately before a send. If Google rotates the refresh token, the new one is saved.
- **Resend** (fallback) — used only if `RESEND_API_KEY` is set and no Gmail credentials are provided.

**Display name fallback chain** (applied in both immediate and scheduled sends):

```
from_name (user setting) → first_name + last_name → username → 'CRM'
```

To add a new provider, implement `EmailProvider` and update the factory in `services/email/index.ts`.

---

## Email scheduler

`services/scheduler.ts` runs a `node-cron` job:

- **Every 30 minutes** (`*/30 * * * *`) — first refreshes Gmail OAuth access tokens that are missing or expire within 45 minutes (`refreshDueGmailTokens`), then picks up `email_schedules` with `status = 'pending'` and `scheduled_for <= NOW()`, sends to all prospect IDs, updates counts, and finishes work in batch. The same tick calls `processDailyDocumentSync()`, which refetches Drive documents only for users who turned on daily refetch and were last synced more than a day ago. The PostgreSQL pool is configured with `idleTimeoutMillis: 10000` so that after processing finishes, all idle connections are dropped within 10 seconds, allowing serverless Neon DB compute to suspend after 5 minutes of inactivity and rest for the remainder of the interval.

## Google Drive sync

Each Drive-linked file can be refreshed on demand with **Re-fetch** (`POST /api/documents/:id/sync`). **Profile → Documents → Refetch daily** (`PUT /api/documents/daily-sync`) opts that user into an automatic refresh once a day. The 30-minute scheduler runs it only when `users.daily_document_synced_at` is older than 24 hours.

`services/driveSync.ts` handles Drive-linked documents:

- **`parseDriveUrl(url)`** — extracts the file ID from Drive/Docs/Sheets/Slides share URLs.
- **`fetchAndSaveFile(driveUrl, existingPath?)`** — downloads the file. If `existingPath` is provided and exists on disk/storage, it overwrites that path (no orphaned files). Handles Google's virus-scan confirmation redirect for large files.
- **`syncDriveDocuments(userId?)`** — refreshes documents with a `drive_url`. Pass a user id to limit the refresh to that user's files. If Drive says the file is gone, the document row is deleted and that id is removed from template and schedule attachments.

---

## Pending prospects & Priority Action Center synchronization

`services/pendingProspects.ts` links the mobile share flow (where un-enriched profiles are parked in `pending_prospects` for manual email entry) with the Chrome extension and manual prospect creation:

- **`extractLinkedInSlug(url)`** — extracts canonical LinkedIn profile slug (`/in/<slug>` or `/pub/<slug>`), ignoring regional subdomains (`in.linkedin.com`), trailing slashes, and tracking query params (`?trk=...`).
- **`normalizeLinkedInUrl(url)`** — strips query strings, trailing slashes, and normalizes casing.
- **`findMatchingPendingProspect(userId, criteria)`** — searches `pending_prospects` where `dismissed_at IS NULL` matching by LinkedIn slug, normalized URL, or first + last name and company.
- **`dismissPendingProspect(userId, pendingId)`** — marks `dismissed_at = NOW()` on the pending record so it leaves the Priority Action Center.
- **`dismissMatchingPendingProspects(userId, criteria)`** — finds and dismisses matching pending records during quick-add, standard creation, or bulk import.

---

## Template variable system

`TemplateVariable` (from `types/index.ts`):

```typescript
{
  key: string          // used as {{key}} in templates (e.g. salutation, firstName)
  label: string        // shown in the UI
  source: 'prospect' | 'company' | 'sender' | 'static' | 'custom'
  field?: string       // which field to read (for prospect/company/sender, e.g. 'salutation', 'honorific', 'gender')
  defaultValue?: string
  maleValue?: string   // customizable male substitution (e.g. 'Sir', 'Mr.', 'brother')
  femaleValue?: string // customizable female substitution (e.g. 'Ma\'am', 'Ms.', 'sister')
}
```

Resolution in `services/templateEngine.ts → resolveTemplate()`:

| source | Resolved from |
|---|---|
| `prospect` | `prospect[field]` (with special gender-aware resolvers for `salutation`, `honorific`, `gender`) |
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

## Gemini LLM API Request & Response Telemetry

Outgoing requests made to the Google Gemini API (`generateContent`) are intercepted and logged into the `system_logs` database table with `source: 'gemini'`. The default model configured is `gemini-3.8-flash` (customizable dynamically via the Admin Panel under `/ai-settings` and persisted in the database, with no reliance on static `.env` variables).

- **Captured Fields:** Request method (`POST`), endpoint path (`/v1beta/models/${model}:generateContent`), HTTP status code, round-trip latency (`durationMs`), model name, request body (`contents`, `generationConfig`), and response body (`candidates` or error payload).
- **Security & Redaction:** Gemini API keys passed in URL query strings are strictly stripped to prevent token exposure. All sensitive fields in payload contexts are recursively sanitized via `sanitizeLogData()`.
- **Payload Truncation:** Large prompts or candidate structures are recursively truncated via `truncatePayload()` to prevent Postgres JSONB table bloat.
- **Observability:** Rendered in the frontend Admin Observability dashboard (`/logs`) with dedicated JSON viewer drawers for inspection and debugging.

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
- `llm.test.ts` — LLM provider factory, heuristic fallback rules, and Gemini API request/response telemetry logging
- `aiSettings.test.ts` — AI & LLM admin settings CRUD, validation, authorization, and test connection diagnostics
- `logs.test.ts` — System logging service, retention pruning, and admin log endpoints
- `genderInference.test.ts` — Automated pronoun parsing and first-name dictionary inference
- `templateEngine.test.ts` — Variable resolution, customizable salutations (Sir/Ma'am), HTML converters, tracking pixel injection
- `types.test.ts` — Backend types, getGmailSearchUrl utility, and Trinity sync validation

