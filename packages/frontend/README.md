# Frontend

Next.js 14 with App Router, React 18, Tailwind CSS. Strict TypeScript. No third-party data-fetching library — uses native `fetch` via a typed API client.

---

## Project layout

```
src/
├── middleware.ts              # Next.js edge middleware — redirects unauthenticated users
├── app/
│   ├── layout.tsx             # Root HTML shell, imports globals.css
│   ├── page.tsx               # Redirects / → /dashboard
│   ├── globals.css            # Tailwind directives + shared component classes
│   ├── login/
│   │   └── page.tsx           # Login form — sets crm_token cookie on success
│   └── (dashboard)/           # Route group — shares the sidebar layout
│       ├── layout.tsx         # Renders <Sidebar> + <main>
│       ├── dashboard/page.tsx # Stats overview + recent sends table
│       ├── companies/page.tsx # Company CRUD (table + modal form)
│       ├── prospects/page.tsx # Prospect CRUD (table + modal form)
│       ├── templates/page.tsx # Template CRUD + variable manager editor
│       ├── send/page.tsx      # 4-step send wizard
│       └── history/page.tsx   # Paginated email send log
├── components/
│   └── Sidebar.tsx            # Left nav — links + logout button
└── lib/
    ├── types.ts               # TypeScript interfaces mirroring backend types
    └── api.ts                 # Typed fetch wrapper — all backend calls go here
```

---

## Authentication flow

1. User visits any protected route → `middleware.ts` checks for `crm_token` cookie → redirects to `/login` if missing.
2. Login page calls `POST /api/auth/login` with the password.
3. On success, sets `document.cookie = 'crm_token=<password>; ...'` (7-day expiry).
4. All `api.*` calls in `lib/api.ts` read the cookie and send `Authorization: Bearer <token>`.
5. Logout: `Sidebar.tsx` clears the cookie via `max-age=0` and redirects to `/login`.

**To swap to real auth (e.g. JWT/OAuth):**
- `login/page.tsx` — change what gets stored in the cookie
- `lib/api.ts → getToken()` — change how the token is read
- `middleware.ts` — optionally add server-side token validation

---

## API client (`lib/api.ts`)

All backend calls go through `api.*` — never call `fetch` directly from pages.

```typescript
// Pattern for every resource:
api.companies.list()           // GET /api/companies
api.companies.create(body)     // POST /api/companies
api.companies.update(id, body) // PATCH /api/companies/:id
api.companies.delete(id)       // DELETE /api/companies/:id

api.prospects.list(companyId?) // optional filter
api.templates.detectVariables(id, existingVars)
api.email.preview(templateId, prospectId, customValues?)
api.email.send(templateId, prospectId, customValues?)
api.email.sendCompany(templateId, companyId, prospectIds?, customValues?)
api.email.history(limit, offset)
```

All methods return typed promises — the return types are inlined in `lib/api.ts`.

**To add a new resource:**
1. Add the interface to `lib/types.ts`
2. Add an entry to the `api` object in `lib/api.ts` following the existing pattern

---

## Shared types (`lib/types.ts`)

Mirrors backend `src/types/index.ts`. Keep both in sync when the schema changes.

Key exported items:

| Export | Purpose |
|---|---|
| `Company`, `Prospect`, `EmailTemplate`, `EmailSend` | Core data interfaces |
| `prospectFullName(p)` | Combines `first_name` + `last_name` into a display string |
| `PROSPECT_FIELDS` | Field options for the template variable mapper (prospect source) |
| `COMPANY_FIELDS` | Field options for the template variable mapper (company source) |

When a new prospect or company field is added to the DB:
1. Add it to the `Prospect` / `Company` interface
2. Add it to `PROSPECT_FIELDS` / `COMPANY_FIELDS` if it should be available as a template variable

---

## Styling

Tailwind CSS with no component library. Shared classes are defined as `@layer components` in `globals.css`:

```css
.form-label    /* <label> style */
.form-input    /* <input> and <select> style */
.form-textarea /* <textarea> style (extends form-input) */
```

Use these classes on form elements instead of repeating Tailwind utilities.

---

## Adding a new page

1. Create a folder under `src/app/(dashboard)/my-page/`
2. Add `page.tsx` — mark it `'use client'` if it needs state or effects
3. Add a nav entry in `src/components/Sidebar.tsx` (the `NAV` array)

All pages inside `(dashboard)/` automatically get the sidebar layout from `(dashboard)/layout.tsx`.

---

## Template variable manager

Lives inside `templates/page.tsx`. Each variable entry has:

| Field | UI control | Notes |
|---|---|---|
| `key` | Text input (monospace) | Used as `{{key}}` in the template body |
| `label` | Text input | Human-readable, shown to user |
| `source` | Dropdown | `prospect`, `company`, `static`, `custom` |
| `field` | Dropdown (dynamic) | Shown when source is `prospect` or `company` — options come from `PROSPECT_FIELDS` / `COMPANY_FIELDS` |
| `defaultValue` | Text input | Shown when source is `static` or `custom` |

**Auto-detect**: scans `subject + body` for `{{...}}` patterns and creates stub variables for any keys not already in the list.

---

## Send wizard (`send/page.tsx`)

Four steps:

1. **Select** — choose template and company; optionally filter which prospects to include
2. **Customize** — fill in `custom`-sourced variables; pick a prospect to preview
3. **Preview** — rendered subject + HTML body for the chosen prospect
4. **Result** — per-prospect send status summary

The wizard calls `api.email.sendCompany()` which sends to all selected prospects server-side, recording each attempt in `email_sends`.

---

## Environment

`NEXT_PUBLIC_API_URL` is the only runtime env var. It is baked into the JS bundle at build time by Next.js (because of the `NEXT_PUBLIC_` prefix), so:
- **Docker**: pass it as a build arg in the Dockerfile (`ARG NEXT_PUBLIC_API_URL`)
- **Local dev**: prefix the `next dev` command: `NEXT_PUBLIC_API_URL=http://localhost:3001 pnpm dev`
