# Story 2.2: Date Range Change - Silent Extend & Displaced Events

Status: done

## Story

As a traveler,
I want the app to handle date range edits intelligently,
so that extending my trip adds days automatically and shortening it never silently destroys events.

## Acceptance Criteria

1. Given I edit the trip's date range to add dates at the end, then new empty day cards are silently added for the new dates and the trip end date advances with no confirmation dialog.
2. Given I edit the trip's date range to add dates at the start, then new empty day cards are silently added at the start, existing later days are renumbered, and the trip start date moves earlier with no confirmation dialog.
3. Given I shorten or shift the trip's date range such that one or more existing days would be removed, when none of those days contain events, notes, checklists, or event documents, then the affected day cards are silently removed and the stored trip dates remain synchronized with the remaining day rows.
4. Given I shorten or shift the trip's date range such that one or more affected days contain events, when I confirm the date change, then a warning appears listing the affected events and presenting "Delete events" and "Keep as unscheduled" actions before any destructive mutation occurs.
5. Given affected days also contain notes, checklists, or event documents, then the warning explicitly discloses what will be deleted; this content must never be removed silently via day-row cascade.
6. Given I choose "Keep as unscheduled", then displaced events are preserved on the trip, removed from the deleted dates, and rendered in a collapsible Unscheduled Events section above Day 1 while the affected day cards are deleted.
7. Given I choose "Delete events", then the affected events and any event documents tied to deleted dates are permanently deleted, affected day cards are removed, and no further confirmation is shown.
8. Given the Unscheduled Events section is present, then it appears above Day 1, is collapsible, and is not rendered when it has no events.
9. Given all events in the Unscheduled Events section are later deleted or reattached to scheduled days, then the section disappears automatically.
10. Given a warning is required, then the trip edit UI stays coherent: focus moves into the warning dialog, Escape and Cancel abort without persisted changes, and the trigger regains focus on close.

**FRs:** FR16, FR17, FR18
**Derived safety guardrail:** AC5 is required because `days` currently cascade-delete child itinerary data; date edits must preserve the non-silent destructive-content standard introduced in Story 2.1.

## Tasks / Subtasks

- [x] Replace metadata-only date saving with authoritative date-range synchronization in `src/app/(app)/trips/actions.ts` (AC: 1, 2, 3, 4, 5, 6, 7)
  - [x] Keep `updateTripMetadata(tripId, patch)` as the route entry point, but move date-handling into a single server-authoritative transaction that reads the current trip plus all existing day rows before deciding how to mutate.
  - [x] Reuse the established `requireUser()` and `assertTripAccess(tripId, user.id!, "editor")` pattern, and continue revalidating both `/trips/${tripId}` and `/trips` after successful mutations because detail rendering and list grouping both change.
  - [x] For pure extension at the start or end, silently insert new day rows with correct `dayNumber`, `label`, and ISO dates, preserving existing scheduled content and keeping the trip date fields synchronized with the first and last scheduled days.
  - [x] For shortening or shifting, compute the exact set of removed dates first. If every affected day is empty, delete those day rows silently and renumber the surviving schedule in the same transaction.
  - [x] If any affected day contains itinerary content, return a structured confirmation payload instead of mutating immediately. The payload must distinguish displaced events from other destructive content so the client can present accurate copy before the user chooses a path.
  - [x] Preserve the 45-day limit already enforced by `buildDayRows()` and surface a user-visible error if the edited range exceeds that limit.

- [x] Add a displaced-event persistence contract that the current schema can actually support (AC: 4, 5, 6, 8, 9)
  - [x] The current schema requires `events.dayId` and `getTripDetail()` only returns day-attached events. Introduce the minimal schema and type changes needed to persist events that no longer belong to a scheduled day while still belonging to the trip.
  - [x] Preserve enough metadata to render the Unscheduled Events section without losing context for rescheduling or deletion. At minimum, the persisted contract must keep trip ownership, event documents, and stable display ordering.
  - [x] Update canonical domain types in `src/data/types.ts`; do not define displaced-event shapes in route or component files.
  - [x] Update query and mapper code so scheduled days and unscheduled events are both loaded through the existing server-side read path instead of ad hoc client-side reconstruction.
  - [x] Ensure delete paths still clean up event documents when the user chooses the destructive branch, and ensure "Keep as unscheduled" never duplicates event rows.

