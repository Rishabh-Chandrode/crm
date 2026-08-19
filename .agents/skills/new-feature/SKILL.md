---
name: new-feature
description: >-
  Use this skill when the user asks to add a new feature, entity, or CRUD resource
  to the CRM. This provides a step-by-step scaffold that ensures nothing gets missed:
  schema, types, routes, services, frontend API, UI, extension sync, and documentation.
  Activate when the user says things like "add notes", "add tags", "create a new entity",
  "build X feature", etc.
---

# New Feature Scaffold Workflow

When adding a new feature or entity to the CRM, follow this checklist IN ORDER.
Skip steps that don't apply (e.g., skip extension steps if the feature is frontend-only).

---

## Step 1: Define Data Model & Architectural Design (SOLID & Plug-and-Play)

Before writing code, evaluate design and coupling:

- **SOLID & Loose Coupling:**
  - Can new variants/providers be added without modifying existing code (Open/Closed)?
  - Are responsibilities segregated cleanly between routes, services, data layers, and UI components (Single Responsibility)?
  - Are external providers or algorithms decoupled behind a Strategy/Adapter interface?
- **Plug-and-Play Model:**
  - If the feature supports multiple providers, detectors, formats, or channels, implement a registry/factory pattern.
- **Data Model:**
  - What is the entity name? (e.g., `notes`, `tags`, `activities`)
  - What columns/fields does it need?
  - Does it belong to a user (`owner_id`)? (Almost always yes)
  - Does it reference other entities? (e.g., `prospect_id`, `company_id`)
  - Does it need timestamps? (Always: `created_at`, `updated_at`)

---

## Step 2: Database Schema

**File:** `packages/backend/src/db/migrate.ts`

Add an idempotent migration:
```sql
CREATE TABLE IF NOT EXISTS <entity_plural> (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- entity-specific columns
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Follow the naming rules in `packages/backend/src/db/AGENTS.md`.

---

## Step 3: Type Trinity (ALL THREE FILES)

Update types in all three packages simultaneously (parallel tool call):

1. **`packages/backend/src/types/index.ts`** — Add the canonical interface
2. **`packages/frontend/src/lib/types.ts`** — Mirror it (dates become `string`)
3. **`packages/extension/src/types.ts`** — Mirror it (if extension uses this entity)

---

## Step 4: Backend Service

**File:** `packages/backend/src/services/<entity>.ts` (NEW)

- CRUD functions: `create`, `list`, `getById`, `update`, `delete`
- Accept plain typed parameters, not Express objects
- Use `pool` from `src/db/index.ts`
- Parameterized queries only

---

## Step 5: Backend Route

**File:** `packages/backend/src/routes/<entity>.ts` (NEW)

- Import the service
- Zod schemas for request validation
- Standard CRUD endpoints: `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`
- Consistent response shapes: `{ data: T }` or `{ error: string }`
- Register in `packages/backend/src/routes/index.ts` with `authMiddleware`

---

## Step 6: Frontend API Client

**File:** `packages/frontend/src/lib/api.ts`

Add a new resource namespace to the `api` object:
```typescript
<entity>: {
  list: () => request<Entity[]>('GET', '/<entity>'),
  get: (id: string) => request<Entity>('GET', `/<entity>/${id}`),
  create: (data: CreateEntityPayload) => request<Entity>('POST', '/<entity>', data),
  update: (id: string, data: UpdateEntityPayload) => request<Entity>('PUT', `/<entity>/${id}`, data),
  delete: (id: string) => request<void>('DELETE', `/<entity>/${id}`),
},
```

---

## Step 7: Frontend UI

**File:** `packages/frontend/src/app/(dashboard)/<entity>/page.tsx` (NEW)

- List view with table or cards
- Add/edit form (inline or modal)
- Delete confirmation
- Use `api.<entity>.*` methods — NEVER raw `fetch()`
- Tailwind CSS v4 — no component libraries

**File:** `packages/frontend/src/components/Sidebar.tsx`

- Add navigation entry to the `NAV` array

---

## Step 8: Extension (if applicable)

Only if the extension needs to interact with this entity:

- Update `packages/extension/src/types.ts` (done in Step 3)
- Add API calls in `src/popup.ts`
- Update `popup.html` if new UI sections needed
- Run `pnpm build` in extension package

---

## Step 9: Write Automated Tests (MANDATORY — ZERO MANUAL TESTING)

Write real code tests in `src/__tests__/` for the new feature across all affected packages:
- **Backend tests:** `packages/backend/src/__tests__/<entity>.test.ts` (Supertest route checks, service unit tests, auth & validation tests)
- **Frontend tests:** `packages/frontend/src/__tests__/<entity>.test.ts` (API client tests, types helper tests, component tests)
- **Extension tests:** `packages/extension/src/__tests__/<entity>.test.ts` (if extension was touched)

---

## Step 10: Documentation (ALL affected READMEs & TESTING.md)

Update in parallel:
- `packages/backend/README.md` — new route, service, schema
- `packages/frontend/README.md` — new page, API methods
- `packages/extension/README.md` — if extension was changed
- `TESTING.md` — if new test suites or patterns were introduced

---

## Step 11: Execute Automated Tests & Verify

1. **Run `pnpm test` (or `pnpm -r test`):**
   - Confirm 100% of tests pass across all packages with 0 errors.
2. Check backend dev server for compile errors
3. Check frontend dev server for compile errors
4. Build extension if changed: `cd packages/extension && pnpm build`
5. Confirm new route is accessible
6. Confirm new page renders
