# Frontend API & Types — Agentic Coding Rules

These rules apply to all files within `packages/frontend/src/lib/`.

---

## `api.ts` — Centralized API Client

### Rules (ENFORCED)
1. **ALL backend calls go through this file.** No component may call `fetch()` directly.
2. The `request<T>()` helper handles JWT token injection, JSON parsing, and error formatting. Use it for all API calls.
3. **API methods are organized by resource domain** (e.g., `api.companies.list()`, `api.email.send()`). Follow this pattern when adding new methods.
4. **Type every response.** Use `import('./types')` inline types or reference interfaces from `types.ts`. Never use `any`.
5. When the backend adds a new endpoint, add the corresponding method here in the same change.

### For file uploads (FormData):
- Use raw `fetch()` with manual token injection (see `api.documents.upload` and `api.import.parse` for the pattern).
- Do NOT set `Content-Type` header manually — let the browser set it with the boundary.

---

## `types.ts` — Shared Type Definitions

### Rules (ENFORCED)
1. This file MUST mirror `packages/backend/src/types/index.ts` for all shared entities.
2. Frontend types may include **additional fields** returned by specific API endpoints (e.g., `has_gmail_configured` on `CrmUser`) — these are acceptable divergences.
3. **Date types differ:** Backend uses `Date`, frontend uses `string` (since JSON serialization converts dates to ISO strings). This is expected.
4. When adding or modifying a shared interface, update BOTH `backend/src/types/index.ts` AND this file.
5. Utility functions like `prospectFullName()`, `toVariableLabel()`, and `buildVariableFromKey()` are duplicated here for frontend use. Keep them in sync with any backend equivalents.
