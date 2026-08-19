# Backend Services — Agentic Coding Rules

These rules apply to all files within `packages/backend/src/services/`.

---

## Service Layer Conventions

### What belongs in a service?
- Business logic that is reused across multiple routes.
- Complex operations involving multiple database queries or external API calls.
- Scheduled/background tasks (e.g., `scheduler.ts`).
- Third-party integrations (e.g., email sending, enrichment APIs).

### What does NOT belong in a service?
- HTTP request/response handling (that belongs in routes).
- Direct access to `req`, `res`, or `next` (services should be HTTP-agnostic).

### Rules (ENFORCED)
1. **Services receive plain data, not Express objects.** Pass typed parameters (IDs, objects), not `req`.
2. **Services return typed data or throw errors.** Let the calling route handle HTTP status codes.
3. **Database access is allowed** via `pool` from `src/db/index.ts`. Use parameterized queries only.
4. **Error handling:** Services should throw descriptive `Error` objects. The route layer catches them and returns appropriate HTTP responses.
5. **External API calls** must have proper timeout handling and error wrapping.

### When Adding a New Service
1. Create `src/services/<name>.ts`
2. Import and call it from the appropriate route file(s)
3. Update `packages/backend/README.md` (services section)
