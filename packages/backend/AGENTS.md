# Backend Package — Agentic Coding Rules

These rules apply to all files within `packages/backend/`. They supplement the root `AGENTS.md` with backend-specific constraints.

---

## Tech Stack
- **Runtime:** Node.js 20+, ESM (`"type": "module"`)
- **Framework:** Express 5
- **Language:** TypeScript (strict mode)
- **Database:** PostgreSQL via `pg` Pool (raw SQL, no ORM)
- **Auth:** JWT (jsonwebtoken + bcryptjs)
- **Email:** Resend SDK + Nodemailer (Gmail SMTP)
- **Validation:** Zod
- **File uploads:** Multer
- **Scheduling:** node-cron

---

## Architecture Rules

### Layered Architecture (ENFORCED)
```
Request → Route (parse + validate) → Service (business logic) → Database (pg pool)
```

1. **Routes** (`src/routes/`) — HTTP-layer only. Parse request params/body, validate with Zod, call services, format response. NO direct SQL queries in route files.
2. **Services** (`src/services/`) — Business logic. May call `pool.query()`. No access to `req` or `res` objects.
3. **Database** (`src/db/`) — Connection pool and schema migrations only.
4. **Middleware** (`src/middleware/`) — Cross-cutting concerns (auth, error handling, row-level filtering).

### SOLID & Plug-and-Play Design Principles
- **Single Responsibility (SRP):** Services encapsulate domain operations, not transport or protocol logic. Separate parsing, orchestration, and persistence.
- **Open/Closed & Strategy Pattern (OCP):** For extensible integrations (e.g., email transport providers like Resend/Gmail, AI enrichers, export engines), define a common provider interface. Add new providers as modular strategy implementations without modifying existing business logic.
- **Dependency Inversion (DIP) & Loose Coupling:** Pass dependencies (or configuration objects) into functions/services. Avoid tightly coupling domain logic directly to external HTTP client calls or proprietary third-party SDK shapes—wrap them in clean adapter interfaces.
- **Plug-and-Play Registries:** When supporting multiple drivers, processors, or strategies, use a central registry/factory lookup so new implementations can be registered easily.

### Route File Rules
- One file per resource domain. Filename matches URL prefix: `prospects.ts` → `/api/prospects`.
- Always use `Router()` from Express. Export the router as the default export.
- New routes MUST be registered in `src/routes/index.ts`.
- Protected routes use `authMiddleware` — applied at the router-mount level in `index.ts`, NOT inside individual route files.
- All route handlers MUST be wrapped in try/catch or use Express async error handling that passes errors to `next()`.

### Database Rules
- All schema changes go through `src/db/migrate.ts` as **idempotent** migrations (use `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).
- NEVER write raw `CREATE TABLE` or `ALTER TABLE` outside `migrate.ts`.
- Always use **parameterized queries** (`$1`, `$2`) for ALL user input. NEVER use string interpolation/concatenation in SQL.
- Use `pool` from `src/db/index.ts`. Do not create new `Pool` instances.
- Column names use `snake_case`. Table names are plural (`users`, `companies`, `prospects`).

### Type System Rules
- All shared data shapes are defined in `src/types/index.ts`.
- Route response types must use `ApiResponse<T>` or `ApiError` from `src/types/index.ts`.
- When adding a new entity or field, update `src/types/index.ts` FIRST, then update `packages/frontend/src/lib/types.ts` and `packages/extension/src/types.ts` to match.

### Environment Variables
- All env vars are loaded through `src/config.ts` via the `CONFIG` object.
- NEVER access `process.env` directly outside of `config.ts`.
- New env vars must be added to: `src/config.ts`, root `.env.example`, and documented in this package's `README.md`.

---

## File Reference

| File/Directory          | Purpose                                               | When to modify                                      |
|-------------------------|-------------------------------------------------------|-----------------------------------------------------|
| `src/config.ts`         | Typed env vars via `CONFIG` object                    | Adding new env vars                                 |
| `src/index.ts`          | App bootstrap, middleware chain, server start          | Adding global middleware or changing startup order   |
| `src/db/index.ts`       | pg Pool singleton                                     | Almost never — connection config only               |
| `src/db/migrate.ts`     | Schema definitions + idempotent column migrations      | Adding tables, columns, indexes                     |
| `src/middleware/auth.ts` | JWT verification, attaches `req.user`                 | Changing auth logic or token format                 |
| `src/middleware/errorHandler.ts` | Global error handler                          | Changing error response format                      |
| `src/middleware/ownerFilter.ts`  | Row-level isolation (multi-user)               | Changing ownership/tenant logic                     |
| `src/routes/index.ts`   | Mounts all routers under `/api`                       | Adding or removing route files                      |
| `src/routes/*.ts`       | Individual resource endpoints                         | Adding/modifying API endpoints                      |
| `src/services/*.ts`     | Business logic (email, scheduling, enrichment)         | Adding/modifying business processes                 |
| `src/types/index.ts`    | Shared TypeScript interfaces (canonical source)        | Adding/modifying data entities                      |
| `src/__tests__/*.ts`    | Vitest unit & integration test suites                  | Adding/modifying tests for any backend code         |

---

## Mandatory Automated Testing (HARD RULE)

1. **Every backend feature, route, middleware, and service MUST have tests:**
   - Place unit tests and Supertest integration tests in `src/__tests__/<feature>.test.ts`.
   - Test success paths, validation errors (Zod 400 responses), authentication failures (401), authorization checks (403), and error handling (500).
   - Test session handling: JWT signing, token expiry, tampered tokens, and role checking.
2. **Execution requirement:**
   - Execute `pnpm test` (or `pnpm --filter @crm/backend test`) and ensure 100% tests pass with 0 errors.

---

## Mandatory Post-Change Verification

After making any backend change, the agent MUST:
1. Write/update automated tests in `src/__tests__/`.
2. Run `pnpm --filter @crm/backend test` and confirm all tests pass.
3. Verify the running dev server (`pnpm dev`) shows no compile errors in its terminal output.
4. If a new endpoint was added, confirm it is reachable (e.g., check that `routes/index.ts` mounts it).
5. If a schema change was made, confirm `migrate.ts` runs without error on server restart.
6. Update `README.md` in this directory if any of the following changed: routes, services, DB schema, env vars, middleware.
