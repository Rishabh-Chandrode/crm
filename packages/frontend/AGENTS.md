# Frontend Package — Agentic Coding Rules

These rules apply to all files within `packages/frontend/`. They supplement the root `AGENTS.md` with frontend-specific constraints.

---

## Tech Stack
- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript (strict mode)
- **UI Library:** React 19
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/postcss`)
- **State:** No global state library — uses React hooks + fetch
- **API Client:** `src/lib/api.ts` (centralized fetch wrapper with JWT auth)
- **Auth:** Cookie-based JWT (`crm_token`) with Next.js middleware for route protection

---

## Architecture Rules

### App Router Conventions
- Pages live under `src/app/`. The `(dashboard)` route group wraps all authenticated pages with a shared layout + sidebar.
- Each page directory contains a `page.tsx` file. Use `layout.tsx` only for shared wrappers.
- Auth pages (`/login`, `/signup`) are OUTSIDE the `(dashboard)` group and are not protected by middleware.

### Component Rules
1. **Reusable components** go in `src/components/`. Page-specific UI stays inline in the page file.
2. **No component libraries** are installed — all UI is custom-built. Do not add shadcn/ui, MUI, Chakra, etc. without explicit user approval.
3. **Use Tailwind CSS v4 classes** for all styling. Do not use inline `style={}` attributes unless absolutely necessary for dynamic values.
4. **All components must be client components** (`'use client'`) if they use hooks, event handlers, or browser APIs. Server components are the default.

### API Client Rules
- ALL backend API calls MUST go through `src/lib/api.ts`. NEVER call `fetch()` directly in components.
- When adding a new backend endpoint, add a corresponding function to the `api` object in `api.ts`.
- The API client automatically handles JWT token injection and error formatting.

### Type System Rules
- All shared data types are in `src/lib/types.ts`.
- This file mirrors `packages/backend/src/types/index.ts`. When the backend types change, this file MUST be updated to match.
- Frontend types may have additional fields not present in the backend (e.g., `has_gmail_configured`) — these are derived fields returned by specific API endpoints.

### Routing & Auth
- Route protection is handled by `src/middleware.ts`. It checks for `crm_token` cookie.
- Public paths are hardcoded in `middleware.ts` (`/login`, `/signup`). If you add a new public route, add it to `PUBLIC_PATHS`.
- After login, users are redirected to `/dashboard`.

---

## File Reference

| File/Directory                        | Purpose                                            | When to modify                                  |
|---------------------------------------|----------------------------------------------------|-------------------------------------------------|
| `src/app/layout.tsx`                  | Root layout (html, body, fonts)                    | Changing global layout or metadata              |
| `src/app/globals.css`                 | Global CSS + Tailwind imports                      | Adding global styles                            |
| `src/app/(dashboard)/layout.tsx`      | Dashboard layout (sidebar wrapper)                 | Changing dashboard shell                        |
| `src/app/(dashboard)/*/page.tsx`      | Individual dashboard pages                         | Adding/modifying features                       |
| `src/app/login/page.tsx`              | Login page                                         | Changing login flow                             |
| `src/app/signup/page.tsx`             | Signup page                                        | Changing signup flow                            |
| `src/components/Sidebar.tsx`          | Navigation sidebar                                 | Adding new nav links                            |
| `src/components/ImportModal.tsx`      | CSV import modal                                   | Changing import flow                            |
| `src/components/Combobox.tsx`         | Reusable combobox/autocomplete                     | Changing select/search UI                       |
| `src/lib/api.ts`                      | Centralized API client                             | Adding/modifying backend API calls              |
| `src/lib/types.ts`                    | Shared TypeScript interfaces                       | When backend types change                       |
| `src/middleware.ts`                   | Next.js middleware for auth redirect               | Adding/removing public routes                   |
| `src/__tests__/*.ts`                  | Vitest frontend test suites                        | Adding/modifying tests for frontend code        |

---

## Mandatory Automated Testing (HARD RULE)

1. **Every frontend feature, API method, and component logic MUST have tests:**
   - Place unit and integration tests in `src/__tests__/<feature>.test.ts`.
   - Test API client methods in `src/lib/api.ts` (mock fetch, header injection, JWT token parsing from `document.cookie`, error unwrapping).
   - Test Next.js `middleware.ts` route protection, public path redirects, and session cookie validation.
   - Test UI utility functions and components with React Testing Library / JSDOM.
2. **Execution requirement:**
   - Run `pnpm --filter @crm/frontend test` and confirm 100% tests pass with 0 errors.

---

## Mandatory Post-Change Verification

After making any frontend change, the agent MUST:
1. Write/update automated tests in `src/__tests__/`.
2. Run `pnpm --filter @crm/frontend test` and verify all tests pass.
3. Verify the dev server (`pnpm dev`) shows no compile errors.
4. If a new page was added, confirm it appears correctly in the browser.
5. If a new API call was added, confirm the corresponding backend endpoint exists and is mounted.
6. Update `README.md` in this directory if any of the following changed: pages, components, API client methods, routing.