- [x] Extend the trip detail editing flow to handle silent saves versus confirmation-required saves (AC: 1, 2, 4, 5, 6, 7, 10)
  - [x] `TripEditSheet` currently calls a synchronous `onSave` and closes immediately from `page-client.tsx`. Change that flow so a date edit can await the server result, keep the drawer/dialog experience coherent, and only dismiss automatically when no confirmation step is required.
  - [x] Reuse the existing dialog system (`AlertDialog`) for the warning path instead of introducing another modal primitive.
  - [x] The warning must list affected event names and disclose any other deleted content from those days. "Delete events" and "Keep as unscheduled" need explicit labels, keyboard dismissal, focus trapping, and focus return to the original save trigger.
  - [x] Surface failure states through the existing Sonner pattern used in `use-trip-detail-handlers.ts`, and block duplicate save submissions while the server action is pending.

- [x] Render and maintain the Unscheduled Events section in the itinerary (AC: 6, 8, 9)
  - [x] Extend the trip detail payload and itinerary components to render unscheduled events above Day 1 as a visually distinct, collapsible section that is hidden when empty.
  - [x] Preserve existing scheduled day rendering, initial Day 1 expansion, drag/drop event behavior, and trip-doc rendering for unaffected days.
  - [x] Keep section styling on the existing design-token system only; if icon-only controls are introduced for collapse or event actions, they must include `title` attributes and 44px minimum touch targets.
  - [x] Do not turn unscheduled events into stored trip status or any other derived field; section visibility remains derived from loaded data.

- [x] Preserve Story 2.1 and Epic 2 scope boundaries while covering the destructive edge cases (AC: all)
  - [x] Do not add Story 2.3 confetti or staggered-load animation work here.
  - [x] Do not create generic shared hooks or abstractions unless they have at least immediate multi-consumer value; keep range-sync helpers close to the trip actions they support.
  - [x] Do not silently discard notes, checklists, or event documents from removed days. If those content types cannot be preserved in the unscheduled model, the warning copy must explicitly state that they will be deleted on confirmation.
  - [x] Do not persist any derived trip status or day-count field; `getTripStatus()` and `getTripDays()` remain render-time derivations.

- [x] Add unit and E2E coverage for both the silent and confirmation-required paths (AC: all)
  - [x] Update `src/components/packt/trip-edit-sheet.test.tsx` for async save behavior, pending state, date-range submission, and confirmation-required handling.
  - [x] Update `src/app/(app)/trips/[tripId]/page-client.test.tsx` and `src/app/(app)/trips/[tripId]/trip-itinerary-view.test.tsx` for dialog orchestration, unscheduled section rendering, collapsible behavior, and the no-unscheduled-section state.
  - [x] If `DateRangePicker` behavior or props change, update `src/components/ui/date-range-picker.test.tsx` to preserve the existing no-end-before-start behavior and any new disabled/pending contract.
  - [x] Add route-level tests where practical around the date-sync server action result contract, even though `src/app/**` is excluded from coverage thresholds.
  - [x] Extend `tests/e2e/features/day-planning.feature` and `tests/e2e/steps/day-planning.steps.ts` with seeded scenarios for: extending at the end, extending at the start, shortening empty days silently, shortening with affected events then deleting them, and shortening with affected events then keeping them unscheduled.
  - [x] If schema changes are required for displaced events, run `npm run db:migrate:e2e` and update any E2E seed/setup data needed to assert persisted unscheduled-event behavior in the `packt_e2e` database.

