# Story 2.1: Add Day & Remove Last Day

Status: done

## Story

As a traveler,
I want to add days to the end of my trip and remove the last day from the itinerary,
so that I can adjust trip length directly from the itinerary without touching the date picker.

## Acceptance Criteria

1. Given a scheduled trip has at least one day, when I view the itinerary, then an "Add Day" button is visible below the final day card.
2. Given I click "Add Day", when the mutation succeeds, then exactly one empty day is appended with the next calendar date and next `dayNumber`, and the trip end date advances to that new date.
3. Given a single-day trip was created with a start date but no stored end date, when I add a day, then the start date is preserved and the end date becomes the appended day's date so that the trip becomes a valid two-day range.
4. Given the trip has more than one day, then a "Remove Day" control is rendered for the last day only and is not available on preceding day cards.
5. Given the final day has no events, notes, or checklists and more than one day remains, when I activate "Remove Day", then that day is deleted and the trip end date becomes the preceding day's date.
6. Given the trip has exactly one day, when I activate "Remove Day", then a confirmation dialog appears stating that removing the only day marks the trip as unscheduled, with "Cancel" and "Remove Day" actions.
7. Given the only-day dialog is open, when I confirm "Remove Day", then the day is removed, both trip dates are cleared, and after returning to the trips list the trip appears in the Unscheduled section; when I choose Cancel, no persisted data changes.
8. Given the final day contains any event, note, checklist, or attached event document, when I activate "Remove Day", then the app must disclose that planned content will be deleted and require explicit destructive confirmation before deleting; it must never rely silently on database cascades. The "Keep as unscheduled" displaced-event workflow remains in Story 2.2.
9. Given an add or remove mutation is pending, then its initiating control is disabled or shows pending state so duplicate day mutations cannot be issued.
10. Given either mutation succeeds, then the refreshed trip detail hero and itinerary show matching dates/day count, and `/trips` derives the trip into its correct scheduled or Unscheduled section.

**FRs:** FR13, FR14, FR15
**Derived safety guardrail:** AC8 is required because removing `days` currently cascades child planning data; destructive user data must not disappear without disclosure and confirmation.

## Tasks / Subtasks

- [x] Add atomic day-length server mutations in `src/app/(app)/trips/[tripId]/actions.ts` (AC: 2, 3, 5, 7, 8, 10)
  - [x] Implement `addDay(tripId)` using `requireUser()` and `assertTripAccess(tripId, user.id!, "editor")`, reading the authoritative last day/trip in the server action rather than accepting dates from the client.
  - [x] In one `db.transaction`, insert exactly one final `days` row and update `trips.endDate`; derive its ISO date from the existing final scheduled day, set `label` to the next `Day N`, and preserve existing days/items unchanged.
  - [x] Handle start-date-only one-day trips by advancing from the existing day date and storing the resulting end date; reject inconsistent missing-day/missing-date input with visible UI failure rather than corrupting date/day sync.
  - [x] Retain the established 45-day trip limit from `create-trip-days.ts`; surface a user-visible failure if appending would exceed it.
  - [x] Implement `removeLastDay(tripId, confirmedDestructiveRemoval?)` from the authoritative final day. In a transaction, delete only the last day and update `endDate` to the preceding day date, or clear `startDate` and `endDate` when no day remains.
  - [x] Before destructive deletion, query child events, notes, and checklists and their associated document implications; require the UI-confirmed destructive path whenever any planned content exists. Do not implement Story 2.2 unscheduled-event storage in this story.
  - [x] Revalidate both `/trips/${tripId}` and `/trips` after successful date/day mutations because detail rendering and list section/status classification both change.

- [x] Keep `DayCard` within the component-size guardrail while exposing a last-day removal control (AC: 4, 5, 6, 8, 9)
  - [x] `src/components/packt/day-card.tsx` is already 241 lines before this story. Before adding last-day behavior, extract its open-body timeline/draft rendering into a cohesive `src/components/packt/day-card-body.tsx` client component with an explicit `DayCardBodyProps` interface.
  - [x] Thread an optional remove callback/state only for the final day into `DayCard` and `DayCardHeader`; do not render a remove control for any non-final card.
  - [x] Update `src/components/packt/day-card.test.tsx` and `src/components/packt/day-card-header.test.tsx`, and add `src/components/packt/day-card-body.test.tsx` for behavior moved by the required split.

