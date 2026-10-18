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
│       ├── dashboard/page.tsx     # Priority Action Center. Features responsive 2-column grid action buttons on small screens, an explicit ✕ Ineligible button for saved/AI-synced opportunities, corner dismiss controls, error recovery view with retry button, and automatic telemetry ingestion via api.logs.ingest. Dismissals are stored on the server; handles ready-to-apply, referral-sent, saved-jobs, active-interviews, failed-sends, and manual prospect entry items.
│       ├── companies/page.tsx     # Company CRUD (table + modal + merge)
│       ├── prospects/page.tsx     # Prospect list (table + filters + gender badge + pagination). Supports ?new=true query parameters to prefill and open create modal, auto-dismissing pending prospects upon save.
│       ├── prospects/[id]/page.tsx# Prospect detail view — full profile with gender + email history
│       ├── templates/page.tsx     # One card per template (latest version). Auto-detect reads the subject and body currently in the editor. Attachment badges count only documents that still exist
│       ├── send/page.tsx          # Template and version dropdowns; All selects every prospect. Quick Email fields shrink inside the card on narrow screens.
│       ├── history/page.tsx       # Paginated email send log with open tracking
│       ├── scheduled/page.tsx     # Email schedule list + queue management + cancel
│       ├── jobs/page.tsx          # Redirects /jobs → /applications
│       ├── share/page.tsx         # Receives an Android share-target link, offers company and role chips, and saves an application. For LinkedIn profiles, tries Prospeo then Apollo; if neither gives an email, routes to manual entry in Priority Action Center without placeholder emails.
│       ├── applications/page.tsx  # Unified Job applications & referral outreach tracker — pipeline + stages + referral outreach across active and terminal statuses (including ineligible, closed, and rejected), email job sync, and fit scoring linked to profile job preferences
│       ├── profile/page.tsx       # Profile editor — personal, job preferences (target roles, tech skills, locations, remote toggle, compensation, and criteria used for email job sync & scoring), work, education, documents, projects, skills. A typed target role becomes a chip on Enter, Add role, or leaving the field.
│       ├── settings/page.tsx      # Appearance (Theme), Gmail connection, template variables, and Web Push notifications for scheduled email failures & expired authorizations
│       ├── users/page.tsx         # Admin-only user management
│       ├── logs/page.tsx          # Admin-only system logs & observability (telemetry, Gemini LLM API request & response payload inspector, latency metrics, query badges, source filters, stack traces, 30-day retention pruning)
│       └── ai-settings/page.tsx   # Admin-only AI & LLM configuration — master toggle, provider selector, model selector, API key management, hyperparameters, and live diagnostics
├── components/
│   ├── Sidebar.tsx                # Left nav with user info, sign-out, and theme switcher. The mobile close control sits beside the theme switcher.
│   ├── ServiceWorkerRegister.tsx  # Registers /sw.js so the site can be installed
│   ├── PushNotificationCard.tsx   # Reusable device push notification subscription and test alert card (with Brave push messaging guidance)
│   ├── ThemeProvider.tsx          # React Context Provider managing light, dark, and system theme
│   ├── Combobox.tsx               # Searchable combobox. The closed label truncates instead of widening the field.
│   ├── CompanyAutocomplete.tsx   # Autocomplete combobox with existing/new company live indicators
│   ├── DateTimePicker.tsx         # Interactive Antigravity calendar & precision time picker
│   ├── ImportModal.tsx            # CSV/Excel bulk prospect import modal
│   └── DiscoverProspectsModal.tsx # Prospeo & Apollo decision maker discovery & bulk import modal
└── lib/
    ├── types.ts                   # TypeScript interfaces mirroring backend types
    ├── api.ts                     # Typed fetch wrapper — all backend calls go here
    ├── applications.ts            # Application & referral availability helpers (canAskReferral)
    └── shareTarget.ts             # Shared-link parsing, job URL inference, company chip options, safe login return paths

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

### Install and Android share

The Vercel site can be installed from Brave or Chrome on Android (**Install app** in the browser menu). Install needs the web manifest (`src/app/manifest.ts`), the 192 and 512 icons in `public/`, and `public/sw.js`. `/manifest.webmanifest` and `/sw.js` stay public so the browser can read them before login. The service worker (`sw.js`) also handles background Push Notifications (displaying native alerts with vibration and opening targeted action pages: `/settings?tab=gmail` for reconnecting expired tokens, or `/scheduled` to review and retry failed schedules).