### Review Findings

- [x] [Review][Patch] Trips-list editing still drops the new `confirmation-required` result and closes immediately, so destructive date-range changes from `/trips` cannot present the required warning flow [src/app/(app)/trips/use-trips-page-handlers.ts:126]
- [x] [Review][Patch] `updateTripMetadata()` can report a failure after the database mutation has already committed if the post-commit `@vercel/blob` import fails, which leaves the client believing the change did not persist [src/app/(app)/trips/actions.ts:308]
- [x] [Review][Patch] The new route-level tests stop at pure `date-sync` helpers and never exercise the `updateTripMetadata()` result contract or destructive branches required by the story [src/app/(app)/trips/actions.test.ts:167]
- [x] [Review][Patch] The added E2E coverage omits two explicit required scenarios: extending at the start and silently shortening empty removed days [tests/e2e/features/day-planning.feature:89]
- [x] [Review][Patch] Destructive resolution requests now verify that the current removed-content preview still matches the confirmation the user reviewed before deleting or unscheduling anything [src/app/(app)/trips/actions.ts:221]
- [x] [Review][Patch] One-day date selections now save as a one-day range and the sheet no longer sends empty-string date endpoints back to the server [src/components/packt/trip-edit-sheet.tsx:127]
- [x] [Review][Patch] The warning dialog only offers `Keep as unscheduled` when there are actually displaced events to preserve [src/components/packt/trip-edit-sheet.tsx:314]

## Dev Notes

### Epic Context And Scope

Epic 2 owns date-range synchronization, displaced-event handling, and creation delight. Story 2.1 already established the rule that content-bearing day removal cannot be silent. Story 2.2 extends that rule from the end-of-itinerary remove button to arbitrary date-range edits in the trip edit flow. Story 2.3 remains out of scope.

### Current Implementation Surfaces

