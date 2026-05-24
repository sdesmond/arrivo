# Story 1.1: New Trip Modal

Status: done

Completion note: Ultimate context engine analysis completed - comprehensive developer guide created.

## Story

As a traveler,
I want to open a New Trip modal from the trips list and fill in a title, optional date range, and optional budget,
so that I have a frictionless, intentional entry point for starting a new trip.

## Acceptance Criteria

1. Given I am on the trips list page, when I click the "New Trip" button in the header, then the New Trip modal opens.
2. Given I am on the trips list page with no trips, when I click the empty-state CTA, then the same New Trip modal opens.
3. Given the modal is open, then the title field is focused automatically with no tap or click required.
4. Given the modal is open, then it displays a title field, a date range picker, and a budget field, all visible upfront with no progressive disclosure.
5. Given the title field is empty, then the Create button is disabled.
6. Given I have typed at least one character in the title field, then the Create button is enabled.
7. Given the title field is empty and the form is submitted, then an inline validation message appears near the title field; the failure is never silent.
8. Given the date range picker is open, when I attempt to set an end date earlier than the start date, then the picker rejects the selection and the date values remain unchanged.
9. Given the budget field, when I type non-numeric characters, then those characters are not accepted.
10. Given the modal is open, when I click Cancel or press Escape, then the modal closes and no trip is created.

## Tasks / Subtasks

- [x] Add a reusable New Trip modal component (AC: 3, 4, 5, 6, 7, 8, 9, 10)
  - [x] Create `src/components/packt/new-trip-dialog.tsx` as a Client Component with `"use client"` as the first line.
  - [x] Use existing `Dialog` primitives from `src/components/ui/dialog.tsx`; do not introduce a new modal library or duplicate dialog primitives.
  - [x] Use `Input`, `Button`, `Section`, and `Field` patterns already used by `TripEditSheet`.
  - [x] Use existing `DateRangePicker` from `src/components/ui/date-range-picker.tsx`; do not build another date range UI.
  - [x] Implement local draft state for title, optional `startDate`, optional `endDate`, and optional budget amount.
  - [x] Focus the title input every time the dialog opens.
  - [x] Keep Create disabled when the raw title is empty; use trimmed title for submit validation.
  - [x] Show inline title validation through `Field` or equivalent accessible markup near the title field.
  - [x] Filter budget input so persisted draft value is numeric currency only; allow clearing the field.
  - [x] Ensure Cancel, close button, and Escape close the modal and reset unsaved draft state.
- [x] Wire both trips-list entry points to the same modal instance (AC: 1, 2, 10)
  - [x] Add open state in `src/app/(app)/trips/page-client.tsx`.
  - [x] Update `Topbar` in `src/components/packt/trips-topbar.tsx` to accept an `onNewTrip` callback and call it from the desktop "New trip" button.
  - [x] Update mobile header New Trip icon button in `page-client.tsx` to open the same dialog.
  - [x] Update `NewTripCard` in `src/components/packt/new-trip-card.tsx` to accept an `onClick`/`onNewTrip` callback and open the same dialog.
  - [x] Keep existing trip-list layout, section grouping, and edit-trip sheet behavior intact.
- [x] Define the modal submit contract without completing Story 1.2 persistence (AC: 10)
  - [x] Prefer a typed local interface in the modal such as `NewTripDraft` unless a shared domain input is required by the implementation.
  - [x] The modal may call a provided `onCreate(draft)` callback, but this story should not implement navigation, database writes, day generation, or loading state from Story 1.2.
  - [x] If temporarily no-oping the Create submit, keep validation complete and avoid creating any trip.
- [x] Add focused tests beside changed components (AC: 1-10)
  - [x] Add `src/components/packt/new-trip-dialog.test.tsx`.
  - [x] Update `src/components/packt/trips-topbar.test.tsx` for the New Trip callback.
  - [x] Update `src/components/packt/new-trip-card.test.tsx` for the empty-state callback.
  - [x] Add or update a trips page client test only if callback wiring cannot be covered through component tests.
  - [x] Cover title autofocus, all fields visible, Create disabled/enabled state, inline validation, budget character filtering, date picker callback behavior, and cancel/escape close without submit.

## Dev Notes

### Source Context

