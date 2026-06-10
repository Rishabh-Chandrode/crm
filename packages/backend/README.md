# Backend

Express 4 API server. TypeScript strict mode, ESM (`"type": "module"`), Node.js 20.

---

## Entry point

`src/index.ts` — creates the Express app, runs DB migration, then starts listening.

Startup order:
1. Validate required env vars (`src/config.ts`)
2. Run `migrate()` — creates tables if missing, runs column migrations
3. Start HTTP server

---

## Project layout

```
src/
├── config.ts                  # Typed env vars — edit here to add new ones
├── index.ts                   # App bootstrap
├── db/
│   ├── index.ts               # pg Pool instance (import `pool` from here)
│   └── migrate.ts             # Schema + incremental column migrations (idempotent)
├── middleware/
│   ├── auth.ts                # Bearer-token auth — swap this for real auth
│   └── errorHandler.ts        # Global Express error handler
├── routes/
│   ├── index.ts               # Mounts all routers; applies authMiddleware
│   ├── auth.ts                # POST /api/auth/login, GET /api/auth/me
│   ├── companies.ts           # CRUD for companies
│   ├── prospects.ts           # CRUD for prospects
│   ├── templates.ts           # CRUD for email templates + detect-variables
│   └── email.ts               # preview, send, send-company, history
├── services/
│   ├── email/
│   │   ├── types.ts           # EmailProvider interface — implement this to swap providers
│   │   ├── resend.ts          # Resend implementation
│   │   └── index.ts           # Factory — returns the active provider singleton
│   └── templateEngine.ts      # {{variable}} resolution and plain-text → HTML
└── types/
    └── index.ts               # Shared TypeScript interfaces + prospectFullName helper
```

---

## API routes

All routes except `/api/auth/*` require `Authorization: Bearer <ADMIN_PASSWORD>`.

### Auth
| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/auth/login` | `{ password }` | Returns `{ token }` on success |
| GET | `/api/auth/me` | — | 200 if token valid, 401 otherwise |

### Companies
| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/companies` | — | List all (includes `prospect_count`) |
| POST | `/api/companies` | `{ name, website?, industry? }` | Create |
| GET | `/api/companies/:id` | — | Single company with nested `prospects[]` |
| PATCH | `/api/companies/:id` | any subset of fields | Partial update |
| DELETE | `/api/companies/:id` | — | Delete |

### Prospects
| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/prospects` | `?company_id=` | List (filterable by company) |
| POST | `/api/prospects` | `{ first_name, last_name?, email, company_id?, job_title?, phone?, linkedin_url?, notes? }` | Create |
| GET | `/api/prospects/:id` | — | Single prospect with nested `company` |
| PATCH | `/api/prospects/:id` | any subset of fields | Partial update |
| DELETE | `/api/prospects/:id` | — | Delete |

### Email templates
| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/templates` | — | List all |
| POST | `/api/templates` | `{ name, subject, body, description?, job_description?, variables? }` | Create |
| GET | `/api/templates/:id` | — | Single template |
| PATCH | `/api/templates/:id` | any subset | Partial update |
| DELETE | `/api/templates/:id` | — | Delete |
| POST | `/api/templates/:id/detect-variables` | `{ existing: TemplateVariable[] }` | Scan body+subject for `{{placeholders}}`, return new ones not yet in `existing` |

### Email
| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/email/preview` | `{ templateId, prospectId, customValues? }` | Resolve variables and return `{ subject, body, html }` — does not send |
| POST | `/api/email/send` | `{ templateId, prospectId, customValues? }` | Send to one prospect |
| POST | `/api/email/send-company` | `{ templateId, companyId, prospectIds?, customValues? }` | Send to all (or selected) prospects at a company |
| GET | `/api/email/history` | `?limit=50&offset=0` | Paginated send log |

---

## Database

### Schema

```sql
companies (id, name, website, industry, created_at, updated_at)

prospects (id, company_id→companies, first_name, last_name, email,
           job_title, linkedin_url, phone, notes, created_at, updated_at)

email_templates (id, name, description, subject, body, job_description,
                 variables JSONB, created_at, updated_at)

email_sends (id, template_id→email_templates, prospect_id→prospects,
             company_id→companies, subject, body, status,
             resend_id, sent_at, error_message, created_at)
```

### Migrations

`migrate.ts` runs on every startup. It is **idempotent** — uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. Column-level changes use `DO $$ ... END $$` blocks that check `information_schema.columns` before altering.

**To add a new column:**
```typescript
// In migrate.ts, add a new DO block after the SCHEMA const:
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
// Then call: await pool.query(MIGRATE_MY_COLUMN); inside migrate()
```

---

## Template variable system

`TemplateVariable` (defined in `types/index.ts`):

```typescript
{
  key: string          // placeholder name — used as {{key}} in templates
  label: string        // human-readable label shown in UI
  source: 'prospect' | 'company' | 'static' | 'custom'
  field?: string       // which field on prospect/company to read
  defaultValue?: string
}
```

Resolution happens in `services/templateEngine.ts → resolveTemplate()`:

| `source` | Resolved from |
|---|---|
| `prospect` | `prospect[field]` |
| `company` | `company[field]` |
| `static` | `variable.defaultValue` (set once in the template editor) |
| `custom` | `customValues[key]` — the caller provides a value per send |

To add a new source type, update `VariableSource` in `types/index.ts` and add a branch in `resolveTemplate`.

---

## Email provider

The `EmailProvider` interface (`services/email/types.ts`):

```typescript
interface EmailProvider {
  send(options: { to, subject, html, replyTo? }): Promise<{ id: string }>;
}
```

To swap Resend for another provider:
1. Create a new file in `services/email/` implementing `EmailProvider`
2. In `services/email/index.ts`, change what `getEmailProvider()` instantiates

---

## Adding a new route

1. Create `src/routes/my-resource.ts` — export a default `Router`
2. Register it in `src/routes/index.ts`:
   ```typescript
   import myRouter from './my-resource.js';
   router.use('/my-resource', authMiddleware, myRouter);
   ```
3. Add types to `src/types/index.ts` if needed

---

## TypeScript notes

- Module system: **ESM** (`"type": "module"` in package.json). All relative imports must use `.js` extension even though source files are `.ts`.
- `pg` is a CommonJS module — import as `import pg from 'pg'; const { Pool } = pg;`
- Run with `tsx` in dev, compile with `tsc` for production.
