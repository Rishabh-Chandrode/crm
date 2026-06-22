# Chrome Extension

Manifest V3 Chrome side panel extension. Scrapes contact info from LinkedIn profile pages, detects existing CRM prospects, adds new prospects to the CRM, and autofills job application forms using your stored profile.

---

## What it does

- **CRM match card** — when you open the side panel on any `linkedin.com/in/*` page, the extension immediately looks up the profile in your CRM by LinkedIn URL. If a match is found, a green card is shown above the form with the stored details. The card updates automatically as you switch tabs.
- **LinkedIn scraper** — click **Scrape LinkedIn** from any LinkedIn profile tab. The background service worker finds the active LinkedIn tab, injects the content script, which scrolls the page to lazy-load the experience section and extracts name, job title, company, and LinkedIn URL.
- **Quick-add to CRM** — review the extracted (or manually entered) data and save it as a new prospect via `POST /api/prospects/quick-add`.
- **Form autofiller** — click **Autofill This Page** to fill any job application form (Greenhouse, Lever, Workday, Google Forms, or generic) with your CRM profile data. Optionally select a resume from the picker to attach it to file upload inputs. After you submit the form, the extension auto-records the application in the CRM dashboard.
- **Compose email** — select a template and send an email to a prospect without leaving the side panel.
- **JWT auth** — authenticates via the CRM backend and stores the token in `chrome.storage.sync`. A login gate shows automatically when the token is missing or expired.

> **Note:** Google sign-in is only available from the main web app (`/login`). The extension uses username + password login.

---

## Project layout

```
extension/
├── manifest.json                   # MV3 manifest — permissions, side_panel, host_permissions
├── popup.html                      # Side panel UI
├── popup.css                       # Side panel styles
├── src/
│   ├── popup.ts                    # Main logic — auth gate, tabs, API calls, match card, autofill
│   ├── contentScript.ts            # Injected into linkedin.com/in/* — incremental scroll + scrape
│   ├── background.ts               # Service worker — tab queries, scrape trigger, tab URL events
│   ├── types.ts                    # Shared TypeScript interfaces
│   └── formFiller/                 # Form autofill subsystem
│       ├── index.ts                # Orchestrator — platform detection, field loop, resume injection
│       ├── detector.ts             # Generic field detection by label/name/id heuristics
│       ├── filler.ts               # Low-level fill helpers: text, select, iti phone, resume file
│       ├── types.ts                # FieldType enum, SelectorMap, UserProfile, FillResult
│       └── platforms/              # Per-platform selector maps and custom fill functions
│           ├── generic.ts          # CSS selectors for common job-board patterns
│           ├── greenhouse.ts       # Greenhouse-specific custom fill logic
│           ├── lever.ts            # Lever selector map
│           ├── workday.ts          # Workday selector map
│           └── google-forms.ts     # Google Forms custom fill logic
└── dist/                           # Compiled JS output (gitignored)
```

---

## Authentication

1. Panel loads → checks `chrome.storage.sync` for `auth: { token, username, role }`.
2. If token found → `GET /api/auth/me` to verify it is still valid.
3. Valid → show main shell + check active tab. Invalid / missing → show login gate.
4. Login form calls `POST /api/auth/login` → stores `auth` in `chrome.storage.sync`.
5. Any API response with status `401` clears stored auth and shows the login gate.

---

## CRM match card

On every tab switch or panel open, the background sends the active tab URL to the side panel. If the URL matches `linkedin.com/in/*`, the panel calls:

```
GET /api/prospects/lookup?linkedin_url=<url>
```

If a prospect is found, a green **Already in CRM** card appears above the form showing name, job title, company, and email, with a **View →** link to the prospects list. The card hides when you navigate away from a LinkedIn profile or the profile is not in the CRM.

---

## Form autofill flow

1. User clicks **Autofill This Page** in the side panel.
2. If a resume is selected in the picker, the popup downloads it from `GET /api/documents/:id/download` and converts it to base64.
3. Profile and resume data are stored in `chrome.storage.local` under `autofillProfile` and `autofillResume`.
4. `chrome.scripting.executeScript` injects `dist/formFiller/index.js` into the active tab (all frames).
5. The form filler detects the platform (Greenhouse, Lever, Workday, Google Forms, or Generic) by hostname/path and picks the matching strategy.
6. For each recognized field type, it locates the input and calls the appropriate fill helper:
   - **Text / textarea** — native value setter + `input`/`change`/`blur` events (works with React, Angular, Vue).
   - **Select** — exact then fuzzy text match against `<option>` elements.
   - **intl-tel-input phone** — injects a `<script>` tag into the page's JS context to call `iti.setNumber(fullIntlNumber)` via Angular's `$timeout` before firing DOM events, ensuring the country flag stays on India (or whatever `phone_country_code` stores).
   - **Resume file input** — constructs a `File` object from base64 data, sets `input.files` via `DataTransfer`, fires `change` + `input`.
7. Results (filled/skipped field list, platform name) are sent back to the side panel via `chrome.runtime.sendMessage({ action: 'autofillResult', ... })`.
8. When the form is submitted, a `submit` or button-click listener fires `{ action: 'applicationSubmitted', company_name, job_title, job_url, platform }` to the side panel, which auto-POSTs to `POST /api/applications`.

---

## Scraping flow

1. Click **Scrape LinkedIn** in the side panel.
2. Side panel sends `{ action: 'triggerScrape' }` to the background service worker.
3. Background queries all active tabs (`chrome.tabs.query({ active: true })`), finds the LinkedIn tab, and injects `dist/contentScript.js`.
4. Content script scrolls the page incrementally (one viewport at a time with 400 ms pauses) to trigger LinkedIn's lazy loading until the experience section appears.
5. Extracts name, job title, company, and LinkedIn URL, then sends `{ action: 'scraped', ... }` to the background.
6. Background forwards the message to the side panel, which fills the form fields.

> Tab queries from the side panel are unreliable — that's why all tab operations go through the background service worker.

---

## Building

```bash
cd packages/extension
pnpm install
pnpm build        # compiles src/*.ts → dist/
```

For development with hot rebuild:

```bash
pnpm dev          # watches src/ and recompiles on change
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `packages/extension/` folder (not `dist/`)

After any rebuild, click the refresh icon on the extension card in `chrome://extensions`.

---

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Grants temporary access to the active tab when the extension action is triggered |
| `tabs` | Read tab URLs across all tabs (needed by background to find the LinkedIn tab) |
| `scripting` | Inject `contentScript.js` and `formFiller/index.js` into tabs |
| `storage` | Persist auth token, profile cache, and resume data |
| `sidePanel` | Register the extension as a Chrome side panel |
| `clipboardRead` | Paste email from clipboard with the Paste button |
| host: `localhost` | Talk to the local backend API |
| host: `linkedin.com` | Inject scripts into LinkedIn profile pages |

---

## Connecting to the backend

The backend URL is baked in at build time via the `BACKEND_URL` env var in `build.mjs`. Default: `http://localhost:3001`. To point at a different backend, set `BACKEND_URL` before building and update `host_permissions` in `manifest.json` accordingly.