After install, sharing a link on Android lists Outreach CRM. The share opens `/share` with `title`, `text`, and `url`. The page takes the first `http` link from `url`, then from `text`. A LinkedIn profile (`/in/{slug}` or `/pub/{slug}`) automatically checks `api.prospects.lookup` to display whether the profile is already in your CRM (with links to view or send email) or pending in your Priority Action Center. Clicking **Add prospect** saves through `api.prospects.fromLinkedIn`, which enriches via Prospeo then Apollo. If an email is found, creates a prospect; if neither provider finds an email, creates a `pending_prospects` entry and prompts manual entry without saving dummy emails. When opening manual entry, the company is automatically preserved and created, and the company selector allows adding new companies on the fly. Other links, including LinkedIn job posts, infer company and platform from the host and save through `api.applications.create`. **Send email** opens `/send` with that new job already selected as the linked job opportunity. Company chips come from that link and title (`companyOptionsFromShare`). Role chips are the signed-in user's `target_roles`, edited on Profile → Job Search. Company chips also include a left-hand hostname label, so `travclan.turbohire.co` offers Travclan and Turbohire. Editing the URL switches between the profile and job forms. A signed-out share goes to `/login?next=` and returns to that same `/share` URL after sign-in. iPhone share sheets do not list websites.

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
api.prospects.fromLinkedIn({ linkedin_url }) // POST /api/prospects/from-linkedin
api.prospects.lookup({ linkedin_url?, email? }) // GET /api/prospects/lookup

// Jobs & Referral Outreach
api.jobs.list(filters?)           // GET /api/jobs — search, status, companyId, limit, offset
api.jobs.get(id)                  // GET /api/jobs/:id
api.jobs.create(body)             // POST /api/jobs — title, job_url, company_id, company_name, status, notes
api.jobs.update(id, body)         // PATCH /api/jobs/:id
api.jobs.delete(id)               // DELETE /api/jobs/:id
api.jobs.getEmails(id)            // GET /api/jobs/:id/emails — outreach history

// Email
api.email.preview(templateId, prospectId, customValues?)
api.email.send(templateId, prospectId, customValues?, documentIds?, jobId?)
api.email.sendCompany(templateId, companyId, prospectIds?, customValues?, documentIds?, jobId?)
api.email.sendBatch(templateId, prospectIds, customValues?, documentIds?, jobId?)
api.email.quickSend(email, subject, body, documentIds?, jobId?)
api.email.history(limit, offset, filters?)
api.email.retry(id)

// Schedules, Documents, Variable Presets, Stats, Import
api.schedules.list() / .create() / .get(id) / .cancel(id) / .quick()
api.documents.list() / .upload(file, name) / .fromDrive(name, url) / .sync(id) / .delete(id) / .download(id)
api.documents.dailySync.get() / .set(enabled)   // Profile → Documents daily Drive refetch
api.variablePresets.list() / .create() / .update() / .delete()
api.stats.get()
api.import.parse(file)
api.import.prospects(body)

// Job Applications & Opportunities
api.applications.list(filters?)       // GET  /api/applications — status, search, job_id, min_match_score, limit, offset
api.applications.syncEmails()         // POST /api/applications/sync-emails — scans Gmail for jobs & status updates
api.applications.getPreferences()     // GET  /api/applications/preferences — candidate roles, skills, criteria
api.applications.updatePreferences(p) // PUT  /api/applications/preferences — updates candidate criteria
api.applications.create(body)         // POST /api/applications
api.applications.update(id, body)     // PATCH /api/applications/:id
api.applications.delete(id)           // DELETE /api/applications/:id
api.applications.getEmails(id)        // GET  /api/applications/:id/emails — outreach history

// System Logs & Telemetry (Admin only)
api.logs.list(filters?)               // GET  /api/logs — level, source, search, startDate, endDate, page, limit
api.logs.stats()                      // GET  /api/logs/stats — errors, warnings, 24h count
api.logs.clear(beforeDate?)           // DELETE /api/logs — purges all logs or before date
api.logs.prune(days?)                 // POST /api/logs/prune — manual trigger for retention pruning

