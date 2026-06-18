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
│   ├── login/page.tsx             # Login form (username + password)
│   ├── signup/page.tsx            # Signup form (username, email?, password)
│   └── (dashboard)/               # Route group — shares sidebar layout
│       ├── layout.tsx             # Renders <Sidebar> + <main>
│       ├── dashboard/page.tsx     # Stats overview + charts + recent activity
│       ├── companies/page.tsx     # Company CRUD (table + modal + merge)
│       ├── prospects/page.tsx     # Prospect CRUD (table + filters + pagination)
│       ├── templates/page.tsx     # Template CRUD + variable manager
│       ├── send/page.tsx          # Multi-step send wizard
│       ├── history/page.tsx       # Paginated email send log
│       ├── scheduled/page.tsx     # Email schedule list + cancel
│       ├── settings/page.tsx      # Profile, Documents, Template Variables
│       └── users/page.tsx         # Admin-only user management
├── components/
│   └── Sidebar.tsx                # Left nav with user info + sign-out
└── lib/
    ├── types.ts                   # TypeScript interfaces mirroring backend types
    └── api.ts                     # Typed fetch wrapper — all backend calls go here
```

---

## Authentication flow

1. Any protected route → `middleware.ts` checks for `crm_token` cookie → redirects to `/login` if missing.
2. Logged-in users visiting `/login` or `/signup` are redirected to `/dashboard`.
3. Login/signup pages call `POST /api/auth/login` or `POST /api/auth/signup`, receive a JWT, and store it as `document.cookie = 'crm_token=<jwt>; max-age=604800; path=/'`.
4. All `api.*` calls in `lib/api.ts` read the cookie and send `Authorization: Bearer <token>`.
5. Sign-out: `Sidebar.tsx` clears the cookie (`max-age=0`) and redirects to `/login`.

---

## API client (`lib/api.ts`)

All backend calls go through `api.*` — never call `fetch` directly from pages.

```typescript
// Auth
api.auth.login(username, password)          // POST /api/auth/login
api.auth.signup(username, password, email?) // POST /api/auth/signup
api.auth.me()                               // GET  /api/auth/me
api.auth.updateProfile(fields)              // PATCH /api/auth/profile

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
api.documents.list() / .upload(file, name) / .delete(id)
api.variablePresets.list() / .create() / .update() / .delete()
api.stats.get()
api.import.parse(file)
api.import.prospects(body)
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
| `CrmUser` | User account with profile fields |
| `Company`, `Prospect`, `EmailTemplate`, `EmailSend`, `EmailSchedule` | Core data interfaces |
| `VariableSource` | `'prospect' \| 'company' \| 'sender' \| 'static' \| 'custom'` |
| `TemplateVariable`, `VariablePreset` | Template variable types |
| `PROSPECT_FIELDS` | Field options for the variable mapper (prospect source) |
| `COMPANY_FIELDS` | Field options for the variable mapper (company source) |
| `SENDER_FIELDS` | Field options for the variable mapper (sender/profile source) |
| `prospectFullName(p)` | Combines `first_name` + `last_name` |
| `buildVariableFromKey(key, presets)` | Resolves a key against saved presets |

---

## Pages overview

### Settings (`/settings`)

Three tabs:

- **Profile** — edit your sender details (`first_name`, `last_name`, `email`, `current_company`, `job_title`, `phone`, `website`, `bio`). These values are available in email templates via the `sender` variable source.
- **Documents** — upload PDF/DOC files to attach to outreach emails. Stored server-side, referenced by ID in templates or at send time.
- **Template Variables** — configure variable presets. Map a `{{key}}` once (e.g. `{{myName}}` → sender → `first_name`) and it auto-wires in every template.

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
2. Add a nav entry in `src/components/Sidebar.tsx` (the `NAV` array at the top)

All pages inside `(dashboard)/` automatically get the sidebar layout.

---

## Environment

`NEXT_PUBLIC_API_URL` is the only runtime env var. It is baked into the JS bundle at build time, so:

- **Docker**: set it as a build arg: `NEXT_PUBLIC_API_URL=https://api.example.com docker compose up --build`
- **Local dev**: prefix the command: `NEXT_PUBLIC_API_URL=http://localhost:3001 pnpm dev`
