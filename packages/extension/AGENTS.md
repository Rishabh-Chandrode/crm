# Extension Package — Agentic Coding Rules

These rules apply to all files within `packages/extension/`. They supplement the root `AGENTS.md` with extension-specific constraints.

---

## Tech Stack
- **Platform:** Chrome Extension, Manifest V3
- **Language:** TypeScript (compiled via esbuild)
- **Build:** `node build.mjs` (outputs to `dist/`)
- **UI:** Raw HTML + CSS (`popup.html`, `popup.css`) — no framework
- **API:** Direct `fetch()` calls to the backend (no shared API client library)

---

## Architecture

### Entry Points
| File                    | Manifest Entry          | Purpose                                               |
|-------------------------|-------------------------|-------------------------------------------------------|
| `src/popup.ts`          | Side panel UI           | Main CRM interface (rendered in `popup.html`)         |
| `src/contentScript.ts`  | Content script          | LinkedIn profile scraper (runs on `linkedin.com/in/*`) |
| `src/background.ts`     | Service worker          | Side panel opener, message routing                    |
| `src/authCapture.ts`    | Content script          | Captures auth token from the CRM frontend page        |
| `src/formFiller/`       | Imported by popup.ts    | Auto-fills job application forms                      |

### Build Process
- TypeScript source lives in `src/`. esbuild compiles to `dist/`.
- **NEVER edit files in `dist/` directly.** They are overwritten on every build.
- After ANY TypeScript change, run `pnpm build` (or the watch process `pnpm dev`) to recompile.
- After rebuilding, reload the extension in `chrome://extensions` to see changes.

---

## Rules (ENFORCED)

### Manifest
- `manifest.json` is the source of truth for permissions, content scripts, and service worker registration.
- When adding a new content script or background handler, it MUST be registered here.
- When adding a new host permission, add it to `host_permissions`.
- **Never request more permissions than necessary.** Each permission must be justified.

### Messaging (Chrome Runtime)
- All inter-context communication (popup ↔ content script ↔ background) uses `chrome.runtime.sendMessage()` and `chrome.runtime.onMessage`.
- All message types MUST be defined as TypeScript interfaces in `src/types.ts`.
- Messages use an `action` discriminator field (e.g., `{ action: 'scraped', ... }`).
- When adding a new message type:
  1. Add the interface to `src/types.ts`
  2. Add the handler in the receiving script
  3. Update `packages/extension/README.md`

### Types
- `src/types.ts` defines extension-specific types AND mirrors relevant backend types (e.g., `TemplateVariable`, `UserProfile`).
- When backend types change, this file MUST be updated to stay in sync.
- Extension types may have **camelCase** field names (e.g., `firstName` vs. backend's `first_name`) where the extension deals with scraped DOM data. Conversion happens at the API boundary.

### API Calls
- The extension calls the backend directly via `fetch()`. There is no shared API client.
- The backend URL comes from `chrome.storage.local` (set by the user in settings).
- Auth token is stored in `chrome.storage.local` and sent as `Authorization: Bearer <token>`.
- All `fetch()` calls must have error handling (try/catch + response status checks).

### UI (`popup.html` + `popup.css` + `popup.ts`)
- The popup UI is a single-page application built with raw DOM manipulation in `popup.ts`.
- Tabs, modals, and dynamic content are all managed via `classList.toggle`, `innerHTML`, and event listeners.
- **`popup.ts` is large (~65KB).** When modifying it, be precise about which section you are editing. Search for the relevant function before making changes.
- Styles are in `popup.css`. Follow the existing class naming patterns.

---

## File Reference

| File/Directory          | Purpose                                               | When to modify                                      |
|-------------------------|-------------------------------------------------------|-----------------------------------------------------|
| `manifest.json`         | Extension configuration & permissions                 | Adding permissions, scripts, or host patterns       |
| `src/popup.ts`          | Side panel UI logic (large file)                      | Changing the CRM panel UI                           |
| `src/contentScript.ts`  | LinkedIn profile scraper                              | Changing what data is scraped from LinkedIn         |
| `src/background.ts`     | Service worker (side panel + message routing)          | Changing background behavior or message handling    |
| `src/authCapture.ts`    | Auth token capture from CRM frontend                  | Changing how auth is captured                       |
| `src/types.ts`          | TypeScript interfaces for extension                   | Adding new message types or data shapes             |
| `src/formFiller/`       | Auto-fill engine for job application forms             | Adding new platforms or changing fill logic          |
| `popup.html`            | Side panel HTML structure                             | Adding new UI sections or tabs                      |
| `popup.css`             | Side panel styles                                     | Changing visual appearance                          |
| `build.mjs`             | esbuild configuration                                 | Changing build targets or adding entry points       |
| `src/__tests__/*.ts`    | Vitest extension test suites                          | Adding/modifying unit tests for extension logic     |

---

## Mandatory Automated Testing (HARD RULE)

1. **Every extension module, scraper, message handler, and autofill detector MUST have tests:**
   - Place tests in `src/__tests__/<module>.test.ts`.
   - Test scraping heuristics, selector extraction, regex patterns, message format contracts, and form-filler input classification.
   - Use `jsdom` to construct mock DOM fixtures for scrapers and form detection.
2. **Execution requirement:**
   - Run `pnpm --filter @crm/extension test` and verify 100% tests pass with 0 errors.

---

## Mandatory Post-Change Verification

After making any extension change, the agent MUST:
1. Write/update automated tests in `src/__tests__/`.
2. Run `pnpm --filter @crm/extension test` and verify all tests pass.
3. Run `pnpm build` and verify it completes without errors.
4. Remind the user to reload the extension in `chrome://extensions`.
5. If a new permission was added, note that the user may need to re-authorize the extension.
6. Update `README.md` in this directory if any of the following changed: manifest, message types, content scripts, UI sections.
