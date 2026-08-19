# Universal Agentic Coding Guidelines

These rules are framework-agnostic guidelines for AI agents pair-programming on this codebase. They must be followed strictly to prevent mistakes, ensure high-quality code, and maintain project integrity across all directories.

---

## 1. General Principles
- **Think Before Acting:** Do not make assumptions. Always gather context by reading existing code, configurations, and documentation before proposing changes or writing code.
- **Minimalist Interventions:** Only modify what is strictly necessary to achieve the objective. Avoid unnecessary refactoring or "cleanups" outside the scope of the immediate task.
- **Self-Correction & Verification:** After writing code or executing a command, always verify the result (e.g., check for syntax errors, run tests, or lint the code). If an error occurs, read the logs thoroughly instead of guessing.

## 2. Context Gathering
- **Search Before Modifying:** Always use available search tools to find usages of a function or class before altering its signature. Understand the blast radius of a change.
- **Check Dependencies:** Before adding a new dependency, verify if an existing package already provides the required functionality.
- **Understand the Architecture:** Respect the established project structure and architectural patterns (e.g., frontend vs. backend separation, module boundaries).

## 3. Code Generation & Modification
- **No Placeholders:** Write complete, functional code. Do not leave `// TODO: implement this` or `// ... existing code ...` (unless explicitly instructed to provide a snippet or a chunked replacement).
- **Preserve Existing Logic:** When modifying a file, ensure that unrelated comments, docstrings, and existing working logic remain intact.
- **Type Safety & Linting:** Adhere strictly to the project's type-checking (e.g., TypeScript interfaces) and linting rules. Do not bypass type checks (like using `any`) unless absolutely unavoidable.

## 4. Execution & Terminal Commands
- **Safe Execution:** Never run destructive commands (like `rm -rf`, DB drops, or git history rewriting) without explicit user confirmation.
- **Read Command Outputs:** If a command is executed in the background or terminal, always wait for and read its output before proceeding to the next step.

## 5. Security & Best Practices
- **Never Hardcode Secrets:** API keys, passwords, and tokens must always be loaded from environment variables.
- **Data Validation:** Always validate inputs at system boundaries (e.g., API endpoints, form submissions).
- **Graceful Error Handling:** Implement proper error handling (try/catch blocks) and return user-friendly error messages rather than raw stack traces in production code.

## 6. Communication
- **Ask for Clarification:** If a request is ambiguous or underspecified, stop and ask the user for clarification rather than making a potentially incorrect assumption.
- **Provide Concise Updates:** Keep explanations brief and focused on the "why" rather than the "what".

---

## 7. Monorepo Architecture

This is a pnpm monorepo with three packages:

| Package   | Path                  | Tech Stack                             | Purpose                                    |
|-----------|-----------------------|----------------------------------------|--------------------------------------------|
| backend   | `packages/backend/`   | Express 5, TypeScript, PostgreSQL, pg  | REST API server                            |
| frontend  | `packages/frontend/`  | Next.js 15, React 19, Tailwind CSS v4  | Web dashboard (App Router)                 |
| extension | `packages/extension/` | Chrome Extension MV3, TypeScript       | Browser extension (LinkedIn scrape + CRM)  |

### 7.1 Package Boundaries (HARD RULE)
- **Never import code across packages.** Each package is standalone. Shared contracts are maintained by keeping TypeScript interfaces in sync manually across `packages/backend/src/types/`, `packages/frontend/src/lib/types.ts`, and `packages/extension/src/types.ts`.
- When adding a new field, type, or endpoint, you **MUST** update all three type files to stay in sync. See the Mandatory Sync Checklist below.

### 7.2 Shared Contracts — The Type Trinity
The following files define the shared data contract between all three packages. They must always be kept in sync:

| Canonical Source                          | Must Mirror To                                    |
|-------------------------------------------|---------------------------------------------------|
| `packages/backend/src/types/index.ts`     | `packages/frontend/src/lib/types.ts`              |
| `packages/backend/src/types/index.ts`     | `packages/extension/src/types.ts`                 |