- The epics file defines Epic 1 as New Trip Creation and Story 1.1 as the modal-only entry point for title, optional date range, optional budget, validation, and cancel behavior. [Source: `_bmad-output/epics.md#Story 1.1: New Trip Modal`]
- Functional requirements covered by this story: FR1, FR2, FR3, FR4, FR5, FR6, FR19, FR20. [Source: `_bmad-output/epics.md#FR Coverage Map`]
- UX requirements: all modal fields visible upfront, no progressive disclosure, title autofocus, and the modal acts as the intentional commitment gate before a trip exists. [Source: `_bmad-output/epics.md#UX Design Requirements`]
- This story precedes Story 1.2, which owns server action completion, persistence, navigation, pending state, day generation, and landing on the trip page with Day 1 expanded. Do not pull Story 1.2 behavior into Story 1.1. [Source: `_bmad-output/epics.md#Story 1.2: Create Trip Server Action & Initial Trip Page`]

### Current Implementation Snapshot

- `src/app/(app)/trips/page.tsx` is the server page. It calls `requireUser()`, gets `now` via `getServerNow()`, loads trips/profile, derives `dateFormat`, and passes serializable props to `TripsPageClient`.
- `src/app/(app)/trips/page-client.tsx` is the interactive trips-list surface. It currently owns `editingTrip`, renders `Topbar`, desktop `NewTripCard`, mobile New Trip icon button, and `TripEditSheet`.
- `Topbar` currently renders the desktop "New trip" button but has no callback prop. Add a prop rather than introducing global state.
- `NewTripCard` currently renders the empty-state CTA-style button but has no callback prop. Add a prop and preserve hover behavior.
- `TripEditSheet` already demonstrates field grouping, date range reuse, budget numeric inputs, and save/cancel structure. Reuse its patterns where appropriate, but build a modal rather than a right-side drawer.
- `DateRangePicker` already uses `react-day-picker` range mode and normalizes selections to `yyyy-MM-dd`. It handles first-click behavior for existing ranges and closes after both dates are selected. Story 1.1 should reuse and, if needed, harden this component rather than creating a second range picker.
- `Field` in `src/components/packt/form-section.tsx` already supports inline errors via `role="status"` and `aria-live="polite"` when `htmlFor` is supplied.

### Architecture Guardrails

- Next.js is 16.2.4 with App Router and React 19.2.4. This codebase intentionally uses `page.tsx` for Server Components and `page-client.tsx` for Client Components. [Source: `_bmad-output/project-context.md#Next.js`]
- Interactive files must put `"use client"` as the first line. Next.js docs for this installed version state that the directive declares the client boundary and must appear before imports. [Source: `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`]
- Client Component props crossing from a Server Component must be serializable. Keep callbacks inside the client subtree (`TripsPageClient` -> `Topbar`/`NewTripCard`/`NewTripDialog`), not from `page.tsx`.
- Use App Router only. Do not add Pages Router files or API routes.
- Do not import `src/lib/queries.ts` or `src/lib/auth-helpers.ts` into Client Components; both are server-only patterns. [Source: `_bmad-output/project-context.md#Server-only Modules`]
- Styling must use CSS custom properties and existing Tailwind token utilities; do not add hardcoded hex/rgb colors or arbitrary Tailwind values. [Source: `_bmad-output/project-context.md#Styling`]
- Lucide icons must use `strokeWidth={1.5}`; icon-only buttons need a `title` attribute. [Source: `_bmad-output/project-context.md#Styling`]
- All component props need an explicit `ComponentNameProps` interface before the component function. [Source: `_bmad-output/project-context.md#Components`]
- Use `cn()` from `@/lib/utils` for className merging when needed.

### Data And Future-Story Constraints

- Current `CreateTripInput` in `src/data/types.ts` requires `startDate` and `endDate`, and current DB schema has `trips.startDate` and `trips.endDate` as `notNull()`. Epic 1 requires dateless trips later. Story 1.1 should keep modal draft dates optional without forcing placeholder dates; Story 1.2 must reconcile the domain/schema contract.
- Existing `createTrip` in `src/app/(app)/trips/actions.ts` persists a trip and collaborator immediately, but currently does not create day rows or navigate. Story 1.1 should not call it unless the implementation deliberately scopes submit as a no-op callback; persistence belongs to Story 1.2.
- Trip status is computed from dates via `getTripStatus`; never store or edit status in the modal.
- Budget values in DB are numeric strings; UI draft values should remain parseable and Story 1.2 should convert according to existing action/mapping rules.

