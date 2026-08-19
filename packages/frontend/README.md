# Frontend

Next.js 14 with App Router, React 18, Tailwind CSS. Strict TypeScript. No third-party data-fetching library — all backend calls go through a typed `api.*` client backed by native `fetch`.

---

## Project layout

```
src/
├── middleware.ts                  # Edge middleware — redirects unauthenticated users
├── app/
│   ├── layout.tsx                 # Root HTML shell, imports globals.css
│   ├── page.tsx                   # Redirects / → /dashboard
│   ├── globals.css                # Tailwind directives + shared component classes
│   ├── login/page.tsx             # Login form — username/password + Google sign-in
│   ├── signup/page.tsx            # Signup form — username/password + Google sign-in
│   └── (dashboard)/               # Route group — shares sidebar layout
│       ├── layout.tsx             # Renders <Sidebar> + <main>
│       ├── dashboard/page.tsx     # Stats overview + charts + recent activity
│       ├── companies/page.tsx     # Company CRUD (table + modal + merge)
│       ├── prospects/page.tsx     # Prospect list (table + filters + pagination)
│       ├── prospects/[id]/page.tsx# Prospect detail view — full profile + email history
│       ├── templates/page.tsx     # Template CRUD + variable manager
│       ├── send/page.tsx          # Multi-step send wizard
│       ├── history/page.tsx       # Paginated email send log
│       ├── scheduled/page.tsx     # Email schedule list + cancel
│       ├── applications/page.tsx  # Job application tracker — CRUD + status/search filters
│       ├── profile/page.tsx       # Full profile editor — personal, professional, preferences
│       ├── settings/page.tsx      # Gmail connection, Documents, Template Variables
│       └── users/page.tsx         # Admin-only user management
├── components/
│   └── Sidebar.tsx                # Left nav with user info + sign-out
└── lib/
    ├── types.ts                   # TypeScript interfaces mirroring backend types
    └── api.ts                     # Typed fetch wrapper — all backend calls go here
```

---

## Authentication flow

### Username / password

1. Any protected route → `middleware.ts` checks for `crm_token` cookie → redirects to `/login` if missing.
2. Login/signup pages call `POST /api/auth/login` or `POST /api/auth/signup`, receive a JWT, and store it as a cookie (`crm_token`, 7-day max-age).
3. All `api.*` calls in `lib/api.ts` read the cookie and send `Authorization: Bearer <token>`.
4. Sign-out: `Sidebar.tsx` clears the cookie (`max-age=0`) and redirects to `/login`.

### Google sign-in

1. User clicks **Continue with Google** on `/login` or `/signup`.
2. Frontend calls `GET /api/auth/google/connect` → receives a Google OAuth2 URL → redirects the browser.
3. Google returns to the backend callback, which finds/creates the user and redirects to `/login?google_token=<jwt>`.
4. The login page reads `google_token` from the URL, stores it as the `crm_token` cookie, and navigates to `/dashboard`.
5. If the Google consent screen includes Gmail access and is approved, Gmail is connected automatically (Settings will show "connected").
6. If the flow fails, `google_error` appears in the URL and an error message is shown on the login page.

---

## API client (`lib/api.ts`)

All backend calls go through `api.*` — never call `fetch` directly from pages.

```typescript
// Auth
api.auth.login(username, password)          // POST /api/auth/login
api.auth.signup(username, password, email?) // POST /api/auth/signup
api.auth.me()                               // GET  /api/auth/me
api.auth.updateProfile(fields)              // PATCH /api/auth/profile
api.auth.googleLoginUrl()                   // GET  /api/auth/google/connect → { url }
api.auth.gmailConnect()                     // GET  /api/auth/gmail/connect  → { url }
api.auth.gmailDisconnect()                  // DELETE /api/auth/gmail/disconnect

// Users (admin only)
api.users.list()
api.users.create(body)
api.users.update(id, body)
api.users.delete(id)

// Standard CRUD pattern (companies, prospects, templates)
api.companies.list()
api.companies.get(id)
api.companies.create(body)
api.companies.update(id, body)
api.companies.delete(id)
api.companies.merge(targetId, sourceId)

// Email
api.email.preview(templateId, prospectId, customValues?)
api.email.send(templateId, prospectId, customValues?, documentIds?)
api.email.sendCompany(templateId, companyId, prospectIds?, customValues?, documentIds?)
api.email.history(limit, offset, filters?)
api.email.retry(id)

// Schedules, Documents, Variable Presets, Stats, Import
api.schedules.list() / .create() / .get(id) / .cancel(id)
api.documents.list() / .upload(file, name) / .delete(id) / .download(id)
api.variablePresets.list() / .create() / .update() / .delete()
api.stats.get()
api.import.parse(file)
api.import.prospects(body)

// Job Applications
api.applications.list(filters?)       // GET  /api/applications — status, search, limit, offset
api.applications.create(body)         // POST /api/applications
api.applications.update(id, body)     // PATCH /api/applications/:id
api.applications.delete(id)           // DELETE /api/applications/:id
```

**To add a new resource:**
1. Add the interface to `lib/types.ts`
2. Add an entry to the `api` object in `lib/api.ts` following the existing pattern

---

