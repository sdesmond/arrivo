---
project_name: 'Packt'
user_name: 'Spencer'
date: '2026-05-22'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
status: 'complete'
rule_count: 51
optimized_for_llm: true
---

# Project Context for AI Agents

_Critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.4 — **has breaking changes from earlier versions** |
| UI Runtime | React | 19.2.4 |
| Language | TypeScript | 5.x, `strict: true` |
| Styling | Tailwind CSS | v4 (not v3 — different config syntax) |
| UI Primitives | @base-ui/react | ^1.4.1 |
| UI Components | shadcn (+ CVA) | ^4.6.0 / ^0.7.1 — components in `src/components/ui/` |
| Date Utilities | date-fns + react-day-picker | ^4.2.1 / ^10.0.1 |
| ORM | Drizzle ORM | ^0.45.2 |
| Database | PostgreSQL via postgres.js | ^3.4.9 |
| Auth | Auth.js (next-auth) | v5.0.0-beta.31 |
| Auth Adapter | @auth/drizzle-adapter | ^1.11.2 |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable | ^6.3.1 / ^10.0.0 |
| Icons | lucide-react | ^1.14.0 |
| File Storage | @vercel/blob | ^2.4.0 |
| Notifications | sonner | ^2.0.7 |
| Theme | next-themes | ^0.4.6 |
| Unit Tests | Vitest + @testing-library/react | ^4.1.6 / ^16.3.2 |
| E2E Tests | Playwright BDD (playwright-bdd) | ^8.5.1 |
| CSS Utils | clsx + tailwind-merge | — |
| Migrations | drizzle-kit | ^0.31.10 |

---

## Critical Implementation Rules

### Next.js

- **Read the docs before writing any Next.js code**: `node_modules/next/dist/docs/` — this version has breaking changes from common training data patterns. Heed deprecation notices.
- App Router only — no Pages Router. Route groups: `(app)` = authenticated, `(auth)` = unauthenticated.
- **page.tsx = Server Component** (data fetching, auth); **page-client.tsx = Client Component** (`"use client"`) — this split is the established pattern throughout the app.
- `"use client"` must be the very first line of any interactive component file.

### TypeScript

- **All domain types live exclusively in `src/data/types.ts`** — never redefine types elsewhere; always import from there.
- **Enums are const objects + union types** (never the `enum` keyword):
  ```ts
  export const TripStatus = { Draft: "draft", Upcoming: "upcoming" } as const;
  export type TripStatus = (typeof TripStatus)[keyof typeof TripStatus];
  ```
- `strict: true` is enforced — no `any` types.
- No single-letter variable names (except `for` loop `i`).
- Optional fields use `?:` not `| undefined`.
- Dates: ISO 8601 strings (`"YYYY-MM-DD"` or `"YYYY-MM-DDTHH:mm:ssZ"`). Times: `"HH:mm"`. Durations: always minutes as `number`.
- Path alias `@/*` resolves to `./src/*`.

### Components

- Every component must define an explicit `ComponentNameProps` interface before the function.
- Destructure all props in the function signature.
- Use `cn()` from `@/lib/utils` for className merging — never string concatenation.
- **UI primitives**: `src/components/ui/` holds both `@base-ui/react`-backed and shadcn components. Use whichever the existing component file already uses; don't mix within a single component.

### Styling

- **Colors: always via CSS custom properties** — never hardcoded hex/rgb values.
  - Packt tokens: `var(--bg)`, `var(--surface)`, `var(--surface-2)`, `var(--surface-3)`, `var(--line)`, `var(--line-strong)`, `var(--fg)`, `var(--fg-2)`, `var(--fg-3)`, `var(--fg-4)`, `var(--accent-brand)`, `var(--accent-soft)`, `var(--accent-fg)`, `var(--accent-ink)`
  - shadcn tokens also available: `var(--background)`, `var(--foreground)`, `var(--primary)`, `var(--muted)`, `var(--border)`, etc.
  - Tailwind utility names map to these tokens via `globals.css` `@theme` block — e.g., `text-fg`, `bg-surface`
