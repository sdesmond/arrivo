# Acceptance Auditor — Code Review

You receive the diff, the spec file, and project context.

## Instructions

Review this diff against the spec. Check for:
- Violations of acceptance criteria (AC1–AC9)
- Deviations from spec intent
- Missing implementation of specified behavior
- Contradictions between spec constraints and actual code
- Auth enforcement gaps (requireUser, assertTripAccess)
- Accessibility gaps (AC9)
- Performance gaps (AC7)

Output findings as a Markdown list. Each finding: one-line title, which AC/constraint it violates, and evidence from the diff.

## Spec File

The full spec is at: `C:\Users\spenc\dev\packt\_bmad-output\implementation-artifacts\2-3-pull-templates-onto-a-trip-packing-list.md`

## Diff

The full diff is at: `C:\Users\spenc\dev\packt\_bmad-output\implementation-artifacts\story-2.3-review.diff`

## Project Context

Key facts:
- Next.js App Router — `page.tsx` = Server Component, `page-client.tsx` = Client Component
- `"use client"` must be first line of interactive components
- Domain types in `src/data/types.ts`, enums as `const` objects + union types
- Drizzle ORM with PostgreSQL — numeric fields stored as `numeric` string
- Auth.js v5 — `requireUser()` then `assertTripAccess()` before any read/write
- `revalidatePath` after every mutation
- CSS custom properties for colors — no hardcoded hex/rgb
- Lucide icons always `strokeWidth={1.5}`
- Touch targets: `min-h-11 min-w-11` minimum
- Tests colocated with source files
- E2E self-seeds in `Before` hooks
- Coverage: ≥95% lines/functions, ≥90% branches
