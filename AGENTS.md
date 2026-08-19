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

## 7. Architectural Principles: SOLID, Design Patterns & Plug-and-Play Model

When designing, refactoring, or adding new features, **always enforce SOLID principles, standard design patterns, loose coupling, and plug-and-play extensibility:**

### 7.1 S.O.L.I.D. Principles
- **Single Responsibility Principle (SRP):** Each module, class, service, or function must have one reason to change. Separate HTTP parsing/routing, business logic, persistence, and UI rendering.
- **Open/Closed Principle (OCP):** Code must be open for extension but closed for modification. Implement new capabilities (e.g., new scrapers, new email providers, new export types) by adding new modules implementing a shared interface, rather than growing monolithic conditionals.
- **Liskov Substitution Principle (LSP):** Concrete implementations must adhere to interface contracts so callers can use any implementation interchangeably without unexpected side effects.
- **Interface Segregation Principle (ISP):** Prefer small, focused interfaces over large monolithic ones. Clients should not be forced to depend on methods they do not use.
- **Dependency Inversion Principle (DIP):** High-level business logic must depend on abstractions/interfaces, not concrete implementations or low-level dependencies.

### 7.2 Loose Coupling & Common Design Patterns
- **Strategy & Provider Pattern:** Encapsulate interchangeable algorithms or external service providers behind a uniform interface (e.g., email transport providers, auth providers, scraping strategies).
- **Registry / Factory Pattern:** Use a registry/factory pattern for plug-and-play modules. New modules register themselves to a central registry without modifying the core consumer code.
- **Adapter Pattern:** Wrap external third-party libraries, APIs, or DOM structures in adapters to insulate application logic from third-party schema drift.
- **Observer / Event Dispatcher / Pub-Sub:** Decouple event producers from consumers for background workflows, notifications, or multi-step reactions.
- **Facade Pattern:** Provide clean, unified entry points to complex subsystems (e.g., centralized API client, multi-step orchestrators).

### 7.3 Plug-and-Play Modularity Mandate
- **Extensibility by Default:** Avoid hardcoded `switch` / `if-else` blocks for extensible concepts. Design modular extension points with shared TypeScript contracts.
- **Isolated Side Effects:** Isolate I/O, database calls, and network interactions to keep core domain logic purely testable and pluggable.

---

## 8. Monorepo Architecture

This is a pnpm monorepo with three packages:

| Package   | Path                  | Tech Stack                             | Purpose                                    |
|-----------|-----------------------|----------------------------------------|--------------------------------------------|
| backend   | `packages/backend/`   | Express 5, TypeScript, PostgreSQL, pg  | REST API server                            |
| frontend  | `packages/frontend/`  | Next.js 15, React 19, Tailwind CSS v4  | Web dashboard (App Router)                 |
| extension | `packages/extension/` | Chrome Extension MV3, TypeScript       | Browser extension (LinkedIn scrape + CRM)  |

### 8.1 Package Boundaries (HARD RULE)
- **Never import code across packages.** Each package is standalone. Shared contracts are maintained by keeping TypeScript interfaces in sync manually across `packages/backend/src/types/`, `packages/frontend/src/lib/types.ts`, and `packages/extension/src/types.ts`.
- When adding a new field, type, or endpoint, you **MUST** update all three type files to stay in sync. See the Mandatory Sync Checklist below.

### 8.2 Shared Contracts — The Type Trinity
The following files define the shared data contract between all three packages. They must always be kept in sync:

| Canonical Source                          | Must Mirror To                                    |
|-------------------------------------------|---------------------------------------------------|
| `packages/backend/src/types/index.ts`     | `packages/frontend/src/lib/types.ts`              |
| `packages/backend/src/types/index.ts`     | `packages/extension/src/types.ts`                 |

**When you modify any shared type (User, Company, Prospect, EmailTemplate, EmailSend, TemplateVariable, etc.), you MUST update all three files in the same change.**

---

## 9. Mandatory Sync Checklist (HARD RULE)

**Every change MUST trigger a review of this checklist. If any item applies, the corresponding file MUST be updated in the same commit.**

### 9.1 Adding or Modifying an API Endpoint
- [ ] Route file created/updated in `packages/backend/src/routes/`
- [ ] Route registered in `packages/backend/src/routes/index.ts`
- [ ] API client function added/updated in `packages/frontend/src/lib/api.ts`
- [ ] `packages/backend/README.md` updated with the new endpoint details
- [ ] If the extension calls this endpoint: `packages/extension/src/popup.ts` or relevant source updated

### 9.2 Adding or Modifying a Database Table/Column
- [ ] Schema updated in `packages/backend/src/db/migrate.ts` (idempotent migration)
- [ ] Backend TypeScript interface updated in `packages/backend/src/types/index.ts`
- [ ] Frontend TypeScript interface updated in `packages/frontend/src/lib/types.ts`
- [ ] If extension uses this entity: `packages/extension/src/types.ts` updated
- [ ] `packages/backend/README.md` database schema section updated