- Tailwind for static layout/spacing; inline `style` for dynamic or theme-aware values.
- **No arbitrary Tailwind values** (`text-[14px]`, `w-[350px]`) — use inline styles instead.
- Lucide icons: always `strokeWidth={1.5}`; icon-only buttons must have a `title` attribute.
- Font variables need fallbacks: `var(--font-body, ui-sans-serif)`, `var(--font-heading-family, ui-serif)`.

### Theme

- `ThemeProvider` from `next-themes` wraps the entire app in `layout.tsx`. The `<html>` element must have `suppressHydrationWarning` to prevent theme-class mismatch errors.
- Never call `document.documentElement.classList` directly to toggle dark mode — use `next-themes` APIs.

### Database & ORM (Drizzle)

- Schema defined in `src/db/schema.ts` using `drizzle-orm/pg-core`. All tables use `uuid().primaryKey().default(sql\`gen_random_uuid()\`)`.
- DB client singleton in `src/db/index.ts` — uses `globalThis.__pgClient` to survive hot reloads in dev. Never create a second postgres connection.
- **Numeric DB fields** (cost, budget): stored as `numeric` string in Postgres. Convert with `.toString()` on insert/update; parse back to `number` in `db-mappers.ts`.
- `position: integer` field orders events within a day — always maintain this when creating/reordering.
- **DB mapper layer** in `src/lib/db-mappers.ts`: `dbTripToType()`, `dbEventToType()`, `dbDocToType()`, `dbCollabToType()` — always use these when reading from DB; never map raw DB rows directly in queries or actions.

### File Storage (Vercel Blob)

- Use `put(name, file, { access: "public" })` from `@vercel/blob` to upload; `del(url)` to delete.
- **E2E stub**: guard every `put()` and `del()` call with `process.env.UPLOAD_STUB !== "true"`. When `UPLOAD_STUB=true`, skip the real Blob call and return a placeholder URL. This env var is set automatically in `playwright.config.ts` webServer env.
- `del()` calls must also be guarded in cascade paths — `deleteEvent` and trip deletions that remove `documents` rows via SQL cascade do NOT call `del()`; blob cleanup must be done explicitly before the cascade.

### Notifications (Sonner)

- Toast notifications use `sonner`. Import: `import { toast } from "sonner"`. Use `toast.error(message)` for failures, `toast.success(message)` for confirmations.
- `<Toaster richColors position="bottom-center" />` is mounted once in `layout.tsx` — never add another `<Toaster>`.
- **In unit tests**: mock the module: `vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))`. Import the mock after: `const { toast } = await import("sonner")`.

### Server Actions

- Action files use `"use server"` at top and live alongside their route: e.g., `src/app/(app)/trips/[tripId]/actions.ts`.
- **Every action must call `requireUser()` then `assertTripAccess()`** before any read or write — defense-in-depth even if query layer also checks.
- Always call `revalidatePath(\`/trips/\${tripId}\`)` after any mutation.
- Import action types from `@/data/types`, not locally redefined.

### Server-only Modules

- `src/lib/queries.ts` and `src/lib/auth-helpers.ts` both import `"server-only"` — never import these from client components.
- `assertTripAccess()` calls `notFound()` (not `throw`) when access is denied.
- `requireUser()` calls `redirect("/sign-in")` when unauthenticated — no manual null checks needed after calling it.

### Auth (Auth.js v5)

- User's `id` from session is typed as `string | undefined` — always use `user.id!` with the non-null assertion after `requireUser()` (which guarantees presence).
- Access roles: `"viewer" < "editor" < "owner"`. Default minimum for most writes is `"editor"`.

### Trip Status