**When you modify any shared type (User, Company, Prospect, EmailTemplate, EmailSend, TemplateVariable, etc.), you MUST update all three files in the same change.**

---

## 8. Mandatory Sync Checklist (HARD RULE)

**Every change MUST trigger a review of this checklist. If any item applies, the corresponding file MUST be updated in the same commit.**

### 8.1 Adding or Modifying an API Endpoint
- [ ] Route file created/updated in `packages/backend/src/routes/`
- [ ] Route registered in `packages/backend/src/routes/index.ts`
- [ ] API client function added/updated in `packages/frontend/src/lib/api.ts`
- [ ] `packages/backend/README.md` updated with the new endpoint details
- [ ] If the extension calls this endpoint: `packages/extension/src/popup.ts` or relevant source updated

### 8.2 Adding or Modifying a Database Table/Column
- [ ] Schema updated in `packages/backend/src/db/migrate.ts` (idempotent migration)
- [ ] Backend TypeScript interface updated in `packages/backend/src/types/index.ts`
- [ ] Frontend TypeScript interface updated in `packages/frontend/src/lib/types.ts`
- [ ] If extension uses this entity: `packages/extension/src/types.ts` updated
- [ ] `packages/backend/README.md` database schema section updated

### 8.3 Adding or Modifying a Backend Service
- [ ] Service file created/updated in `packages/backend/src/services/`
- [ ] If a new service file is created: imported and used in the appropriate route
- [ ] `packages/backend/README.md` services section updated

### 8.4 Adding or Modifying an Environment Variable
- [ ] Variable added to `packages/backend/src/config.ts` (backend) or `.env` (frontend/extension)
- [ ] Variable added to `.env.example` at the repo root
- [ ] `packages/backend/README.md` environment variables section updated

### 8.5 Adding or Modifying Frontend Pages/Components
- [ ] Page added under `packages/frontend/src/app/(dashboard)/`
- [ ] If it needs sidebar navigation: `packages/frontend/src/components/Sidebar.tsx` updated
- [ ] If it needs auth protection: verify `packages/frontend/src/middleware.ts` covers the route
- [ ] `packages/frontend/README.md` updated with the new page/component

### 8.6 Adding or Modifying Extension Functionality
- [ ] If new permission needed: `packages/extension/manifest.json` updated
- [ ] If new content script or background handler: registered in `manifest.json`
- [ ] If new message type: interface added to `packages/extension/src/types.ts`
- [ ] After TypeScript changes: `pnpm build` re-run in the extension package
- [ ] `packages/extension/README.md` updated

---

## 9. Documentation Update Rules (HARD RULE)

Every package has a `README.md` that serves as the single source of truth for that package's architecture. These files **MUST** be kept up-to-date with every change.

| Documentation File                     | Must be updated when...                                          |
|----------------------------------------|------------------------------------------------------------------|
| `packages/backend/README.md`           | Any route, service, DB schema, middleware, or env var changes    |
| `packages/frontend/README.md`          | Any page, component, API client, or routing changes              |
| `packages/extension/README.md`         | Any manifest, message type, content script, or popup changes     |
| Root `README.md`                       | Any major architectural change or new package added              |

**If you change code but not the corresponding README, the change is INCOMPLETE.**

---

## 10. File Naming & Organization Conventions

- **Backend routes:** One file per resource domain in `src/routes/`. Filename matches the URL prefix (e.g., `prospects.ts` → `/api/prospects`).
- **Backend services:** Business logic belongs in `src/services/`, not in route handlers. Route files should only contain request parsing, validation, and response formatting.
- **Frontend pages:** Next.js App Router conventions — one directory per route segment under `src/app/`.
- **Frontend components:** Reusable UI in `src/components/`. Page-specific UI stays in the page file.
- **Extension:** TypeScript source in `src/`, compiled output in `dist/`. Never edit `dist/` directly.

**Enforcement:** This file is placed in the root directory so that it recursively applies to all agent interactions within this workspace and all of its subdirectories.
