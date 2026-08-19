# Frontend Components — Agentic Coding Rules

These rules apply to all files within `packages/frontend/src/components/`.

---

## Component Guidelines

### What belongs here?
- **Reusable UI components** used across multiple pages (e.g., `Sidebar`, `Combobox`, `ImportModal`).
- Components that encapsulate complex UI logic with their own state.

### What does NOT belong here?
- Page-specific UI that is only used in one page. Keep that inline in the page file.
- API calls — use `src/lib/api.ts` and pass data via props.

### Rules (ENFORCED)
1. **All components must be client components** — add `'use client'` at the top if they use hooks, event handlers, or browser APIs.
2. **Style with Tailwind CSS v4.** Do not use CSS modules or inline styles unless dynamic values require it.
3. **No external component libraries.** All UI is custom-built. Do not install shadcn/ui, MUI, Chakra, Ant Design, etc. without explicit user approval.
4. **Props must be typed.** Define an interface for the component's props. No `any` types.
5. **Naming:** PascalCase for component files and exports (e.g., `ImportModal.tsx` → `export default function ImportModal()`).

### When Adding a New Component
1. Create `src/components/<ComponentName>.tsx`
2. Import and use it in the relevant page(s)
3. If it's a navigation element: update `Sidebar.tsx` as needed
4. Update `packages/frontend/README.md`
