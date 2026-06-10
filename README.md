# Outreach CRM

A personal CRM for managing job-search email outreach. Store target companies and their HR contacts (prospects), write reusable email templates with dynamic variables, and send personalised emails to every prospect at a company in one action.

---

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Backend | Node.js 20, Express 4, TypeScript (strict, ESM) |
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS |
| Database | PostgreSQL 16 |
| Email | Resend (swappable — see [backend README](packages/backend/README.md)) |
| Containers | Docker + Docker Compose |

---

## Quick start

### Prerequisites
- Docker + Docker Compose
- Node.js 20+ and pnpm (for local development only)

### Production (full Docker)

```bash
cp .env.example .env
# Fill in: ADMIN_PASSWORD, RESEND_API_KEY, FROM_EMAIL
docker compose up --build
```

- Frontend → http://localhost:3000
- Backend API → http://localhost:3001

### Local development (DB in Docker, apps running locally)

```bash
cp .env.example .env
# Set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crm

# Start only the database
docker compose up db -d

# Install all packages (run from repo root)
pnpm install

# Terminal 1 — backend (hot reload)
cd packages/backend
cp ../../.env .
pnpm dev

# Terminal 2 — frontend (hot reload)
cd packages/frontend
NEXT_PUBLIC_API_URL=http://localhost:3001 pnpm dev
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_DB` | yes | Database name (default: `crm`) |
| `POSTGRES_USER` | yes | DB user (default: `postgres`) |
| `POSTGRES_PASSWORD` | yes | DB password |
| `DATABASE_URL` | yes (backend) | Full postgres connection string |
| `ADMIN_PASSWORD` | yes | Single password to log in to the app |
| `RESEND_API_KEY` | yes* | Resend API key — app starts without it but sending will fail |
| `FROM_EMAIL` | yes* | Verified sender email address |
| `FROM_NAME` | no | Display name for outgoing emails (default: `CRM`) |
| `PORT` | no | Backend port (default: `3001`) |
| `NEXT_PUBLIC_API_URL` | yes (frontend) | Backend URL visible to the browser |

---

## Repository layout

```
crm/
├── docker-compose.yml          # Orchestrates db, backend, frontend
├── .env.example                # Copy to .env and fill in
├── packages/
│   ├── backend/                # Express API — see packages/backend/README.md
│   └── frontend/               # Next.js app — see packages/frontend/README.md
└── pnpm-workspace.yaml
```

---

## Database schema (overview)

```
companies       ← target companies
prospects       ← HR contacts (first_name, last_name, email, …)
  └── company_id → companies.id

email_templates ← reusable templates with {{variable}} placeholders
  └── variables  (JSONB) — each variable maps a key to a data source

email_sends     ← log of every sent/failed email
  ├── template_id → email_templates.id
  ├── prospect_id → prospects.id
  └── company_id  → companies.id
```

Full schema and migration logic live in `packages/backend/src/db/migrate.ts`.

---

## Authentication

A single `ADMIN_PASSWORD` environment variable protects all routes. The frontend stores the password as a cookie (`crm_token`) and sends it as `Authorization: Bearer <password>` on every API request. To swap in real auth (e.g. JWT or OAuth), replace:

- **Backend**: the `authMiddleware` in `packages/backend/src/middleware/auth.ts`
- **Frontend**: the cookie logic in `packages/frontend/src/app/login/page.tsx` and the API client in `packages/frontend/src/lib/api.ts`

---

## Adding features — where to start

| Task | Files to touch |
|---|---|
| New DB table | `backend/src/db/migrate.ts`, `backend/src/types/index.ts` |
| New API route | Add file in `backend/src/routes/`, register in `backend/src/routes/index.ts` |
| New frontend page | Add folder under `frontend/src/app/(dashboard)/` |
| New template variable source | `backend/src/services/templateEngine.ts`, `frontend/src/lib/types.ts` (PROSPECT_FIELDS / COMPANY_FIELDS) |
| Swap email provider | `backend/src/services/email/` — implement `EmailProvider` interface |
