# Backend Routes — Agentic Coding Rules

These rules apply to all files within `packages/backend/src/routes/`.

---

## Route File Conventions

### Structure of a Route File
Every route file follows the same pattern:

```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/index.js';

const router: ReturnType<typeof Router> = Router();

// Zod schemas for validation
const CreateSchema = z.object({ ... });

// GET /
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await pool.query('SELECT ... WHERE owner_id = $1', [userId]);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

export default router;
```

### Rules (ENFORCED)
1. **One file = one resource domain.** Do not create catch-all route files.
2. **Always validate request bodies** with Zod before processing. Return 400 with `{ error: string, fields?: Record<string, string> }` on validation failure.
3. **Always use parameterized queries.** `pool.query('... WHERE id = $1', [id])` — NEVER string concatenation.
4. **Always access the current user** via `req.user!.id` (set by auth middleware). Never trust user-supplied IDs for ownership.
5. **Always return consistent response shapes:**
   - Success: `{ data: T }` or `{ data: T, message: string }`
   - Error: `{ error: string }` or `{ error: string, details: unknown }`
6. **Handle errors with try/catch.** Log the error server-side, return a sanitized message to the client.
7. **Register new routes** in `src/routes/index.ts`. Decide if the route needs `authMiddleware` (most do).

### When Adding a New Route File
1. Create `src/routes/<resource>.ts`
2. Add the import and `router.use(...)` call in `src/routes/index.ts`
3. Add the API client function in `packages/frontend/src/lib/api.ts`
4. Update `packages/backend/README.md` (route table and endpoint documentation)
