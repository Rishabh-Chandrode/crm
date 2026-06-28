# Outreach CRM

A personal CRM for managing job-search email outreach. Store target companies and their contacts (prospects), write reusable templates with dynamic `{{variables}}`, and blast personalised emails to every prospect at a company in one action. Includes a Chrome side panel extension that detects existing CRM contacts while browsing LinkedIn, scrapes new profiles into the CRM, and autofills job application forms (Greenhouse, Lever, Workday, Google Forms, and generic sites) with your stored profile.

---

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Backend | Node.js 20, Express 4, TypeScript (strict, ESM) |
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS |
| Database | PostgreSQL 16 |
| Email | Gmail via OAuth2 (or Resend as fallback) |
| Containers | Docker + Docker Compose |
| Extension | Chrome MV3 side panel, TypeScript |

---

## Quick start

### Prerequisites

- Docker + Docker Compose
- Node.js 20+ and pnpm (for local development only)

### Production — full Docker

```bash
cp .env.example .env
# Fill in at minimum: ADMIN_PASSWORD, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
docker compose up --build
```

- Frontend → http://localhost:3000
- Backend API → http://localhost:3001

### Local development (DB in Docker, apps on host)

```bash
cp .env.example .env
# Set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crm

docker compose up db -d          # start only the database
pnpm install                     # install all packages from repo root

# Terminal 1 — backend (hot reload)
cd packages/backend && pnpm dev

# Terminal 2 — frontend (hot reload)
cd packages/frontend && pnpm dev
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_DB` | yes | Database name (default: `crm`) |
| `POSTGRES_USER` | yes | DB user (default: `postgres`) |
| `POSTGRES_PASSWORD` | yes | DB password |
| `DATABASE_URL` | yes (backend) | Full postgres connection string |
| `ADMIN_PASSWORD` | yes | Password for the auto-seeded `admin` account |
| `ADMIN_USERNAME` | no | Username for the admin account (default: `admin`) |
| `JWT_SECRET` | no | Secret used to sign JWTs — change in production |
| `GOOGLE_CLIENT_ID` | yes | OAuth2 client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | yes | OAuth2 client secret |
| `GOOGLE_REDIRECT_URI` | no | OAuth2 callback URI (default: `http://localhost:3001/api/auth/gmail/callback`) |
| `RESEND_API_KEY` | no | Resend API key — fallback email provider if Gmail is not connected |
| `FROM_EMAIL` | no | Sender address used when Resend is the active provider |
| `TRACKING_BASE_URL` | no | Public base URL for email open-tracking pixels (default: `http://localhost:3001`) |
| `PORT` | no | Backend port (default: `3001`) |
| `NEXT_PUBLIC_API_URL` | yes (frontend) | Backend URL visible to the browser |

---

## Authentication

