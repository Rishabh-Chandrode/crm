# Frontend

Next.js 15 with App Router, React 19, Tailwind CSS v4. Strict TypeScript. No third-party data-fetching library — all backend calls go through a typed `api.*` client backed by native `fetch`. Includes a comprehensive design system with full Dark Theme support togglable from Settings and the Sidebar.

---

## Project layout

```
src/
├── middleware.ts                  # Edge middleware — redirects unauthenticated users
├── app/
│   ├── layout.tsx                 # Root HTML shell with zero-FOUC theme script & <ThemeProvider>
│   ├── page.tsx                   # Redirects / → /dashboard
│   ├── globals.css                # Tailwind directives + dark theme tokens + shared component classes
│   ├── login/page.tsx             # Login form — username/password + Google sign-in (dark/light themed)
│   ├── signup/page.tsx            # Signup form — username/password + Google sign-in (dark/light themed)
│   └── (dashboard)/               # Route group — shares sidebar layout
│       ├── layout.tsx             # Renders <Sidebar> + <main> container
│       ├── dashboard/page.tsx     # Stats overview + activity charts + recent sends
│       ├── companies/page.tsx     # Company CRUD (table + modal + merge)
│       ├── prospects/page.tsx     # Prospect list (table + filters + pagination)
│       ├── prospects/[id]/page.tsx# Prospect detail view — full profile + email history
│       ├── templates/page.tsx     # Template CRUD + variable manager
│       ├── send/page.tsx          # Multi-step send wizard & quick compose
│       ├── history/page.tsx       # Paginated email send log with open tracking
│       ├── scheduled/page.tsx     # Email schedule list + queue management + cancel
│       ├── applications/page.tsx  # Job application tracker — CRUD + status/search filters
│       ├── profile/page.tsx       # Full profile editor — personal, professional, preferences
│       ├── settings/page.tsx      # Appearance (Theme), Gmail connection, Documents, Variables
│       └── users/page.tsx         # Admin-only user management
├── components/
│   ├── Sidebar.tsx                # Left nav with user info, sign-out, & quick theme switcher
│   ├── ThemeProvider.tsx          # React Context Provider managing light, dark, and system theme
│   ├── Combobox.tsx               # Searchable combobox dropdown with full dark mode support
│   ├── DateTimePicker.tsx         # Interactive Antigravity calendar & precision time picker
│   └── ImportModal.tsx            # CSV/Excel bulk prospect import modal
└── lib/
    ├── types.ts                   # TypeScript interfaces mirroring backend types
    └── api.ts                     # Typed fetch wrapper — all backend calls go here
```

---

## Theme System & Dark Mode

The app supports a full dark theme with three selectable modes:
1. **Light** — Clean modern slate/indigo aesthetic.
2. **Dark** — High-contrast slate-950/slate-900 palette with indigo/purple glow accents.
3. **System** — Dynamically synchronizes with the user's OS preference (`prefers-color-scheme: dark`).

### Features:
- **Zero FOUC (Flash of Unstyled Content)**: An inline script in `src/app/layout.tsx` checks `localStorage.getItem('crm_theme')` (or system media query) and immediately applies `.dark` before first paint.
- **Togglable from Settings**: A dedicated **"Appearance"** tab in Settings allows choosing Light, Dark, or System with live preview cards.
- **Quick Switcher in Sidebar**: A theme switcher button in the sidebar footer allows one-click toggling.
- **Tailwind CSS v4 Integration**: Configured in `globals.css` using `@custom-variant dark (&:where(.dark, .dark *));`.

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

## Styling & Antigravity Design System

Tailwind CSS v4 with custom utility classes and Antigravity spatial glassmorphism tokens defined in `globals.css`:

```css
.form-label       /* <label> */
.form-input       /* <input> */
.form-select      /* <select> */
.form-textarea    /* <textarea> */
.card             /* Container styling with border and shadow */
.glass-card       /* Antigravity elevated 3D glass card with backdrop-blur and specular border */
.glass-panel      /* Frosted elevated surface container */
.glass-button     /* Interactive translucent button with hover-lift */
```

Animations & Keyframes:
- `@keyframes antigravity-float`: Subtle floating levitation for badges/elements
- `@keyframes antigravity-pulse-glow`: Ambient backdrop lighting pulsation
- Full `prefers-reduced-motion` accessibility support

---

## Automated Testing

Frontend uses **Vitest** with `jsdom` and **React Testing Library** for automated testing.

```bash
# Run frontend tests once
pnpm test

# Run frontend tests in watch mode
pnpm test:watch
```

Test suites live in `src/__tests__/`:
- `dashboard.test.tsx` — Dashboard UI rendering, Antigravity KPI float cards, loading skeleton state, and empty states
- `applications.test.tsx` — Applications tracker page, status summary card styling, and interactive status filters
- `prospects.test.tsx` — Prospects page listing, Combobox company and role category filter dropdowns
- `combobox.test.tsx` — Searchable dropdown opening, filtering, keyboard navigation, and option selection
- `dateTimePicker.test.tsx` — Antigravity date & time picker, calendar navigation, time stepper, and preset chips
- `sidebar.test.tsx` — Navigation links, route active state, admin role visibility, and sign-out flow
- `importModal.test.tsx` — Multi-step prospect file import, column auto-mapping, and bulk import execution
- `theme.test.tsx` — ThemeProvider context, localStorage persistence, `.dark` class application, matchMedia listener
- `api.test.ts` — Central API client (`src/lib/api.ts`), JWT cookie handling, header injection, 400 error field unwrapping
- `apiResources.test.ts` — CRUD resources and error handlers
- `middleware.test.ts` — Edge auth redirects
- `types.test.ts` — Utility functions (`prospectFullName`, `toVariableLabel`, `buildVariableFromKey`)