- [x] Wire controls and confirmation UI through the existing trip detail flow (AC: 1, 4, 6, 7, 8, 9)
  - [x] In `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`, render "Add Day" only after a non-empty scheduled day list and coordinate dialog state for remove confirmation; reuse the existing `AlertDialog` UI primitive rather than adding another dialog system.
  - [x] Give visible-text buttons clear names; if a remove affordance is icon-only, add a descriptive `title` and accessible name. Dialogs must be keyboard-dismissible, move focus inside on open, and restore focus to the trigger on close.
  - [x] Propagate add/remove handlers through `trip-detail-tab-body.tsx`, `page-client.tsx`, and `use-trip-detail-handlers.ts`, following the current event/note/checklist handler path and React transition pattern.
  - [x] Disable the initiating control while the corresponding server mutation is pending and show failure feedback with the existing Sonner pattern.

- [x] Preserve scope boundaries and existing behaviors (AC: all)
  - [x] Do not change `TripEditSheet` date-range saving in this story; automatic synchronization for arbitrary range edits and displaced-event storage are Story 2.2.
  - [x] Do not add confetti or staggered entrance behavior; those belong to Story 2.3.
  - [x] Do not store a trip status field or introduce new domain types unless an actual new persisted/client contract is required; status remains derived through `getTripStatus`.
  - [x] Preserve existing event, note, checklist, drag-and-drop, document, Day 1 initial expansion, and Unscheduled list behavior for retained days.

- [x] Add automated coverage for the user flow and high-risk mutation boundaries (AC: all)
  - [x] Add/update colocated component tests for modified covered components: `day-card.test.tsx`, `day-card-header.test.tsx`, and new `day-card-body.test.tsx`; test last-only control rendering, callbacks, accessible labels, pending/disabled treatment where owned, and preserved extracted timeline behavior.
  - [x] Add route-level unit tests where practical for `TripItineraryView`/handler wiring and dialog decisions, even though `src/app/**` is excluded from coverage thresholds.
  - [x] Extend `tests/e2e/features/day-planning.feature` and `tests/e2e/steps/day-planning.steps.ts` with seeded, isolated scenarios for appending a day, removing an empty final day, canceling/removing the only day into Unscheduled, and confirming destructive removal for a populated final day.
  - [x] Verify database assertions in E2E for end-date/day-row synchronization and no mutation after cancel; do not rely on visual checks alone for the atomic persistence contract.

### Review Findings

- [x] [Review][Defer] Client-side destructive confirmation is not bound to the server-authoritative last day [src/app/(app)/trips/[tripId]/actions.ts:280] — deferred, pre-existing rationale: acceptable concurrency edge case for now
- [x] [Review][Defer] Removing the only day leaves the empty itinerary action buttons as silent no-ops [src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx:95] — deferred, pre-existing rationale: button functionality will come later
- [x] [Review][Patch] After the only day is removed, the detail hero still derives `UPCOMING TRIP` from null dates instead of reflecting the unscheduled state shown on `/trips`. [src/app/(app)/trips/[tripId]/page-client.tsx:52]

## Dev Notes

### Epic Context And Boundaries

Epic 2 covers itinerary structure adjustment and creation delight. This story owns direct add/remove controls and safe removal confirmation. Story 2.2 owns arbitrary date-range edits plus the "Keep as unscheduled" event displacement section. Story 2.3 owns post-creation animation. A remove action that silently deletes content would undermine Story 2.2 and violate the feature's non-destructive intent, so AC8 closes the immediate cascade-delete hole without creating unscheduled-event storage early.

### Existing Implementation To Extend

