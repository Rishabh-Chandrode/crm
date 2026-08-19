# Automated Testing Guide

This project strictly enforces **100% automated real-code testing with zero manual testing**. Every feature, function, API endpoint, middleware, session detail, UI interaction, scraper, and form-filler must have automated test coverage using proper testing frameworks before any changes are committed or considered complete.

---

## 1. Quick Start: Running Tests

All tests run using **[Vitest](https://vitest.dev/)**, configured across every package in the monorepo with native TypeScript and ESM support.

### Run All Tests Across the Entire Monorepo
```bash
pnpm test
```
*Executes all test suites in parallel across backend, frontend, and extension.*

### Run Tests for a Specific Package
```bash
# Backend tests (API routes, services, auth, db logic)
pnpm test:backend
# or: pnpm --filter @crm/backend test

# Frontend tests (API client, type helpers, middleware, components)
pnpm test:frontend
# or: pnpm --filter @crm/frontend test

# Extension tests (DOM scrapers, form fillers, message contracts)
pnpm test:extension
# or: pnpm --filter @crm/extension test
```

### Run Tests in Watch Mode (Auto-retest on file save)
```bash
# Watch all packages
pnpm test:watch

# Watch specific package
pnpm --filter @crm/backend test:watch
pnpm --filter @crm/frontend test:watch
pnpm --filter @crm/extension test:watch
```

### Run a Specific Test File or Pattern
```bash
pnpm --filter @crm/backend test src/__tests__/auth.test.ts
pnpm --filter @crm/frontend test src/__tests__/api.test.ts
pnpm --filter @crm/extension test src/__tests__/detector.test.ts
```

---

## 2. Test Architecture & Frameworks

| Package | Test Framework | Test Environment | Key Libraries | What is Tested |
|---|---|---|---|---|
| **Backend** (`@crm/backend`) | Vitest | `node` | Supertest, jsonwebtoken, zod | Express API endpoints, auth middleware & JWT session tokens, role checks, template engine, services, input validation |
| **Frontend** (`@crm/frontend`) | Vitest | `jsdom` | React Testing Library, @vitejs/plugin-react | Centralized API client (`src/lib/api.ts`), JWT cookie parsing, Next.js route protection (`middleware.ts`), UI components, type converters |
| **Extension** (`@crm/extension`) | Vitest | `jsdom` | JSDOM DOM queries | Form autofill field detectors (Greenhouse, Workday, Google Forms), resume upload finders, LinkedIn profile DOM scrapers, Chrome runtime messaging shapes |

---

## 3. Directory Structure for Tests

All test files must follow the naming pattern `*.test.ts` (or `*.spec.ts`) located in `src/__tests__/`:

```
crm/
├── packages/
│   ├── backend/
│   │   └── src/
│   │       └── __tests__/
│   │           ├── api.test.ts             # Health check & public/protected routes
│   │           ├── auth.test.ts            # JWT signing, verification, authMiddleware, requireRole
│   │           ├── autoTrackApplication.test.ts # Automatic job application creation from email
│   │           ├── roleCategory.test.ts    # Role category inference (HR, Engineer, Other)
│   │           ├── routes.test.ts          # Feature endpoints (Companies, Prospects, Templates, Applications, Tracking, Users)
│   │           └── templateEngine.test.ts  # Variable resolution, plain text to HTML, tracking pixel
│   │
│   ├── frontend/
│   │   └── src/
│   │       └── __tests__/
│   │           ├── api.test.ts             # Central API client, token injection, 400 field errors
│   │           ├── apiResources.test.ts    # Resource endpoints (companies, prospects, templates, applications, stats)
│   │           ├── middleware.test.ts      # Next.js route protection, session cookies, redirects
│   │           └── types.test.ts           # Full name formatter, variable presets, field labels
│   │
│   └── extension/
│       └── src/
│           └── __tests__/
│               ├── detector.test.ts        # DOM classification, field pattern matching, resume inputs
│               ├── platforms.test.ts       # Job portal auto-fillers (Greenhouse, Workday, etc.)
│               └── types.test.ts           # Scraper messages, autofill results, UserProfile contracts
```

---

## 4. How to Write Tests for New Features

### 4.1 Backend API Endpoint Test (Supertest)

When creating or modifying an API endpoint in `packages/backend/src/routes/<feature>.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config.js';

describe('Feature API (/api/<feature>)', () => {
  const token = jwt.sign(
    { id: 'user-1', username: 'tester', role: 'user' },
    CONFIG.jwtSecret
  );

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/<feature>');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Unauthorized');
  });

  it('returns 400 when payload fails Zod validation', async () => {
    const res = await request(app)
      .post('/api/<feature>')
      .set('Authorization', `Bearer ${token}`)
      .send({ invalidField: 123 });

    expect(res.status).toBe(400);
  });
});
```

### 4.2 Frontend API Client & Component Test

When adding an API method or component in `packages/frontend`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../lib/api';

describe('Feature API Client', () => {
  beforeEach(() => {
    document.cookie = 'crm_token=mock-token; path=/';
  });

  it('calls endpoint with bearer auth and unwraps data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1', name: 'Test' }),
    });

    const result = await api.feature.get('1');
    expect(result).toEqual({ id: '1', name: 'Test' });
  });
});
```

### 4.3 Extension Scraper or Form Detector Test

When adding auto-fill rules or scrapers in `packages/extension`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { classifyElement } from '../formFiller/detector';

describe('Field Classification', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('identifies custom field inputs correctly', () => {
    document.body.innerHTML = '<input name="user_email_address" type="text" />';
    const input = document.querySelector('input')!;
    expect(classifyElement(input)).toBe('email');
  });
});
```

---

## 5. Mandatory Verification Rules (Enforced by AGENTS.md)

1. **Zero Manual Testing:** The developer/user does not manually test forms, endpoints, or button clicks in the browser to verify feature correctness.
2. **Deterministic Code Tests:** Every feature must be proven through automated assertions.
3. **100% Pass Rate:** Before any task is completed, `pnpm test` must run and output zero failures.
4. **Regression Prevention:** Whenever a bug is fixed, a regression test must be added to prevent future occurrences.
