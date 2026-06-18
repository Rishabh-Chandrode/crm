# Outreach CRM

A personal CRM for managing job-search email outreach. Store target companies and their contacts (prospects), write reusable templates with dynamic `{{variables}}`, and blast personalised emails to every prospect at a company in one action. Includes a Chrome extension for scraping LinkedIn profiles directly into the CRM.

---

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Backend | Node.js 20, Express 4, TypeScript (strict, ESM) |
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS |
| Database | PostgreSQL 16 |
| Email | Resend or Gmail (swappable — see [backend README](packages/backend/README.md)) |
| Containers | Docker + Docker Compose |
| Extension | Chrome MV3, TypeScript |

---

## Quick start

### Prerequisites

- Docker + Docker Compose
- Node.js 20+ and pnpm (for local development only)

### Production — full Docker

```bash
cp .env.example .env
# Fill in at minimum: ADMIN_PASSWORD, FROM_EMAIL, and one of RESEND_API_KEY or GMAIL_USER+GMAIL_APP_PASSWORD
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
| `JWT_SECRET` | no | Secret used to sign JWTs — change in production (default: `change-me-in-production`) |
| `RESEND_API_KEY` | no* | Resend API key — used if `GMAIL_USER` is not set |
| `GMAIL_USER` | no* | Gmail address for sending via Nodemailer |
| `GMAIL_APP_PASSWORD` | no* | Gmail app password (not your account password) |
| `FROM_EMAIL` | yes | Verified sender address |
| `FROM_NAME` | no | Display name for outgoing emails (default: `CRM`) |
| `REPLY_TO_EMAIL` | no | Reply-to address |
| `TRACKING_BASE_URL` | no | Public base URL for email open tracking pixels (default: `http://localhost:3001`) |
| `PORT` | no | Backend port (default: `3001`) |
| `NEXT_PUBLIC_API_URL` | yes (frontend) | Backend URL visible to the browser |

\* At least one of Resend or Gmail credentials must be set for email sending to work.

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

## Authentication

JWT-based auth with bcrypt password hashing. On first startup the backend seeds an admin user from `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

- All API routes (except `/api/auth/*` and `/api/track/*`) require `Authorization: Bearer <jwt>`.
- Frontend stores the JWT in an `HttpOnly`-equivalent cookie (`crm_token`), read by all `api.*` calls.
- Users have roles: **admin** (sees all data) or **user** (sees only their own records).
- Anyone can sign up at `/signup` — new accounts get `role=user` and immediate access.
- The Chrome extension authenticates via `POST /api/auth/login` and stores the JWT in `chrome.storage.sync`.

---

## Database schema (overview)

```
users           ← accounts (username, password_hash, role, profile fields)

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

documents       ← uploaded PDF/DOC attachments
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

## Adding features — where to start

| Task | Files to touch |
|---|---|
| New DB table | `backend/src/db/migrate.ts`, `backend/src/types/index.ts` |
| New API route | Add file in `backend/src/routes/`, register in `backend/src/routes/index.ts` |
| New frontend page | Add folder under `frontend/src/app/(dashboard)/`, add nav entry in `Sidebar.tsx` |
| New template variable source | `backend/src/services/templateEngine.ts` + `backend/src/types/index.ts` + `frontend/src/lib/types.ts` |
| Swap email provider | Implement `EmailProvider` interface in `backend/src/services/email/` |