// Web Push Notifications
api.notifications.getVapidKey()       // GET  /api/notifications/vapid-key
api.notifications.subscribe(payload)  // POST /api/notifications/subscribe
api.notifications.unsubscribe(payload)// POST /api/notifications/unsubscribe
api.notifications.test()              // POST /api/notifications/test
```

---

## Shared types (`lib/types.ts`)

Mirrors backend `src/types/index.ts`. Keep both in sync when the schema changes.

Key exports:

| Export | Purpose |
|---|---|
| `CrmUser` | User account with full profile, `has_gmail_configured` flag |
| `Company`, `Prospect`, `EmailTemplate`, `EmailSend`, `EmailSchedule` | Core data interfaces |
| `JobApplication` | Job application record (`company_name`, `job_title`, `job_url`, `platform`, `status`, `applied_at`, `match_score`, `match_reasons`, `missing_skills`) |
| `CandidatePreferences` | Candidate target roles, skills, experience range, location, and remote preferences |
| `JobEmailSyncResult` | Counts for discovered, updated, scanned, and skipped job emails |
| `PushSubscriptionKeys`, `PushNotificationPayload` | Web Push subscription credentials and mobile notification payload contracts |
| `VariableSource` | `'prospect' \| 'company' \| 'sender' \| 'static' \| 'custom'` |
| `TemplateVariable`, `VariablePreset` | Template variable types |
| `PROSPECT_FIELDS` | Field options for the variable mapper (prospect source) |
| `COMPANY_FIELDS` | Field options for the variable mapper (company source) |
| `SENDER_FIELDS` | Field options for the variable mapper (sender/profile source) |
| `prospectFullName(p)` | Combines `first_name` + `last_name` |
| `getGmailSearchUrl(query)` | Constructs direct `#all/<threadId>` or targeted search URL for Gmail |
| `buildVariableFromKey(key, presets)` | Resolves a key against saved presets |

---

## Styling & Design System (Apple / Twitter / shadcn/ui Aesthetic)

Tailwind CSS v4 with custom tokens and clean monochrome typography defined in `globals.css`:

```css
.form-label       /* Clean label with tight typography */
.form-input       /* Crisp input with zinc focus ring */
.form-select      /* Minimalist dropdown select */
.form-textarea    /* Textarea with subtle zinc borders */
.card             /* Crisp white / dark zinc container with subtle borders and micro-shadow */
.segmented-control/* iOS / macOS / Twitter style segmented tab pill container */
.segmented-item   /* Segmented toggle button with active pill transition */
.btn-primary      /* Crisp black/white high-contrast action button */
.btn-secondary    /* Clean subtle outline button */
.btn-ghost        /* Borderless hover-subtle interactive button */
.btn-destructive  /* Destructive action button with soft red accent */
```

### Aesthetic Principles:
- **Monochrome & High Contrast**: Neutral zinc tokens (`zinc-50` through `zinc-950`), removing artificial neon glowing effects in favor of clean Apple and shadcn/ui styling.
- **Micro-Interactions**: Smooth 150ms transitions, subtle scale shifts on press, and crisp focus rings (`ring-1 ring-zinc-900 dark:ring-zinc-100`).
- **Semantic Status Badges**: Refined status pills (`emerald`, `amber`, `blue`, `rose`, `zinc`) with 10% opacity tints and 20% opacity borders.
- **Full Theme Support**: Zero-FOUC theme hydration with light, dark, and system synchronization.

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
- `dashboard.test.tsx` — Priority Action Center rendering, filters, server dismissals, one-time localStorage upload, loading skeletons, empty states, error fallback rendering, and retry handling
- `applications.test.tsx` — Applications tracker page, status summary cards, interactive status filters, full application editing modal, manual application creation, and referral outreach email history modal with Send History and Gmail navigation
- `history.test.tsx` — Email history log viewer, status filter pills, search query parameter support, Open in Gmail integration, and delivery retry
- `jobs.test.tsx` — Jobs & referral outreach tracker, KPI summary cards, status filters, create/edit modals, and email history drawer
- `prospects.test.tsx` — Prospects page listing, Combobox company and role category filter dropdowns
- `combobox.test.tsx` — Searchable dropdown opening, filtering, keyboard navigation, and option selection
- `dateTimePicker.test.tsx` — Apple calendar navigation, time stepper, and preset chips
- `sidebar.test.tsx` — Navigation links, route active state, admin role visibility, and sign-out flow
- `importModal.test.tsx` — Multi-step prospect file import, column auto-mapping, and bulk import execution
- `theme.test.tsx` — ThemeProvider context, localStorage persistence, `.dark` class application, matchMedia listener
- `api.test.ts` — Central API client (`src/lib/api.ts`), JWT cookie handling, header injection, 400 error field unwrapping
- `apiResources.test.ts` — CRUD resources and error handlers
- `middleware.test.ts` — Edge auth redirects, public manifest and service worker, share login return path
- `shareTarget.test.ts` — Shared link resolution, job URL inference, company chip options, and safe post-login paths
- `share.test.tsx` — Share page prefill, company and role chips, application save, and LinkedIn profile prospect save
- `types.test.ts` — Utility functions (`prospectFullName`, `getGmailSearchUrl`, `toVariableLabel`, `buildVariableFromKey`)
- `aiSettings.test.tsx` — Admin-only AI & LLM settings page, master enable toggle, provider selector, model architecture chips, credentials management, and live diagnostics

