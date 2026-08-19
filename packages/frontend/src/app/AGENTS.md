# Frontend Pages — Agentic Coding Rules

These rules apply to all page files within `packages/frontend/src/app/`.

---

## App Router Structure

### Route Groups
- `(dashboard)/` — All authenticated pages. Shares a layout with the sidebar.
- `login/`, `signup/` — Public pages, NOT inside the dashboard group.

### Current Pages

| Route Path         | Directory                    | Purpose                      |
|--------------------|------------------------------|------------------------------|
| `/dashboard`       | `(dashboard)/dashboard/`     | Overview stats & metrics     |
| `/companies`       | `(dashboard)/companies/`     | Company management           |
| `/prospects`       | `(dashboard)/prospects/`     | Prospect/contact management  |
| `/templates`       | `(dashboard)/templates/`     | Email template editor        |
| `/send`            | `(dashboard)/send/`          | Email campaign sending       |
| `/scheduled`       | `(dashboard)/scheduled/`     | Scheduled email management   |
| `/history`         | `(dashboard)/history/`       | Email send history           |
| `/applications`    | `(dashboard)/applications/`  | Job application tracking     |
| `/settings`        | `(dashboard)/settings/`      | User settings & integrations |
| `/profile`         | `(dashboard)/profile/`       | User profile management      |
| `/users`           | `(dashboard)/users/`         | User management (admin)      |
| `/login`           | `login/`                     | Login page (public)          |
| `/signup`          | `signup/`                    | Signup page (public)         |

---

## Rules (ENFORCED)

1. **Each page is a `page.tsx` file** inside its route directory. Follow Next.js App Router conventions.
2. **All dashboard pages are client components** (`'use client'`). They use hooks and fetch data on mount.
3. **API calls MUST use `api.*` from `src/lib/api.ts`.** Never call `fetch()` directly.
4. **Page-specific UI stays in the page file.** Only extract to `src/components/` if reused across multiple pages.
5. **Style with Tailwind CSS v4.** No inline styles, no CSS modules, no component libraries.

### When Adding a New Page
1. Create `src/app/(dashboard)/<route>/page.tsx`
2. Add navigation entry in `src/components/Sidebar.tsx` (the `NAV` array)
3. Verify `src/middleware.ts` covers the route (dashboard routes are protected by default via the `(dashboard)` group)
4. Update `packages/frontend/README.md`
