---
name: orchestrate
description: >-
  Use this skill for ANY task that touches more than one package (backend, frontend, extension),
  or when the user gives a feature-level request that implies changes across the monorepo.
  This skill defines the multi-package orchestration workflow: decompose, parallelize, sync, verify.
  Activate automatically when the task involves adding a new feature, API endpoint with UI,
  or any cross-cutting change.
---

# Multi-Package Orchestration Workflow

This CRM is a pnpm monorepo with three packages. When a task spans multiple packages,
follow this strict workflow to maximize parallelism and prevent sync drift.

## Package Map

| Role       | Package Path              | AGENTS.md Location                          | Specialization                         |
|------------|---------------------------|---------------------------------------------|----------------------------------------|
| Backend    | `packages/backend/`       | `packages/backend/AGENTS.md`                | Express 5, PostgreSQL, REST API        |
| Frontend   | `packages/frontend/`      | `packages/frontend/AGENTS.md`               | Next.js 15, React 19, Tailwind CSS v4  |
| Extension  | `packages/extension/`     | `packages/extension/AGENTS.md`              | Chrome Extension MV3, TypeScript       |

---

## Phase 1: Decompose

Before writing ANY code, analyze the task and produce a mental decomposition:

1. **Identify affected packages.** Which of backend/frontend/extension are involved?
2. **Identify the dependency order.** Typically: `DB schema → Backend types → Backend route/service → Frontend types → Frontend API client → Frontend UI → Extension types → Extension UI`.
3. **Identify parallelizable work.** Changes within the same package that don't depend on each other can be done in a single parallel tool call batch.
4. **Identify the sync points.** What shared contracts (types, API shapes) need to match across packages?

### Dependency Graph (follow this order)

```
┌─────────────────────────────────────────────────────┐
│ 1. Database Schema (migrate.ts)                     │
│ 2. Backend Types (backend/src/types/index.ts)       │
│    ├── 3a. Frontend Types (frontend/src/lib/types.ts)  │  ← Can be parallel
│    └── 3b. Extension Types (extension/src/types.ts)    │  ← Can be parallel
│ 4. Backend Route + Service                          │
│    ├── 5a. Frontend API client (frontend/src/lib/api.ts) │  ← Can be parallel
│    └── 5b. Extension API calls (if applicable)           │  ← Can be parallel
│ 6a. Frontend UI (pages/components)                  │  ← Can be parallel
│ 6b. Extension UI (popup.ts/popup.html)              │  ← Can be parallel
│ 7. Documentation (all README.md files)              │  ← Can be parallel
└─────────────────────────────────────────────────────┘
```

---

## Phase 2: Execute with Parallelism

### Parallel Execution Rules

1. **Batch independent file edits.** If you need to update `frontend/src/lib/types.ts` AND `extension/src/types.ts`, do them in the SAME tool call batch — they don't depend on each other.
2. **Batch independent searches.** If you need to find usages in both frontend and backend, search both in parallel.
3. **Never serialize what can be parallelized.** Each tool call round-trip costs time. Maximize the number of independent operations per batch.

### Per-Package Context Rules

When working on each package, mentally assume the role of a specialist:

- **Backend specialist:** Follow `packages/backend/AGENTS.md` strictly. Layered architecture (route → service → db). Parameterized queries. Zod validation. Config via `CONFIG` object.
- **Frontend specialist:** Follow `packages/frontend/AGENTS.md` strictly. App Router conventions. API calls through `src/lib/api.ts` only. Tailwind CSS v4. No component libraries.
- **Extension specialist:** Follow `packages/extension/AGENTS.md` strictly. Manifest V3 rules. TypeScript compiled via esbuild. Chrome messaging patterns. Build after every change.

---

## Phase 3: Sync Checkpoint

After completing all code changes, run through the **Mandatory Sync Checklist** from the root `AGENTS.md`:

1. **Type Trinity:** Are `backend/src/types/index.ts`, `frontend/src/lib/types.ts`, and `extension/src/types.ts` in sync for all shared entities?
2. **API surface:** Does every new backend endpoint have a corresponding frontend API client method?
3. **Route registration:** Is every new route mounted in `backend/src/routes/index.ts`?
4. **Automated Tests:** Are real automated test files (`*.test.ts`) written/updated for all new features, endpoints, and helpers?
5. **Documentation:** Are ALL affected `README.md` and `TESTING.md` files updated?

If ANY item is missing, fix it before moving to verification.

---

## Phase 4: Automated Verification (Zero Manual Testing)

Run automated test suites and compiler checks for each affected package:

1. **Execute Test Suites (MANDATORY):**
   - Run `pnpm test` (or `pnpm -r test`) to execute Vitest across all workspaces.
   - Every single test MUST PASS. 0 failing tests allowed.
2. **Backend:** Check the running dev server terminal for compile errors. Verify new routes are mounted.
3. **Frontend:** Check the running dev server terminal for compile errors. Verify new pages render.
4. **Extension:** Run `pnpm build` in the extension package. Remind user to reload the extension.

### Verification Parallelism
- Test execution runs in parallel across monorepo packages.
- Backend and frontend dev server checks can be done in parallel (both are already running).
- Extension build is independent and can run concurrently with other checks.

---

## Phase 5: Summary

After all changes are complete and verified, produce a concise walkthrough covering:
- What changed in each package
- Any new API endpoints (method, path, purpose)
- Any new UI elements
- Any migration steps needed (reload extension, restart server, etc.)

---

## Anti-Patterns (DO NOT)

1. **DO NOT** make all backend changes first, then all frontend changes sequentially when parts are independent.
2. **DO NOT** forget to update types in ALL three packages when a shared entity changes.
3. **DO NOT** add a frontend page without updating `Sidebar.tsx` if it needs navigation.
4. **DO NOT** edit extension `dist/` files directly.
5. **DO NOT** make API calls outside of `frontend/src/lib/api.ts` in frontend code.
6. **DO NOT** skip documentation updates — the change is INCOMPLETE without README updates.
