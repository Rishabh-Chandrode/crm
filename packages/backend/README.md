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
│   └── scheduler.ts             # node-cron job — processes pending email_schedules
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
| PATCH | `/api/auth/profile` | required | Update profile (`first_name`, `last_name`, `email`, `current_company`, `job_title`, `phone`, `website`, `bio`, `from_name`, `reply_to_email`) |

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

## API routes

`/api/auth/*` and `/api/track/*` are public. Everything else requires a valid JWT.

### Users (admin only)

| Method | Path | Description |
|---|---|---|
| GET | `/api/users` | List all users |
| POST | `/api/users` | Create user `{ username, password, email?, role? }` |
| PATCH | `/api/users/:id` | Update `email`, `role`, `is_active`, `password` |
| DELETE | `/api/users/:id` | Delete (cannot delete self) |

### Companies

| Method | Path | Description |
|---|---|---|
| GET | `/api/companies` | List (includes `prospect_count`) |
| POST | `/api/companies` | Create `{ name, website?, industry? }` |
| GET | `/api/companies/:id` | Single company with nested `prospects[]` |
| PATCH | `/api/companies/:id` | Partial update |
| DELETE | `/api/companies/:id` | Delete |
| POST | `/api/companies/:id/merge` | Merge source company into target `{ sourceId }` |

### Prospects

| Method | Path | Description |
|---|---|---|
| GET | `/api/prospects` | List — query params: `company_id`, `role_category`, `search`, `sort_by`, `sort_dir`, `limit`, `offset` |
| POST | `/api/prospects` | Create |
| GET | `/api/prospects/lookup` | Look up by `linkedin_url` and/or `email` — returns first match for current user (used by extension match card) |
| GET | `/api/prospects/:id` | Single prospect with nested `company` |
| PATCH | `/api/prospects/:id` | Partial update |
| DELETE | `/api/prospects/:id` | Delete |
| POST | `/api/prospects/quick-add` | Create or update from minimal data (used by extension) |

### Email templates

| Method | Path | Description |
|---|---|---|
| GET | `/api/templates` | List all |
| POST | `/api/templates` | Create `{ name, subject, body, description?, variables?, document_ids? }` |
| GET | `/api/templates/:id` | Single template |
| PATCH | `/api/templates/:id` | Partial update |
| DELETE | `/api/templates/:id` | Delete |
| POST | `/api/templates/:id/detect-variables` | Scan `subject+body` for `{{placeholders}}`, return new keys not in `existing` |

### Email

| Method | Path | Description |
|---|---|---|
| POST | `/api/email/preview` | Resolve variables → `{ subject, body, html }` — no send |
| POST | `/api/email/send` | Send to one prospect |
| POST | `/api/email/send-company` | Send to all (or filtered) prospects at a company |
| GET | `/api/email/history` | Paginated send log — filters: `status`, `search`, `company_id`, `template_id` |
| POST | `/api/email/retry/:id` | Retry a failed send |

### Schedules

| Method | Path | Description |
|---|---|---|
| GET | `/api/schedules` | List all schedules |
| POST | `/api/schedules` | Create `{ templateId, companyId, prospectIds?, customValues?, scheduledFor, documentIds? }` |
| GET | `/api/schedules/:id` | Detail with nested `prospects[]` |
| DELETE | `/api/schedules/:id` | Cancel (pending only) |

### Documents

| Method | Path | Description |
|---|---|---|
| GET | `/api/documents` | List |
| POST | `/api/documents` | Upload (multipart/form-data: `document` file + `name` field) |
| DELETE | `/api/documents/:id` | Delete |

### Variable presets

| Method | Path | Description |
|---|---|---|
| GET | `/api/variable-presets` | List |
| POST | `/api/variable-presets` | Create `{ key, label, source, field?, default_value }` |
| PUT | `/api/variable-presets/:id` | Replace |
| DELETE | `/api/variable-presets/:id` | Delete |

### Other

| Method | Path | Description |
|---|---|---|
| GET | `/api/stats` | Dashboard stats (scoped to user or all for admin) |
| POST | `/api/import/parse` | Parse CSV/Excel file, return headers + preview rows |
| POST | `/api/import/prospects` | Bulk create prospects from parsed rows |
| GET | `/api/track/open/:id.gif` | Email open tracking pixel (public) |

---

## Database

### Schema (key tables)

```sql
users (id UUID PK, username, email, password_hash, role, is_active,
       first_name, last_name, current_company, job_title, phone, website, bio,
       google_id,                          -- links Google OAuth account
       gmail_user, gmail_refresh_token,    -- per-user Gmail OAuth2 credentials
       from_name, reply_to_email,          -- email display name / reply-to overrides
       created_at, updated_at)

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
documents       (id, name, filename, path, size, created_by→users, created_at)
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

`services/scheduler.ts` runs a `node-cron` job every minute. It picks up `email_schedules` with `status = 'pending'` and `scheduled_for <= NOW()`, sends to all prospect IDs in the schedule, and updates counts. The sender profile (including Gmail credentials) is loaded from `created_by` on the schedule row so `{{sender…}}` variables resolve correctly.

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
