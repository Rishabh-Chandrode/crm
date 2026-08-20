---
name: debug
description: >-
  Use this skill when the user reports a bug, error, or unexpected behavior in the CRM.
  This provides a structured debugging workflow that traces issues across the monorepo stack:
  frontend UI → API client → backend route → service → database.
  Activate when the user says things like "X is broken", "this doesn't work", "I'm getting an error",
  "why is Y happening", etc.
---

# Cross-Stack Debugging Workflow

When debugging an issue in this monorepo, follow this structured approach.
The CRM has a clear request flow — trace it layer by layer.

---

## Request Flow (trace in this order)

```
User Action → Frontend UI (page.tsx)
  → API Client (lib/api.ts)
    → Backend Route (routes/*.ts)
      → Service (services/*.ts)
        → Database (pool.query)
          → PostgreSQL
```

For response issues, trace in reverse.

---

## Step 1: Reproduce & Locate

1. **Get the exact error.** Ask the user for:
   - The error message (browser console, terminal, or UI)
   - What action triggered it
   - Which page/feature it affects

2. **Identify the layer.** Use these heuristics:
   - Browser console error → Frontend issue
   - Network tab shows 4xx/5xx → Backend issue (check response body)
   - Network tab shows no request → Frontend issue (API client not called)
   - Backend terminal shows SQL error → Database layer
   - Backend terminal shows "Cannot read property..." → Service/route logic error

---

## Step 2: Check the Running Servers

Both dev servers are typically running. Check their terminal output FIRST:

- **Backend** (`packages/backend/`, `pnpm dev`): Look for TypeScript compile errors or runtime exceptions
- **Frontend** (`packages/frontend/`, `pnpm dev`): Look for Next.js compile errors or hydration warnings

---

## Step 3: Trace the Code Path

Once you've identified the layer, trace the specific code path:

### Frontend Issues
1. Find the page: `packages/frontend/src/app/(dashboard)/<feature>/page.tsx`
2. Find the API call: search for `api.<resource>.<method>` in the page
3. Find the API client method: `packages/frontend/src/lib/api.ts`
4. Check the endpoint URL and HTTP method match the backend route

### Backend Issues
1. Find the route: `packages/backend/src/routes/<resource>.ts`
2. Check route registration: `packages/backend/src/routes/index.ts`
3. Find the service call (if any): `packages/backend/src/services/<resource>.ts`
4. Check the SQL query and parameters

### Extension Issues
1. Check `pnpm build` output for compile errors
2. Check Chrome DevTools → Extensions → Service Worker console
3. Check if the backend URL in `chrome.storage.local` is correct
4. Verify auth token is present and not expired

---

## Step 4: Common Root Causes (check these first)

| Symptom                                 | Likely Cause                                                    |
|-----------------------------------------|-----------------------------------------------------------------|
| 404 on API call                         | Route not registered in `routes/index.ts`                       |
| 401 Unauthorized                        | Missing/expired JWT, or `authMiddleware` not applied            |
| Empty data returned                     | `owner_id` filter — `ownerFilter` middleware or WHERE clause    |
| Type mismatch / undefined field         | Type Trinity out of sync between packages                       |
| "Cannot read property of undefined"     | Missing null check on optional DB result                        |
| CORS error                              | Backend CORS config in `src/index.ts`                           |
| Extension not reflecting changes        | Forgot to run `pnpm build` or reload in chrome://extensions     |
| Frontend shows stale data               | Missing state refresh after mutation (no `useEffect` re-fetch)  |
| SQL syntax error                        | Check for missing commas, wrong column names in migrate.ts      |
| "relation does not exist"               | Migration hasn't run — restart backend to trigger migrate.ts    |

---

## Step 5: Fix & Automated Verification (Zero Manual Testing)

1. Make the minimal fix.
2. **Write a regression test** in the affected package's `src/__tests__/` reproducing the bug condition to ensure it never recurs.
3. Run `pnpm test` (or the affected package's test script: `pnpm --filter @crm/<pkg> test`). Confirm ALL tests pass with 0 errors.
4. Check the dev server terminals for compile errors.
5. If extension was changed: `pnpm build`.
6. Run through the sync checklist if the fix involved types or API shapes.

### Step 5.1: Mandatory Pre-Commit Execution (HARD RULE)
**Never rely on the user to run pre-commit or paste hook errors into chat.**
1. Stage all fixed files and test files: `git add <files...>`.
2. Run `node scripts/pre-commit.mjs`.
3. If it fails, inspect the error output, fix the issue immediately, re-stage, and re-run until all checks pass (`✅ All pre-commit checks PASSED successfully!`).

---

## Anti-Patterns

- **DO NOT** guess at the fix without reading the error first
- **DO NOT** add try/catch that silently swallows errors — log them
- **DO NOT** fix symptoms (e.g., adding `|| []` fallback) without understanding root cause
- **DO NOT** edit `dist/` files in the extension
- **DO NOT** end the turn without running and passing `node scripts/pre-commit.mjs`