### Testing Requirements

- Use Vitest and React Testing Library for this story. Next.js installed docs note Vitest is suitable for unit testing synchronous Server and Client Components, while async Server Components are better suited to E2E. [Source: `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`]
- Project convention places unit tests next to source files, not under `__tests__`. [Source: `_bmad-output/project-context.md#Unit Tests (Vitest)`]
- Avoid E2E for behavior covered by unit tests; this story is mostly component interaction and should be unit-testable. [Source: `_bmad-output/project-context.md#Testing`]
- If testing the page client proves necessary, mock server actions/imports rather than making DB calls.
- Existing tests use `// @vitest-environment jsdom` for DOM component tests and `userEvent` for interaction. Follow that local pattern.

### Project Structure Notes

- Expected new file: `src/components/packt/new-trip-dialog.tsx`.
- Expected new test: `src/components/packt/new-trip-dialog.test.tsx`.
- Expected updates: `src/app/(app)/trips/page-client.tsx`, `src/components/packt/trips-topbar.tsx`, `src/components/packt/trips-topbar.test.tsx`, `src/components/packt/new-trip-card.tsx`, `src/components/packt/new-trip-card.test.tsx`.
- Avoid changing DB schema, mappers, server action semantics, navigation, day creation, unscheduled section grouping, or trip detail pages in this story.
- There are no previous story files for Epic 1, so no prior story implementation learnings apply.
- Recent git history is planning/cleanup oriented (`c9d2787 initial brainstorming and planning`, `0813b23 Merge pull request #22 from sdesmond/deferred-work`), not a prior implementation pattern for this feature.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npm test -- --run src/components/packt/new-trip-dialog.test.tsx src/components/packt/trips-topbar.test.tsx src/components/packt/new-trip-card.test.tsx src/components/ui/date-range-picker.test.tsx`
- `npm run lint -- src/components/packt/new-trip-dialog.tsx src/components/packt/trips-topbar.tsx src/components/packt/new-trip-card.tsx 'src/app/(app)/trips/page-client.tsx' src/components/ui/date-range-picker.tsx`

### Completion Notes List

- Added a controlled New Trip dialog with title autofocus, visible title/date/budget fields, inline title validation, numeric budget filtering, and a typed `NewTripDraft` submit contract.
- Wired desktop topbar, mobile header, and empty-state card entry points to one trips-page dialog state without adding persistence, navigation, or day generation.
- Hardened `DateRangePicker` to reject an attempted end-date selection earlier than the in-progress start date.

### File List

- `src/components/packt/new-trip-dialog.tsx`
- `src/components/packt/new-trip-dialog.test.tsx`
- `src/app/(app)/trips/page-client.tsx`
- `src/components/packt/trips-topbar.tsx`
- `src/components/packt/trips-topbar.test.tsx`
- `src/components/packt/new-trip-card.tsx`
- `src/components/packt/new-trip-card.test.tsx`
- `src/components/ui/date-range-picker.tsx`
- `src/components/ui/date-range-picker.test.tsx`

### Review Findings

- [x] [Review][Decision] AC 2 — Mobile empty-state CTA: resolved — desktop-only; mobile header icon (AC 1) is sufficient for mobile new-trip entry
- [x] [Review][Patch] Missing E2E coverage — BLOCKING: added `tests/e2e/features/new-trip.feature` + `tests/e2e/steps/new-trip.steps.ts` covering topbar open, cancel, and Escape
- [x] [Review][Patch] Whitespace-only title enables Create button then errors on submit — fixed: `disabled={draft.title.trim().length === 0}` [`src/components/packt/new-trip-dialog.tsx`]
- [x] [Review][Patch] sanitizeBudget passes through "." and "1." — fixed at submit: `budgetAmount?.replace(/\.$/, "") || undefined` in `handleSubmit` [`src/components/packt/new-trip-dialog.tsx`]
- [x] [Review][Patch] window.setTimeout timer not cleaned up — fixed: timer ID stored and cleared in useEffect cleanup [`src/components/packt/new-trip-dialog.tsx`]
