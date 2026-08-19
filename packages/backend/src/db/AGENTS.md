# Backend Database — Agentic Coding Rules

These rules apply to all files within `packages/backend/src/db/`.

---

## Database Layer Rules

### Connection
- `index.ts` exports a single `pool` instance. ALL database access throughout the backend MUST use this pool.
- NEVER create additional `Pool` or `Client` instances.

### Migrations (`migrate.ts`)
- All schema definitions and changes live in `migrate.ts`. This is the ONLY place where `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, etc. are allowed.
- ALL migrations MUST be **idempotent**: use `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, etc.
- Migrations run automatically on server startup. They must be safe to re-run any number of times.
- When adding a new table or column:
  1. Add the SQL to `migrate.ts`
  2. Update `packages/backend/src/types/index.ts` with the corresponding TypeScript interface
  3. Update `packages/frontend/src/lib/types.ts` to mirror the change
  4. If the extension uses this entity, update `packages/extension/src/types.ts`
  5. Update `packages/backend/README.md` (database schema section)

### Query Safety (HARD RULE)
- **ALWAYS use parameterized queries** (`$1`, `$2`, etc.). Example:
  ```typescript
  await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  ```
- **NEVER** use string interpolation or template literals to inject values into SQL.
- This applies to ALL query construction throughout the entire backend, not just in `db/`.

### Naming Conventions
- Table names: `snake_case`, plural (`users`, `email_sends`, `email_templates`)
- Column names: `snake_case` (`first_name`, `created_at`, `company_id`)
- Primary keys: always `id UUID DEFAULT uuid_generate_v4()`
- Foreign keys: `<referenced_table_singular>_id` (e.g., `company_id`, `template_id`)
- Timestamps: always include `created_at` and `updated_at` with `TIMESTAMPTZ DEFAULT NOW()`