### 9.3 Adding or Modifying a Backend Service
- [ ] Service file created/updated in `packages/backend/src/services/`
- [ ] If a new service file is created: imported and used in the appropriate route
- [ ] `packages/backend/README.md` services section updated

### 9.4 Adding or Modifying an Environment Variable
- [ ] Variable added to `packages/backend/src/config.ts` (backend) or `.env` (frontend/extension)
- [ ] Variable added to `.env.example` at the repo root
- [ ] `packages/backend/README.md` environment variables section updated

### 9.5 Adding or Modifying Frontend Pages/Components
- [ ] Page added under `packages/frontend/src/app/(dashboard)/`
- [ ] If it needs sidebar navigation: `packages/frontend/src/components/Sidebar.tsx` updated
- [ ] If it needs auth protection: verify `packages/frontend/src/middleware.ts` covers the route
- [ ] `packages/frontend/README.md` updated with the new page/component

### 9.6 Adding or Modifying Any Feature / Endpoint / Component / Utility (TESTING MANDATE)
- [ ] Real automated test file created/updated (`*.test.ts` or `*.spec.ts`) in the affected package
- [ ] Tests verify all new functions, API endpoints, error handling, session/auth handling, and edge cases
- [ ] `pnpm test` executed and confirmed 100% PASSING across all packages before completing any task

---

## 10. Mandatory Automated Testing & Zero Manual Testing (HARD RULE)

**The user will NOT perform manual testing.** All verification is automated, deterministic, and driven by real code tests executed through the package test runners.

1. **Every Feature Must Have Real Code Tests:**
   - Whenever you write or modify code (functions, endpoints, services, UI components, session/auth flows, scrapers, form fillers), you **MUST** write corresponding automated tests in `src/__tests__/` or next to the file using **Vitest** (`vitest run`).
   - Mocking must be used properly for external networks and databases (e.g. `supertest` for Express route testing, `jsdom` for React components/DOM, mock Chrome APIs for extension).
2. **Never Rely on AI "Self-Assessment" in Place of Real Tests:**
   - Tests must execute real application code using proper testing frameworks (`vitest`, `@testing-library/react`, `supertest`).
3. **Pre-Commit / Pre-Completion Verification:**
   - **ALWAYS run `pnpm test` (or the affected package's test script) before declaring any task complete.**
   - If any test fails, you must fix the code or the test before completing your turn. Zero failing tests allowed.
4. **Scope of Test Coverage Required:**
   - **Functions & Services:** Input/output validation, error throwing, edge cases.
   - **APIs & Routes:** HTTP status codes (200, 201, 400, 401, 403, 404, 500), payload parsing, Zod validation errors, sanitized error responses.
   - **Session & Auth:** Valid JWT, expired JWT, missing tokens, role permissions (`admin` vs `user`), cookie parsing.
   - **UI & Components:** Component rendering, prop changes, user interactions, API client calls.
   - **Extension:** Scraper regex patterns, DOM selectors, form filler classification, Chrome message discriminators.

---

## 11. Documentation Update Rules (HARD RULE)

Every package has a `README.md` that serves as the single source of truth for that package's architecture. These files **MUST** be kept up-to-date with every change.

| Documentation File                     | Must be updated when...                                          |
|----------------------------------------|------------------------------------------------------------------|
| `packages/backend/README.md`           | Any route, service, DB schema, middleware, or env var changes    |
| `packages/frontend/README.md`          | Any page, component, API client, or routing changes              |
| `packages/extension/README.md`         | Any manifest, message type, content script, or popup changes     |
| `TESTING.md`                           | Any changes to testing commands, frameworks, or coverage rules   |
| Root `README.md`                       | Any major architectural change or new package added              |

**If you change code but not the corresponding README, the change is INCOMPLETE.**

---

## 12. File Naming & Organization Conventions

- **Backend routes:** One file per resource domain in `src/routes/`. Filename matches the URL prefix (e.g., `prospects.ts` → `/api/prospects`).
- **Backend services:** Business logic belongs in `src/services/`, not in route handlers. Route files should only contain request parsing, validation, and response formatting.
- **Frontend pages:** Next.js App Router conventions — one directory per route segment under `src/app/`.
- **Frontend components:** Reusable UI in `src/components/`. Page-specific UI stays in the page file.
- **Extension:** TypeScript source in `src/`, compiled output in `dist/`. Never edit `dist/` directly.
- **Test files:** Placed under `src/__tests__/*.test.ts` or alongside source as `<filename>.test.ts`.

**Enforcement:** This file is placed in the root directory so that it recursively applies to all agent interactions within this workspace and all of its subdirectories.
