# Packt — Claude Code Instructions

@AGENTS.md

## Response Style Rules
- NEVER start a sentence with "Let me", "Let's", or "I'll" — use imperative fragments instead ("Investigating", "Running tests", "Found X in Y")
- One sentence per mid-task update; state the action or finding only
- No end-of-turn summary unless explicitly asked — if the result is visible in the diff, don't restate it
- No introductions, filler, or pleasantries
- Code requests: output code only, no preamble
- Exploratory questions ("what should we do?"): 2–3 sentences max, recommendation + tradeoff, no headers


## Memory
Store all memories in this project at `\.claude\memory\` instead of the default user-level path. This keeps project memory within the repo.

## Project Overview

Packt is a travel itinerary planning app built with Next.js (App Router), TypeScript, Tailwind CSS v4, and shadcn/Base UI components. The Next.js project lives at the repo root.

**Run the dev server:** `npm run dev`

## Test Commands

| Command | What it runs |
|---|---|
| `npm test` | Vitest unit tests (watch mode) |
| `npm run test:coverage` | Vitest with Istanbul coverage report |
| `npm run test:e2e` | Playwright BDD E2E tests (headless) |
| `npm run test:e2e:ui` | Playwright E2E with interactive UI |

Coverage thresholds: 95% lines/functions, 90% branches (enforced in CI).

## Directory Structure

```
packt/                          ← git root = Next.js project root
├── src/
│   ├── app/
│   │   ├── globals.css         ← theme tokens + custom utilities
│   │   ├── layout.tsx          ← font setup, providers
│   │   └── (app)/trips/        ← main app routes
│   ├── components/
│   │   ├── packt/              ← domain components; *.test.tsx lives next to source
│   │   └── ui/                 ← reusable primitives (button, badge, dialog, etc.)
│   ├── data/
│   │   ├── types.ts            ← ALL canonical TypeScript types live here
│   │   └── *.ts                ← sample trip data
│   └── lib/
│       ├── utils.ts            ← cn(), isEventPast(), isEventNow()
│       └── *.test.ts           ← unit tests colocated with source files
├── tests/
│   └── e2e/
│       ├── features/           ← Gherkin .feature files (BDD scenarios)
│       ├── steps/              ← step definitions (TypeScript)
│       ├── fixtures.ts         ← shared Playwright fixtures
│       └── auth.setup.ts       ← auth state setup (runs before chromium project)
├── vitest.config.mts           ← Vitest + Istanbul coverage config
├── vitest.setup.mts            ← global mocks (next/navigation, next/headers)
├── playwright.config.ts        ← Playwright BDD config (playwright-bdd)
├── tsconfig.json               ← strict: true, path alias @/* → ./src/*
├── eslint.config.mjs
└── .claude/
    └── agents/                 ← project-specific review agents
```

## Quality Agents — When to Use Them

These agents enforce project standards. Use them as described below — don't skip them.

### Plan-time agents (run before ExitPlanMode)

| Agent | What it checks |
|---|---|
| `plan-component-reviewer` | Component sizing, splitting, placement, and interface requirements |
| `plan-accessibility-reviewer` | A11y requirements and design token correctness |
| `plan-architecture-reviewer` | Server/client decisions, derived state, utilities reuse, data flow |
| `plan-scope-reviewer` | Ensures plan doesn't exceed the original request |
| `plan-test-reviewer` | Ensures plan includes tests for every covered file touched |

### Post-implementation agents

| Agent | When to invoke |
|---|---|
| `typescript-reviewer` | After adding or modifying types, interfaces, or any `.ts`/`.tsx` file |
| `component-reviewer` | After creating or significantly modifying a component in `src/components/` |
| `ui-reviewer` | After visual/styling changes — static code review only (design tokens, a11y, spacing, etc.) |
| `desktop-reviewer` | After visual changes — browser test at 1280px; run sequentially with `mobile-reviewer` (NOT in parallel — they share one Playwright browser) |
| `mobile-reviewer` | After visual changes — browser test at 390px; run sequentially with `desktop-reviewer` (NOT in parallel — they share one Playwright browser) |
| `build-validator` | Before considering any task complete |
| `standards-check` | Before committing — this is the pre-commit gate |

**Default workflow for planning:**
Before calling ExitPlanMode, invoke all plan-reviewer agents **IN PARALLEL** (single message, multiple tool calls):
- `plan-component-reviewer` — pass the plan file path
- `plan-accessibility-reviewer` — pass the plan file path
- `plan-architecture-reviewer` — pass the plan file path
- `plan-scope-reviewer` — pass the plan file path and summarize the original user request
- `plan-test-reviewer` — pass the plan file path and summarize the original user request

Address any BLOCKING findings by revising the plan and re-running the affected reviewer(s). Only call ExitPlanMode after all reviewers pass or every BLOCKING issue is resolved.

Only present the plan to the user after the reviewers have seen it and made any necessary changes. 

**Default workflow for any coding task:**
1. Implement the change **and write/update the colocated test file** — tests are part of the same step, not an afterthought
   - New/modified file in `src/lib/**` or `src/components/packt/**` → update or create `*.test.ts` / `*.test.tsx` alongside it
   - New user-facing flow (auth, trip CRUD, day planning) → add or extend a `.feature` + step file in `tests/e2e/`
2. Run `build-validator` to catch lint/tsc/build/test errors
3. Run the relevant focused reviewer(s) for what changed
4. Fix any flagged issues, then re-validate
5. Run `standards-check` before the final commit

## Key Conventions

### TypeScript
- All domain types live in `src/data/types.ts` — import from there, don't redefine
- Enums: const object + union type (`const Foo = {} as const; type Foo = ...`) — never the `enum` keyword
- No `any` types; no single-letter variable names (except `for` loop `i`)
- Optional fields use `?:` not `| undefined`
- ISO 8601 dates/times; durations always in minutes as `number`

### Components
- `"use client"` at top of all interactive components
- Always define an explicit `ComponentNameProps` interface before the function
- Destructure props in the function signature
- Use `cn()` from `@/lib/utils` for className merging — never string concatenation

### Styling
- Colors: always via CSS custom properties (`var(--fg)`, `var(--accent-brand)`, etc.) — no hardcoded hex/rgb
- Tailwind for static layout/spacing; inline `style` for dynamic or theme-aware values
- No arbitrary Tailwind values (`text-[14px]`) — use inline styles instead
- Lucide icons: `strokeWidth={1.5}` always; icon buttons need a `title` attribute
- Font variables need fallbacks: `var(--font-body, ui-sans-serif)`

### File Placement
- Domain logic → `src/components/packt/`
- Reusable primitives → `src/components/ui/`
- New types → `src/data/types.ts`
- New utilities → `src/lib/utils.ts`

### Testing
- Unit test files live **next to their source file** (`foo.tsx` → `foo.test.tsx`); never under a separate `__tests__/` directory
- E2E goes in `tests/e2e/` only — Gherkin features in `features/`, step definitions in `steps/`
- Use Vitest (`vitest`, `@testing-library/react`) for unit/component tests
- Use `playwright-bdd` + Playwright for E2E — write scenarios in `.feature` files, implement in step `.ts` files
- Global mocks for `next/navigation` and `next/headers` are in `vitest.setup.mts` — don't re-mock per-file
- Coverage is enforced (`test:coverage`): maintain ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`
- `src/components/ui/**`, `src/lib/auth-helpers.ts`, `src/lib/queries.ts`, and `src/lib/server-now.ts` are excluded from coverage