| File | Current behavior | This story changes | Preserve |
| --- | --- | --- | --- |
| `src/app/(app)/trips/[tripId]/actions.ts` | Server action module for day item, document, and checklist mutations; each action authorizes writes and revalidates the detail route. | Add day-length mutations and list revalidation. | `requireUser()` + access checks, existing item positions, document cleanup behavior, existing actions. |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` | Converts view callbacks to server actions inside `React.startTransition`. | Add add-day/remove-day handlers and pending/error coordination as needed. | Existing event/note/checklist handler behavior. |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | Renders hero date/day count from `detail.trip`, supplies handlers to tab body, mounts edit sheet. | Pass structural handlers/pending state to itinerary. | Hero/tab/edit interactions and newly-created expansion. |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Routes itinerary props to `TripItineraryView`. | Thread new add/remove props only. | Existing tab selection and document filtering. |
| `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` | Renders day cards or an empty-state set of add-item controls. | Add end-of-list Add Day action and removal confirmation ownership. | Current empty state is not a first-day creator; do not promise dateless-day creation in this story. |
| `src/components/packt/day-card.tsx` | Renders card header plus timeline/draft interactions; already near component size limit. | Split body first, then pass last-day removal behavior. | Existing drag/drop, draft insertion, date rendering, expansion state. |
| `src/components/packt/day-card-header.tsx` | Owns toggle/subtitle editing header UI. | Surface last-day-only removal affordance with accessible labeling. | Toggle and subtitle keyboard behavior. |
| `src/app/(app)/trips/actions.ts` | `createTrip()` transaction uses `buildDayRows()`; `updateTripMetadata()` currently updates dates without day synchronization. | Reference only; no arbitrary range-edit changes in Story 2.1. | Creation and existing edit behavior until Story 2.2. |
| `src/db/schema.ts` | `days` are unique by `(tripId, dayNumber)`; children reference a day with cascade deletion. | No schema change expected. | Never assume deleting a populated day is harmless. |

### Mutation Contract

- Add and remove are server-authoritative and transactional: day row and trip date fields must commit or roll back together.
- An appended day is empty; it has no events, notes, or checklists and does not modify existing `position` values.
- For a normal removal with at least two days, the remaining final day determines the stored `endDate`. For removal of the only day, store both dates as `null`/cleared through the existing update convention.
- Content-bearing last days require explicit destructive confirmation in this story. Do not silently cascade-delete events, notes, checklists, or event documents; do not invent an unscheduled-events table or section ahead of Story 2.2.
- The existing edit drawer still permits date metadata updates without synchronizing days. Keep it out of this implementation rather than partially mixing Story 2.2 logic into the direct-control actions.

### Architecture Compliance

- Next.js version is installed as `16.2.4`. Keep mutations in `"use server"` action modules; Client Components invoke those actions through event handlers/transitions. Server Functions are directly callable POST endpoints, so authorization belongs inside every new action.
- Use literal `revalidatePath(`/trips/${tripId}`)` and `revalidatePath("/trips")` in the server action after successful mutation.
- Use existing Drizzle `db.transaction` patterns; no client-side optimistic write is sufficient for the persisted date/day invariant.
- All interactive files begin with `"use client"`. Import canonical domain types from `@/data/types`; use const-object union conventions if a genuinely new domain type is required.
- Use CSS variables only, `cn()` for conditional classes, and `strokeWidth={1.5}` for Lucide icons.
- Do not use `new Date()` as "now"; calendar arithmetic for persisted supplied dates is not a current-time read. Continue passing server-derived `nowISO` for status display.

### Component And Accessibility Guardrails

- `DayCard` is 241 lines before this story and cannot safely absorb additional structural UI. The body extraction is required because this story modifies that card.
- Use existing `Button` and `AlertDialog` primitives. A destructive confirm action must be visibly named; cancel must leave the dialog and data unchanged.
- Last-day removal must not be conveyed by color alone. Include text or an accessible label, and make every mobile add/remove target at least `44px` by `44px`.
- Keep the confirmation copy explicit when content exists so assistive technology users receive the deletion consequence before confirming.

### Testing Requirements

- Covered `src/components/packt/**` changes require colocated tests because coverage gates enforce at least 95% line/function and 90% branch coverage.
- Route files are excluded from coverage calculation, but the transaction and dialog path carry sufficient regression risk to require targeted tests/E2E.
- E2E should seed its own multi-day and single-day trips through hooks, then validate rows/dates in the E2E DB after UI actions. Existing `day-planning.feature` and step setup are the correct extension points.
- Run `npm run test:coverage`, `npm run test:e2e`, `npm run lint`, and `npm run build` before implementation is marked complete. Re-run `npm run db:migrate:e2e` only if implementation unexpectedly changes schema.

### Previous Work And Git Intelligence

- Story 1.2 established optional trip dates, transaction-based creation, `?new=1` expansion of Day 1, and a dateless detail empty state.
- Story 1.3 established that cleared dates place a trip in the Unscheduled list section; it specifically retained computed status and separates dateless entries before status filtering.
- Recent commits `2484891` (Story 1.2) and `d23960d` (Story 1.3) show the pattern to follow: scoped route action updates, extracted client components when a file nears its size limit, colocated tests, and Gherkin E2E coverage.

### Latest Technical Information

- The installed Next.js 16 documentation requires authentication/authorization in each Server Function because it is reachable by direct request, and documents `revalidatePath` for updating affected page data after server mutations.
- Next.js 16 removed `next lint`; this repository already supplies its own `npm run lint`, which remains the correct verification command.
- Drizzle transaction semantics are required here because a day-row operation and the trip-date operation form one persistence invariant.

### References

- [Source: `_bmad-output/epics.md` - Epic 2 and Story 2.1; FR13-FR18; NFR3]
- [Source: `_bmad-output/project-context.md` - Server Actions, Database & ORM, Testing, Components, Trip Status]
- [Source: `src/app/(app)/trips/[tripId]/actions.ts` - existing authorized itinerary mutations and revalidation pattern]
- [Source: `src/app/(app)/trips/actions.ts` - trip mutation and day-generation transaction pattern]
- [Source: `src/app/(app)/trips/create-trip-days.ts` - date/day row creation and 45-day cap]
- [Source: `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`, `page-client.tsx`, `use-trip-detail-handlers.ts` - current UI propagation path]
- [Source: `src/components/packt/day-card.tsx`, `day-card-header.tsx` - final-day control integration surface]
- [Source: `src/db/schema.ts` - day uniqueness and cascade relationships]
- [Source: `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` - Server Function security and mutation behavior]
- [Source: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md` - literal path invalidation behavior]
- [Source: `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` - Next.js 16 breaking changes]
- [External: Next.js documentation, https://nextjs.org/docs/app/getting-started/updating-data]
- [External: Drizzle ORM transactions, https://orm.drizzle.team/docs/transactions]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Scope explicitly protects against silent cascade deletion of content on a removed final day.
- Added transactional add/remove-day mutations with destructive-content confirmation and list/detail revalidation.
- Added final-day controls, pending/error handling, and focused component, route, and E2E coverage.
- Automated build validation and E2E passed; required desktop/mobile browser review remains blocked because the configured in-app browser and Playwright MCP surface are unavailable.

### File List

- `src/app/(app)/trips/[tripId]/actions.ts` (update)
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` (update)
- `src/app/(app)/trips/[tripId]/page-client.tsx` (update)
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` (update)
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` (update)
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.test.tsx` (new)
- `src/components/packt/day-card.tsx` (update)
- `src/components/packt/day-card.test.tsx` (update)
- `src/components/packt/day-card-body.tsx` (new)
- `src/components/packt/day-card-body.test.tsx` (new)
- `src/components/packt/day-card-header.tsx` (update)
- `src/components/packt/day-card-header.test.tsx` (update)
- `src/data/types.ts` (update)
- `tests/e2e/features/day-planning.feature` (update)
- `tests/e2e/steps/day-planning.steps.ts` (update)
- `tests/e2e/steps/documents.steps.ts` (update)
- `tests/e2e/steps/event-docs.steps.ts` (update)
- `tests/e2e/steps/preferences-date-format.steps.ts` (update)
- `tests/e2e/steps/trips.steps.ts` (update)

### Change Log

- 2026-05-24: Implemented add/remove-last-day itinerary controls, transactional mutations, destructive confirmation handling, and automated coverage; retained `in-progress` status pending browser visual review.