JWT-based auth with bcrypt password hashing. On first startup the backend seeds an admin user from `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

- All API routes (except `/api/auth/*` and `/api/track/*`) require `Authorization: Bearer <jwt>`.
- Frontend stores the JWT in a cookie (`crm_token`), read by all `api.*` calls.
- Users have roles: **admin** (sees all data) or **user** (sees only their own records).

### Sign-in options

| Method | How |
|---|---|
| Username + password | Classic form on `/login` and `/signup` |
| Google | "Continue with Google" on `/login` and `/signup` — creates an account automatically on first use |

Google sign-in requests Gmail API access at the same time. If the user approves, their Gmail account is automatically connected for sending. If they decline Gmail access they are still logged in and can connect Gmail later from Settings.

### Gmail connection

Each user connects their own Gmail account via OAuth2 (Settings → Gmail sending account). The refresh token is stored per-user. All emails are sent from the authenticated user's Gmail address; no shared app password is needed.

---

## Repository layout

```
crm/
├── docker-compose.yml          # Orchestrates db, backend, frontend
├── .env.example                # Copy to .env and fill in secrets
├── packages/
│   ├── backend/                # Express API — see packages/backend/README.md
│   ├── frontend/               # Next.js app — see packages/frontend/README.md
│   └── extension/              # Chrome extension — see packages/extension/README.md
└── pnpm-workspace.yaml
```

---

## Database schema (overview)

```
users           ← accounts (username, password_hash, role, full profile fields,
                             phone_country_code, gender, veteran_status,
                             skills/projects/work_experiences JSONB,
                             gmail_user, gmail_refresh_token, google_id,
                             from_name, reply_to_email)

companies       ← target companies
  └── created_by → users.id

prospects       ← contacts at companies
  ├── company_id  → companies.id
  └── created_by  → users.id

email_templates ← reusable templates with {{variable}} placeholders
  └── created_by  → users.id

email_sends     ← log of every sent / failed email
  ├── template_id → email_templates.id
  ├── prospect_id → prospects.id
  └── created_by  → users.id

email_schedules ← future sends processed by the scheduler
  └── created_by  → users.id

job_applications← applications tracked by extension or entered manually
  └── user_id   → users.id

documents       ← uploaded PDF/DOC attachments + Drive-linked files (auto-synced every 2 h)
variable_presets← saved template variable mappings
settings        ← key/value store
```

Full schema and incremental migrations live in `packages/backend/src/db/migrate.ts`.

---

## Template variable system

Templates use `{{variableName}}` placeholders. Each variable has a **source**:

| Source | Resolved from |
|---|---|
| `prospect` | A field on the prospect record (`first_name`, `email`, …) |
| `company` | A field on the company record (`name`, `website`, …) |
| `sender` | A field from the sending user's profile (`first_name`, `email`, `job_title`, …) |
| `static` | A fixed default value set once in the template editor |
| `custom` | A value you fill in manually at send time |

Variable presets (Settings → Template Variables) let you wire up a key once and have it auto-apply to every template — e.g. `{{myFirstName}}` → sender → `first_name`.

---

## Documents & Drive sync

Documents are managed in **Settings → Documents**. Two ways to add:

- **Upload** — upload a PDF/DOC/DOCX from your machine (max 10 MB).
- **Link from Google Drive** — paste a public Google Drive or Google Docs/Slides/Sheets URL. The file is downloaded immediately and stored locally. Every 2 hours the scheduler re-fetches it so the local copy stays current with whatever is in Drive.

If a Drive-linked file is deleted from Drive (or its sharing is revoked), the next sync automatically removes it from the system and cleans it out of any templates that referenced it.

Attach documents to templates in the template editor (Settings → Documents → pick the template). Attached documents are sent as real file attachments — not links.

---

## Adding features — where to start

| Task | Files to touch |
|---|---|
| New DB table | `backend/src/db/migrate.ts`, `backend/src/types/index.ts` |
| New API route | Add file in `backend/src/routes/`, register in `backend/src/routes/index.ts` |
| New frontend page | Add folder under `frontend/src/app/(dashboard)/`, add nav entry in `Sidebar.tsx` |
| New template variable source | `backend/src/services/templateEngine.ts` + `backend/src/types/index.ts` + `frontend/src/lib/types.ts` |
| Swap email provider | Implement `EmailProvider` interface in `backend/src/services/email/` |
| New autofill platform | Add a file in `extension/src/formFiller/platforms/`, register in `extension/src/formFiller/index.ts` |
| New autofill field type | Add to `FieldType` + `PATTERNS` in `extension/src/formFiller/detector.ts` (ordering matters — specific before broad), add to `ALL_FIELD_TYPES` in `types.ts`, add field to `UserProfile` in `types.ts` and `extension/src/types.ts` |
| New user profile field | `backend/src/db/migrate.ts` (ALTER TABLE), `backend/src/routes/auth.ts` (PATCH + GET), `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/app/(dashboard)/profile/page.tsx`, `extension/src/formFiller/types.ts`, `extension/src/types.ts` |