## Shared types (`lib/types.ts`)

Mirrors backend `src/types/index.ts`. Keep both in sync when the schema changes.

Key exports:

| Export | Purpose |
|---|---|
| `CrmUser` | User account with full profile, `has_gmail_configured` flag |
| `Company`, `Prospect`, `EmailTemplate`, `EmailSend`, `EmailSchedule` | Core data interfaces |
| `JobApplication` | Job application record (`company_name`, `job_title`, `job_url`, `platform`, `status`, `applied_at`) |
| `VariableSource` | `'prospect' \| 'company' \| 'sender' \| 'static' \| 'custom'` |
| `TemplateVariable`, `VariablePreset` | Template variable types |
| `PROSPECT_FIELDS` | Field options for the variable mapper (prospect source) |
| `COMPANY_FIELDS` | Field options for the variable mapper (company source) |
| `SENDER_FIELDS` | Field options for the variable mapper (sender/profile source) |
| `prospectFullName(p)` | Combines `first_name` + `last_name` |
| `buildVariableFromKey(key, presets)` | Resolves a key against saved presets |

---

## Pages overview

### Login / Signup (`/login`, `/signup`)

Both pages offer two sign-in paths:

- **Continue with Google** — initiates the Google OAuth2 flow. On success, logs the user in and (if Gmail access was granted) connects Gmail automatically.
- **Username + password** — classic form-based login below a divider.

### Profile (`/profile`)

Full profile editor with three sections:

- **Personal** — `first_name`, `last_name`, `email`, `phone` + `phone_country_code`, `city`, `state`, `country`, `location`, `hometown`.
- **Professional** — `current_company`, `job_title`, `work_authorization`, `years_of_experience`, `notice_period`, `current_ctc`, `expected_ctc`, `education`, `college_name`, `graduation_year`, `linkedin_url`, `github_url`, `website`, `skills`.
- **Preferences** — `gender`, `veteran_status`.

Profile values are available in email templates via the `sender` variable source and are used by the Chrome extension's form autofiller.

### Settings (`/settings`)

Three sections (profile editing was moved to `/profile`):

- **Gmail sending account** — connect or disconnect your Gmail via OAuth2. Shows the connected address when active. Configures `from_name` and `reply_to_email` overrides for outgoing mail.
- **Documents** — upload PDF/DOC files to attach to outreach emails. Stored server-side, referenced by ID in templates or at send time.
- **Template Variables** — configure variable presets. Map a `{{key}}` once (e.g. `{{myName}}` → sender → `first_name`) and it auto-wires in every template.

### Applications (`/applications`)

Tracks job applications auto-recorded by the Chrome extension when you submit a form, or added manually. Shows `company_name`, `job_title`, `platform`, `status` (applied / screening / interview / offer / rejected / withdrawn), and `applied_at`. Filterable by status and full-text search. Inline editing and delete.

### Prospects (`/prospects` + `/prospects/[id]`)

The list view shows a filterable, paginated table. Each row links to the detail page (`/prospects/[id]`) which shows the full prospect profile, company info, notes, and email history for that contact.

### Templates (`/templates`)

Full template CRUD + inline variable manager. Each variable has a source dropdown; when source is `prospect`, `company`, or `sender`, a field picker appears. **Detect Variables** scans the current `subject` + `body` and adds stubs for any `{{key}}` not yet configured.

### Send wizard (`/send`)

Four steps: select template + company + prospects → fill custom variables → preview → confirm send. Calls `api.email.sendCompany()`.

### Scheduled (`/scheduled`)

Lists upcoming and past email schedules. Pending schedules can be cancelled.

### Users (`/users`)

Admin-only. Table of all accounts with role selector, active toggle, and delete. Includes a create-user form.

---

## Styling

Tailwind CSS, no component library. Shared classes are defined as `@layer components` in `globals.css`:

```css
.form-label     /* <label> */
.form-input     /* <input> and <select> */
```

Use these on form elements instead of repeating Tailwind utilities.

---

## Adding a new page

1. Create `src/app/(dashboard)/my-page/page.tsx` — mark it `'use client'` if it needs state
2. Add a nav entry in `src/components/Sidebar.tsx` (the `NAV` array at the top; use `ADMIN_NAV` for admin-only items)

All pages inside `(dashboard)/` automatically get the sidebar layout.

---

## Environment

`NEXT_PUBLIC_API_URL` is the only runtime env var. It is baked into the JS bundle at build time, so:

- **Docker**: set it as a build arg: `NEXT_PUBLIC_API_URL=https://api.example.com docker compose up --build`
- **Local dev**: prefix the command: `NEXT_PUBLIC_API_URL=http://localhost:3001 pnpm dev`

---

## Automated Testing

Frontend uses **Vitest** with `jsdom` and **React Testing Library** for automated testing without manual browser interactions.

```bash
# Run frontend tests once
pnpm test

# Run frontend tests in watch mode
pnpm test:watch
```

Test suites live in `src/__tests__/`:
- `api.test.ts` — Central API client (`src/lib/api.ts`), JWT cookie handling, header injection, 400 error field unwrapping
- `types.test.ts` — Utility functions (`prospectFullName`, `toVariableLabel`, `buildVariableFromKey`)

