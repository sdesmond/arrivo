# Packt — Claude Code Instructions

@AGENTS.md

## Memory
Store all memories in this project at `\.claude\memory\` instead of the default user-level path. This keeps project memory within the repo.

## Project Overview

Packt is a travel itinerary planning app built with Next.js (App Router), TypeScript, Tailwind CSS v4, and shadcn/Base UI components. The Next.js project lives at the repo root.

**Run the dev server:** `npm run dev`

## Directory Structure

```
packt/                          ← git root = Next.js project root
├── src/
│   ├── app/
│   │   ├── globals.css         ← theme tokens + custom utilities
│   │   ├── layout.tsx          ← font setup, providers
│   │   └── (app)/trips/        ← main app routes
│   ├── components/
│   │   ├── packt/              ← domain components (trip cards, event rows, etc.)
│   │   └── ui/                 ← reusable primitives (button, badge, dialog, etc.)
│   ├── data/
│   │   ├── types.ts            ← ALL canonical TypeScript types live here
│   │   └── *.ts                ← sample trip data
│   └── lib/
│       └── utils.ts            ← cn(), isEventPast(), isEventNow()
├── tsconfig.json               ← strict: true, path alias @/* → ./src/*
├── eslint.config.mjs
└── .claude/
    └── agents/                 ← project-specific review agents
```

## Quality Agents — When to Use Them

These agents enforce project standards. Use them as described below — don't skip them.

| Agent | When to invoke |
|---|---|
| `typescript-reviewer` | After adding or modifying types, interfaces, or any `.ts`/`.tsx` file |
| `component-reviewer` | After creating or significantly modifying a component in `src/components/` |
| `ui-reviewer` | After implementing new UI or making significant visual/styling changes |
| `build-validator` | Before considering any task complete |
| `standards-check` | Before committing — this is the pre-commit gate |

**Default workflow for any coding task:**
1. Implement the change
2. Run `build-validator` to catch lint/tsc/build errors
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