| File | Current behavior | This story changes | Preserve |
| --- | --- | --- | --- |
| `src/app/(app)/trips/actions.ts` | `updateTripMetadata()` updates trip date fields directly and revalidates routes, but it does not add/remove day rows or inspect affected itinerary content. | Make date edits authoritative and transactional rather than metadata-only. | Existing auth guard pattern, budget conversion, `/trips` and detail revalidation. |
| `src/components/packt/trip-edit-sheet.tsx` | Holds local draft state, reuses `DateRangePicker`, and calls `onSave()` synchronously from the drawer footer. | Support async save/pending handling and confirmation-required results without prematurely closing the drawer flow. | Existing field layout, labels, and date-range picker reuse. |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | Owns edit-sheet open state and forwards `handleTripSave()` to the drawer. | Coordinate async save outcome, dialog state, and refreshed detail rendering. | Hero rendering, tab layout, and current handler wiring. |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` | Wraps server actions in React transitions and Sonner error handling. | Add an awaited result contract for trip date edits instead of fire-and-forget metadata saves. | Existing mutation error pattern and checklist/event/note handlers. |
| `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` | Renders scheduled day cards plus the Story 2.1 remove-day confirmation dialog. | Render the Unscheduled Events section and preserve the existing day-card stack below it. | Existing empty-state behavior, add/remove-day controls, and accessibility patterns. |
| `src/lib/queries.ts` | Loads trip days, day-bound events, docs, notes, and checklists from the DB into `TripDetailPayload`. | Load unscheduled/displaced events through the same server read path so the client receives one coherent payload. | Mapper usage, server-only data loading, and existing day ordering. |
| `src/db/schema.ts` | `events.dayId` is required and `days` cascade-delete events, notes, checklists, and event documents. | Supply the minimal persisted contract required for unscheduled events and safe destructive handling. | Existing trip/event/doc ownership and positional ordering invariants. |

### Architecture Guardrails

- Next.js 16 Server Functions are reachable by direct POST request, so authorization must remain inside every mutation path, including any new confirmation branch.
- Client-side Server Function invocations are currently dispatched and awaited one at a time in Next.js. Keep the full date-sync diff, destructive-content inspection, and resulting mutation inside a single server transaction/result contract instead of splitting it across multiple client-triggered actions.
- Continue using route-local `"use server"` action modules and Client Component transitions rather than introducing fetch-based API routes for this story.
- Keep all new domain types in `src/data/types.ts`, and keep derived UI state derived at render time rather than stored.

### Data Model And Persistence Risks

- The current app can only represent scheduled events because `events.dayId` is non-null and all trip detail reads group events by day row. Story 2.2 cannot satisfy "Keep as unscheduled" without a persisted displaced-event model.
- Day deletion already cascades to `events`, `documents`, `itinerary_notes`, and `itinerary_checklists`. Any path that removes day rows must inspect content first so the UI can disclose destructive consequences before the transaction runs.
- The persisted trip dates and scheduled day rows must stay synchronized after every branch:
  - Extend at end: append days and advance `endDate`
  - Extend at start: prepend days, renumber following rows, and move `startDate`
  - Shorten/shift: remove only the dates that fall outside the new range and recompute day numbering from 1

### UI And Accessibility Requirements

- `TripEditSheet` already has labeled fields and reuses `DateRangePicker`; keep that pattern. Any new warning dialog must move focus inside on open, support Escape/Cancel, and restore focus to the original trigger on close.
- Use design tokens only. No hardcoded colors, and no icon-only control without a `title`.
- If the unscheduled section uses collapse affordances or per-event actions, mobile targets must remain at least `44px` by `44px`.
- The warning dialog copy must be explicit about what is preserved versus what is deleted so destructive state is never communicated by color alone.

### Testing Expectations

- Covered `src/components/packt/**` files need colocated test updates because coverage thresholds remain `>=95%` lines/functions and `>=90%` branches.
- `src/app/**` is excluded from coverage metrics, but this story changes user-facing trip editing and itinerary rendering, so route-level tests are still warranted for regression control.
- E2E belongs in the existing day-planning feature/step files because this is a continuation of the itinerary-management flow introduced in Story 2.1.
- If the displaced-event persistence model changes the schema, re-run the E2E migration and keep the isolated seeded scenarios deterministic against `packt_e2e`.

### Previous Story Intelligence

- Story 2.1 added transactional add/remove-last-day mutations, list/detail revalidation, and explicit destructive confirmation for content-bearing last-day deletions. Story 2.2 must preserve that non-silent deletion standard for date edits as well.
- Story 2.1 kept the arbitrary date-edit drawer out of scope on purpose. The existing `updateTripMetadata()` path is therefore intentionally incomplete for itinerary sync and is the primary integration point for this story.
- The most recent implementation pattern uses focused route actions plus client transition wrappers rather than broad refactors. Stay in that pattern unless a schema constraint forces a narrowly scoped helper extraction.

### Git Intelligence

- Recent commits show this feature area progressing story by story: `9a8a96f feat: add and remove itinerary days` followed the pattern of scoped route updates plus E2E expansion, and the merge commit `8e34a34` indicates the branch was integrated without introducing a new architectural layer for itinerary mutations.

### Latest Technical Information

- Next.js 16's mutation guidance still supports calling Server Functions from Client Component event handlers, but it explicitly warns that those functions are directly reachable by POST and should enforce auth inside the server function itself.
- Next.js 16 removed `next lint`; this repo's `npm run lint` remains the correct validation command.
- The local Next.js 16 docs note that client-dispatched Server Functions are currently processed one at a time. That is another reason to return one structured result from the date-edit mutation instead of trying to coordinate multiple sequential server calls from the client.
- Drizzle transaction guidance continues to favor one transaction per logical invariant. Here, the invariant is that trip dates, scheduled day rows, displaced-event persistence, and destructive cleanup decisions resolve together or not at all.

### Project Structure Notes

- No separate `_bmad-output/architecture.md` or UX shard was present in this repo. This story uses `_bmad-output/epics.md`, `_bmad-output/project-context.md`, current source files, local Next.js 16 docs, and existing tests as the authoritative context set.
- Keep any range-sync helper close to `src/app/(app)/trips/actions.ts` unless it immediately serves multiple route action entry points. Creating a new generic library abstraction for a single consumer would be out of scope.

### References

- [Source: `_bmad-output/epics.md` - Epic 2, Story 2.2, FR16-FR18, NFR3, UX-DR5]
- [Source: `_bmad-output/project-context.md` - Next.js, TypeScript, Server Actions, Database & ORM, Testing]
- [Source: `_bmad-output/implementation-artifacts/2-1-add-day-remove-last-day.md` - Story 2.1 scope boundaries, destructive-content guardrails, existing mutation pattern]
- [Source: `src/app/(app)/trips/actions.ts` - current `updateTripMetadata()` behavior and route-level mutation pattern]
- [Source: `src/components/packt/trip-edit-sheet.tsx` - date-range editing UI and current synchronous save contract]
- [Source: `src/app/(app)/trips/[tripId]/page-client.tsx` - edit drawer ownership and itinerary/tab composition]
- [Source: `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` - transition and Sonner mutation pattern]
- [Source: `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` - itinerary rendering and confirmation-dialog pattern]
- [Source: `src/lib/queries.ts` - trip detail loading path and current day-bound event shape]
- [Source: `src/db/schema.ts` - day/event/document cascade relationships]
- [Source: `src/components/ui/date-range-picker.tsx` - current date picker behavior and range-selection contract]
- [Source: `tests/e2e/features/day-planning.feature`, `tests/e2e/steps/day-planning.steps.ts` - existing itinerary E2E extension points]
- [Source: `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` - Server Function security and client invocation behavior]
- [Source: `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` - Next.js 16 lint removal and current mutation/runtime notes]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `resolve_customization.py` config path fallback was required because `_bmad/bmm/config.yaml` is not present in this repo.

### Completion Notes List

- Implemented transactional date-range synchronization with confirmation-required branching for destructive edits.
- Added displaced-event persistence via nullable `events.dayId`, `displacedDate`, and unified scheduled-plus-unscheduled trip detail loading.
- Updated trip edit flow to await saves, preserve drawer state across confirmation, and render a collapsible Unscheduled Events section.
- Added route, component, and E2E coverage for silent extension, silent empty-day removal, keep-unscheduled, and delete-events paths.
- Generated and applied the E2E schema migration; `npm test -- --run`, `npm run build`, `npm run lint`, and `npm run test:e2e` passed.

### File List

- `drizzle/0001_marvelous_moon_knight.sql` (new)
- `src/app/(app)/trips/date-sync.ts` (new)
- `src/app/(app)/trips/actions.ts` (update)
- `src/app/(app)/trips/actions.test.ts` (new)
- `src/app/(app)/trips/page-client.tsx` (update)
- `src/app/(app)/trips/[tripId]/page-client.tsx` (update)
- `src/app/(app)/trips/[tripId]/page-client.test.tsx` (update)
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` (update)
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` (update)
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.test.tsx` (update)
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` (update)
- `src/components/packt/trip-edit-sheet.tsx` (update)
- `src/components/packt/trip-edit-sheet.test.tsx` (update)
- `src/data/types.ts` (update)
- `src/db/schema.ts` (update)
- `src/lib/db-mappers.ts` (update)
- `src/lib/db-mappers.test.ts` (update)
- `src/lib/queries.ts` (update)
- `tests/e2e/features/day-planning.feature` (update)
- `tests/e2e/steps/day-planning.steps.ts` (update)

### Change Log

- 2026-05-24: Implemented Story 2.2 date-range synchronization, displaced-event handling, confirmation flow, migration, and automated validation.