- **TripStatus is ALWAYS computed from dates** using `getTripStatus(startDate, endDate, now)` from `@/lib/utils`.
- Never store trip status as a DB field, never hard-code it in seed data, never let users edit it.
- `TripStatus` has four values: `draft | upcoming | active | past` — but `getTripStatus()` only returns `upcoming | active | past`; `draft` is reserved for future use.

### Date/Time Handling

- **Never use `new Date()` directly** in components or utils for "now" — use `getNow()` from `@/lib/mock-date` (server/util context) or `useNow()` from `@/components/providers/mock-date-provider` (component context). This enables the dev date-picker and test determinism.
- `getNow()` is dev-only interceptible; in production it falls through to `new Date()`.
- Server pages should pass `nowISO` as a prop to client components rather than letting them call `getNow()` directly.

### Testing

**Testing Pyramid — layer assignment is mandatory**
- Unit tests (Vitest): logic, component rendering, utility functions, derived state — anything that can be exercised without a browser or live server.
- E2E tests (playwright-bdd): **only** user-facing behavior that cannot be covered by a unit test — full flows that cross server/client boundaries (auth, trip CRUD, navigation).
- **No duplication across layers**: if a unit test already covers a behaviour, do not write an E2E test for the same thing. Each behaviour lives in exactly one layer.
- Tests must be written alongside the code — never deferred. A feature is not done until its tests exist and pass.

**Unit Tests (Vitest)**
- Test files live next to their source: `foo.tsx` → `foo.test.tsx` in the same directory. Never place under a separate `__tests__/` directory.
- Do NOT re-mock `next/navigation` or `next/headers` per file — global mocks are already set up in `vitest.setup.mts`.
- Test environment is `node` in vitest config; `@testing-library/react` handles component rendering.
- Coverage thresholds: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`.
- Excluded from coverage: `src/lib/auth-helpers.ts`, `src/lib/queries.ts`, `src/lib/server-now.ts`, `src/components/ui/**`, `src/app/**`.

**E2E Tests (playwright-bdd)**
- All E2E goes in `tests/e2e/` only: Gherkin `.feature` files in `features/`, step implementations in `steps/`.
- E2E runs via `bddgen && playwright test` — `bddgen` must run first to generate test files from `.feature` files.
- Playwright uses a `setup` project for auth state (`tests/e2e/auth.setup.ts`) which must complete before the `chromium` project runs. Auth state stored at `tests/e2e/.auth/user.json`.
- Base URL: `http://localhost:3001` — E2E dev server runs on port 3001 (not 3000).
- E2E webServer env includes `UPLOAD_STUB=true` — Vercel Blob calls are bypassed automatically in all E2E runs.

### Development Workflow

- **Branches**: named by intent of the work (e.g. `add-test-database`, `fix-event-clear-button`) — descriptive kebab-case
- **Commits**: Conventional Commits format (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`, etc.)
- **PRs**: always feature branches — never push directly to `main`; use merge commits (not squash)

### File Placement

| What | Where |
|------|-------|
| Domain types | `src/data/types.ts` |
| Reusable utilities | `src/lib/utils.ts` |
| Domain components | `src/components/packt/` |
| UI primitives | `src/components/ui/` |
| Server queries | `src/lib/queries.ts` |
| DB schema | `src/db/schema.ts` |
| DB mappers | `src/lib/db-mappers.ts` |
| Server Actions | `src/app/(app)/trips/[route]/actions.ts` |
| E2E features | `tests/e2e/features/` |
| E2E steps | `tests/e2e/steps/` |

---

## Usage Guidelines

**For AI Agents:** Read this file before implementing any code. Follow all rules exactly. When in doubt, prefer the more restrictive option. Flag new patterns to the human for review rather than inventing conventions.

**For Humans:** Keep this lean — add rules only when a pattern is non-obvious or an agent has gotten it wrong. Remove rules that become obvious over time. Update when the stack changes.

_Last Updated: 2026-05-22_
