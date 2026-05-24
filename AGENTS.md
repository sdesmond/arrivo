<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Packt — travel itinerary planner

**Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, PostgreSQL, Drizzle ORM, NextAuth v5 (credentials + JWT), shadcn/Base UI.
**Path alias:** `@/*` → `./src/*`.

## Windows

Use forward slashes in Bash: `C:/Users/spenc/dev/packt/`. Backslashes get eaten as escapes.

## DB commands (dev cycle)

```sh
npm run db:push     # push schema directly (dev shortcut, no migration files)
npm run db:seed     # idempotent; creates demo@packt.local / demo1234
npm run db:generate # SQL migration files from schema changes
npm run db:migrate  # apply pending migrations
npm run db:studio   # Drizzle Studio GUI on port 4983
```

## Testing

| Command                 | What                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| `npm test`              | vitest watch mode                                                      |
| `npm run test:coverage` | vitest with istanbul coverage (thresholds: 95% lines/fn, 90% branches) |
| `npm run test:e2e`      | playwright-bdd headless; requires `packt_e2e` DB                       |
| `npm run test:e2e:ui`   | playwright-bdd with UI mode                                            |

E2E specifics (from `playwright.config.ts`):

- Runs on port 3001 with `DATABASE_URL=E2E_DATABASE_URL`, `NEXT_DISTDIR=.next-e2e`, `UPLOAD_STUB=true`
- `global-setup.ts` truncates all tables and re-seeds before every run
- After schema changes, re-run `npm run db:migrate:e2e` to push to the E2E DB
- Auth state saved in `tests/e2e/.auth/user.json` via `auth.setup.ts`

## Conventions

- **Types:** all domain types in `src/data/types.ts` — import from there, don't redefine
- **Enums:** `const Foo = {} as const; type Foo = ...` — never the `enum` keyword
- **No `any`**, no single-letter vars (except loop `i`)
- **Unit tests** colocated next to source: `foo.ts` → `foo.test.ts`. E2E in `tests/e2e/` (Gherkin `.feature` + step `.ts`)
- **`cn()`** from `@/lib/utils` for className merging (no string concat)
- **Colors** via CSS custom properties only (`var(--accent-brand)`, etc.) — no hardcoded hex/rgb
- **Lucide icons** use `strokeWidth={1.5}`; icon buttons need `title`
- **Server actions** and `"use client"` as usual for Next.js App Router

## QA gate

Before committing, run `build-validator` agent (or `npx tsc --noEmit && npm run lint && npm run test:coverage && npm run build`).
`standards-check` agent does a full code quality sweep.

## Mandatory plan review

The `packt-plan-reviewer` **must** run after any BMad planning skill that produces a file (`create-story`, `create-prd`, `create-epics-and-stories`, etc.). It is not optional — the artifact is not final until reviewed. The reviewer is automatically invoked via the skill's `on_complete` hook when the resolver script at `_bmad/scripts/resolve_customization.py` is present (it exists). If for any reason the auto-invocation does not fire, run it manually: load the `packt-plan-reviewer` skill and pass the artifact path. Apply every BLOCKING fix found. Only WARNING-only or clean artifacts may proceed to implementation.

## Key files

- `src/auth.ts` — NextAuth config, exports `{ auth, signIn, signOut, handlers }`
- `middleware.ts` — protects all routes except `/sign-in`, `/sign-up`, `/api/auth`
- `src/db/schema.ts` — all tables (auth + trips/days/events/documents/collaborators/packing_items)
- `src/data/types.ts` — canonical TypeScript types
- `src/app/globals.css` — theme tokens
- `components.json` — shadcn config (style: `base-nova`, aliases: `@/components`, `@/components/ui`)

## Docker

Multi-stage build (`Dockerfile`). On boot, `docker-entrypoint.sh` runs `drizzle-kit migrate` then `node server.js`. Compose stack: `docker compose up -d --build`.
