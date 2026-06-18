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
│   ├── users.ts                 # /users — admin-only user management
│   ├── companies.ts             # /companies — CRUD
│   ├── prospects.ts             # /prospects — CRUD + quick-add
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
│   │   ├── gmail.ts             # Gmail/Nodemailer implementation
│   │   └── index.ts             # Factory — picks provider from env
│   ├── templateEngine.ts        # {{variable}} resolution + plain-text → HTML
│   ├── attachmentHelper.ts      # Loads documents from disk for attachments
│   └── scheduler.ts             # node-cron job — processes pending email_schedules
└── types/
    └── index.ts                 # Shared TypeScript interfaces
```

---

## Authentication

JWT-based. Every protected route requires `Authorization: Bearer <token>`.

- `POST /api/auth/login` — validates username + password (bcrypt), returns a signed JWT
- `POST /api/auth/signup` — public, creates `role=user` account, returns JWT
- `GET /api/auth/me` — returns the current user's full profile
- `PATCH /api/auth/profile` — updates the current user's profile fields

**Middleware:**

```typescript
// src/middleware/auth.ts
authMiddleware          // verifies JWT, attaches req.user: AuthenticatedUser
requireRole('admin')    // factory — rejects requests from non-admin users
```

**JWT payload:**

```typescript
{ id: string; username: string; role: 'admin' | 'user' }
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

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | public | `{ username, password }` → `{ token, user }` |
| POST | `/api/auth/signup` | public | `{ username, password, email? }` → `{ token, user }` |
| GET | `/api/auth/me` | required | Returns current user with profile fields |
| PATCH | `/api/auth/profile` | required | Update profile (`first_name`, `last_name`, `email`, `current_company`, `job_title`, `phone`, `website`, `bio`) |

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
// In migrate.ts, add a DO block and call it in migrate():
const MIGRATE_MY_COLUMN = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'my_table' AND column_name = 'my_column'
  ) THEN
    ALTER TABLE my_table ADD COLUMN my_column VARCHAR(255);
  END IF;
END $$;
`;
```

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

The scheduler resolves `sender` by loading the profile of the user who created the schedule (`created_by`).

---

## Email providers

`EmailProvider` interface (`services/email/types.ts`):

```typescript
interface EmailProvider {
  send(options: { to: string; subject: string; html: string; attachments?: ...; replyTo?: string }): Promise<{ id: string }>;
}
```

`services/email/index.ts → getEmailProvider()` picks the active provider:
- **Gmail** — if `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set
- **Resend** — if `RESEND_API_KEY` is set

To add a provider, implement the interface and update the factory.

---

## Email scheduler

`services/scheduler.ts` runs a `node-cron` job every minute. It picks up `email_schedules` with `status = 'pending'` and `scheduled_for <= NOW()`, sends to all prospect IDs in the schedule, and updates counts. The sender profile is loaded from `created_by` on the schedule row so `{{sender…}}` variables resolve correctly.

---

## TypeScript notes

- Module system: **ESM** (`"type": "module"`). All relative imports need `.js` extension even though source files are `.ts`.
- `pg` is CommonJS — import as `import pg from 'pg'; const { Pool } = pg;`
- Dev: `tsx watch`, prod: compile with `tsc` then run with `node`.
