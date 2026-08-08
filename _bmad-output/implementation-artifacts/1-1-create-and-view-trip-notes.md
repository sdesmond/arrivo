---
baseline_commit: ecfe9df19219272eae5ff6f3ce99836ada71f2dc
---

# Story 1.1: Create and view Trip Notes

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trip collaborator,
I want to open a Notes tab on my trip and add discrete notes to it,
so that I can capture planning thoughts immediately without deciding whether they belong in a Day Note or a Document.

Epic: Epic 1 — Trip Notes. This is the **first story** in the epic; it builds the foundation (DB, types, mapper, query, create action, Notes tab UI, empty state, collapsed list, autosave-create) that Stories 1.2 (expand/edit), 1.3 (delete), and 1.4 (reorder) will build on. Design the create flow so the same editor is reusable for edit (1.2) and the `position` column is ready for reorder (1.4).

## Acceptance Criteria

From `_bmad-output/planning-artifacts/epics.md` (Story 1.1) — implement verbatim; all map to the FReqs/UX-DRs in parentheses.

- **AC-1** (FR-7, UX-DR2): Given a trip with zero Notes — When a collaborator with trip access activates the existing `notes` tab value on trip detail (`TripDetailTab.Notes`, already reserved in `resolveTripDetailTab`/`buildTripDetailTabHref` but currently renders a "Notes coming soon." placeholder) — Then the Notes panel renders the existing Packt `Empty` icon/title/description/action composition with a `New Note` action, and **no always-visible capture bar**.
- **AC-2** (FR-1): Given the empty Notes tab — When the collaborator activates `New Note` and types only whitespace/nothing into title and body, then moves focus away from the editor composite — Then **no Note is created** and the empty state remains.
- **AC-3** (FR-1, UX-DR3, UX-DR11): Given the empty or populated Notes tab — When the collaborator activates `New Note` (empty-state action or the persistent upper-right compact outline action once Notes exist) and enters a non-blank title and/or body, then blurs the full editor composite or collapses it — Then a `notes` row is persisted via a new server action that calls `requireUser()` then `assertTripAccess()` and `revalidatePath` on success, the Note appears at the top of the list (newest-first), and status is announced once via a polite live region ("Note saved").
- **AC-4** (FR-1, FR-2): Given a Note with a title but no body — When it renders collapsed in the list — Then the title displays as both the title and the preview line — never an empty-preview state.
- **AC-5** (FR-2, UX-DR4): Given a Note with no title — When it renders collapsed in the list — Then its first body line displays as the implicit title, and the row is never title-only. This is an intentional deviation from Packing List's title-only collapse; do **not** "correct" it.
- **AC-6** (FR-2): Given one or more Notes exist — When the collaborator views the Notes tab at any point before, during, or after the trip's date range — Then the list renders identically with no date-dependent mode switch.
- **AC-7** (UX-DR3, UX-DR12): Given the populated Notes tab — When rendered on desktop or mobile viewports, including 320 CSS px width and 200% text resize — Then the `New Note` action, and every row's interactive elements, remain at least **44×44px** and the layout reflows without two-dimensional scrolling.
- **AC-8** (Additional Requirements): Given the new `notes` DB table and mapper — When Notes are created for a trip — Then each row stores a `position: integer` column following the existing Itinerary/Packing List ordering convention, ready to support manual reordering added later in this epic.
- **AC-9** (FR-1, UX-DR6, UX-DR9, UX-DR10): Given the empty or populated Notes tab — When the collaborator enters a non-blank title and/or body and the create request fails — Then the editor stays open with the dirty value intact, a persistent linked inline error appears, a Retry control is focused, and a Failure toast supplements the inline error — the Note is not added to the list.

## Tasks / Subtasks

- [x] DB schema: add `notes` table + `position` index (AC-8)
  - [x] `src/db/schema.ts`: `notes` pgTable (trip-scoped, mirrors `itinerary_notes` but keyed on `tripId`)
  - [x] Apply schema: `npm run db:push` (dev DB) and `npm run db:migrate:e2e` (E2E DB)
- [x] Types: add `TripNote`, `CreateTripNoteInput` to `src/data/types.ts` (AC-3, AC-8)
- [x] Mapper: add `dbTripNoteToType()` to `src/lib/db-mappers.ts` + tests (AC-8)
- [x] Query: fetch notes in `getTripDetail` (`src/lib/queries.ts`) + `notes` on `TripDetailPayload` (AC-3, AC-6)
- [x] Preview logic: `src/lib/note-preview.ts` pure helpers + tests (AC-4, AC-5)
- [x] Server action: `createTripNote(tripId, input)` in `src/app/(app)/trips/[tripId]/actions.ts` (AC-3, AC-8, AC-9)
  - [x] `requireUser()` → `assertTripAccess(tripId, user.id!, "editor")` → transaction (`lockTripForUpdate`) → shift positions → insert at top → `revalidatePath`
- [x] Client components under `src/components/packt/` (prefixed `trip-notes-` so one feature-map glob covers them):
  - [x] `trip-notes-tab.tsx` — empty state / populated header action / ordered list / create-draft management (AC-1–AC-7)
  - [x] `trip-notes-editor.tsx` — reusable title+body editor composite with blur-commit, blank-discard, `aria-busy`, inline error + Retry (AC-2, AC-3, AC-9)
  - [x] `trip-notes-row.tsx` — collapsed row: glyph + title/implicit-title + one-line preview (AC-4, AC-5, AC-7)
- [x] Wire-up:
  - [x] Split `page-client.tsx` (currently 332 lines, over the ~250 JSX guideline — component-review gate): extract the tab bar (lines ~207-235) into a new `src/app/(app)/trips/[tripId]/trip-detail-tab-bar.tsx` client component (`TripDetailTabBarProps` interface, `"use client"`, 44px targets) BEFORE threading the notes prop. E2E: `trip-detail-tab*` is a SHARED_GLOBS path, so the new file already forces the full suite; `src/app/**` is excluded from coverage, so no colocated unit test is required for the extracted file (keep `trip-detail-tab-body.test.tsx`/`page-client.test.tsx` passing).
  - [x] `page.tsx` / `page-client.tsx` — destructure + pass `notes` (AC-1)
  - [x] `trip-detail-tab-body.tsx` — replace placeholder branch with `<TripNotesTab>` (AC-1)
- [x] E2E: `tests/e2e/features/trip-notes.feature` (`@feat:trip-notes`) + `trip-notes.steps.ts` (AC-1–AC-5)
  - [x] Register `entry("trip-notes", ...)` in `tests/e2e/feature-map.mjs`
  - [x] Update `trip-tabs.steps.ts` Notes case from `"Notes coming soon."` to the real panel marker
- [x] Unit tests: colocated tests for every new/changed file (see Testing Requirements)

## Dev Notes

### The tab already exists — you are filling in a placeholder

`TripDetailTab.Notes = "notes"` is already reserved and fully wired (URL param `?tab=notes`, `resolveTripDetailTab`, `buildTripDetailTabHref`, popstate sync, back/forward). The **only** gap is `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx:266-268`, which renders a placeholder:

```tsx
{activeTab === "notes" && (
  <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>Notes coming soon.</div>
)}
```

Replace that branch with `{activeTab === "notes" && (<TripNotesTab tripId={tripId} notes={notes} />)}`. The `TABS` array in `page-client.tsx` already includes `{ id: "notes", label: "Notes" }` — do not add a second Notes tab.

### Anti-collision guardrails — names already taken (CRITICAL)

The codebase already has day-scoped note machinery. Do **not** reuse or collide with these names:

| Concept | Existing (day-scoped) | You create (trip-scoped) |
| --- | --- | --- |
| DB table | `itineraryNotes` (table `itinerary_notes`, `src/db/schema.ts:361`) | `notes` (table `notes`, keyed on `tripId`) |
| Domain type | `Note` (`tripDayId`), `ItineraryNote` (`src/data/types.ts:454-471`) | `TripNote` (`tripId`) |
| DB mapper | `dbNoteToType` (`src/lib/db-mappers.ts:299`) | `dbTripNoteToType` |
| Server actions | `createNote`/`updateNote`/`deleteNote` (`[tripId]/actions.ts:480-521`) | `createTripNote` (this story); `updateTripNote`/`deleteTripNote` come in 1.2/1.3 |

Also: `trips.notes` (`src/db/schema.ts:100`, a `text` column on the trips table mapped to `Trip.notes`) is **unrelated** free-text metadata with no UI, no position, no autosave. Do **not** reuse it, extend it, or remove it. The feature gets its own table.

### Position strategy (AC-8, ready for 1.4)

- `position: integer`, `0` = top. Display order = `ORDER BY position ASC` in the query.
- **New Note inserts at the top**: inside `db.transaction`, call `lockTripForUpdate(tx, tripId)` first, then shift existing rows down (`UPDATE notes SET position = position + 1 WHERE trip_id = X`), then `INSERT` with `position: 0`.
- This mirrors the existing `createEvent` insert-at-position branch (`[tripId]/actions.ts`) and the `position + 1` raw-SQL shift pattern in `shiftItemsAtOrAbove`. Story 1.4 will rewrite positions via a reorder action — the schema shape must not change then.

### Server action contract (AC-3, AC-9)

Add to `src/app/(app)/trips/[tripId]/actions.ts` (the file is already a SHARED_GLOBS path, so no feature-map change is needed for the action):

```ts
export async function createTripNote(tripId: string, input: CreateTripNoteInput): Promise<void>
```

Body, following the file's existing style exactly (see `createNote`/`updateNote`/`deleteNote` at lines ~480-521 and `createEvent` at 126-174):

1. `const user = await requireUser();`
2. `await assertTripAccess(tripId, user.id!, "editor");` — "editor" minimum, matching other mutating actions (inherits the trip's existing role model; no per-note permissions).
3. Guard: trim `input.title`/`input.body`; if both are blank, `throw new Error("Note is blank")` (defense-in-depth — the client already discards blank drafts, but the action must not persist empty rows).
4. Persist trimmed `title`/`body` (no length caps — FR-1 explicitly allows unbounded title/body).
5. `db.transaction` → `lockTripForUpdate` → shift → insert at position 0.
6. `revalidatePath(\`/trips/${tripId}\`)`. Returns `void`.
7. Errors are thrown (plain `Error`), matching the file's style — no `{ ok }` envelope, no zod (the repo has zero zod; validation is manual trim/throw).

No new action file — add to the existing `[tripId]/actions.ts`. That file is excluded from coverage, so coverage thresholds don't apply there, but keep `actions.test.ts` updated (it already covers the day-note actions).

### Data flow / refresh

`getTripDetail` (`src/lib/queries.ts:327-525`) fetches everything in parallel. Add a parallel fetch:

```ts
const tripNotes = await db.select().from(notes).where(eq(notes.tripId, tripId)).orderBy(notes.position);
```

map with `dbTripNoteToType`, and add `notes: tripNotes.map(dbTripNoteToType)` to the returned `TripDetailPayload`. Add `notes: TripNote[]` to the interface in `src/data/types.ts:656-666`. After a successful `createTripNote`, `revalidatePath` makes Next.js 16 re-render the current view automatically (Server Functions update the UI immediately for the affected path) — no manual `router.refresh()` is required, matching how the day-note actions work today. Do **not** do optimistic local insertion; the list must reflect server-confirmed state (UX-DR11).

### Collapsed row rendering (AC-4, AC-5) — pure preview helpers

Create `src/lib/note-preview.ts` with pure functions (colocated test; `src/lib/**` coverage thresholds apply: ≥95% lines/functions, ≥90% branches):

- `getNoteTitle(note)` → trimmed `title` if non-blank, else the first **non-empty** line of `body`, else `""`.
- `getNotePreviewLine(note)` → first **non-empty** line of `body`; if none, `getNoteTitle(note)`.

Using the first *non-empty* line (rather than literal `split("\n")[0]`) preserves the invariant "every row shows a non-empty preview line" when a body starts with a blank line. These rules produce, for every persisted Note, non-empty title and preview:
- title + body → title as title, first body line as preview
- title only → title as both title and preview (AC-4)
- no title + body → first body line as implicit title and as preview (AC-5)

Render the preview line as single-line clamped text with word-breaking (`line-clamp-1` + `overflow-wrap: anywhere`) so long unbroken strings wrap instead of causing horizontal scroll at 320 CSS px / 200% text size (UX-DR12, AC-7). Never truncate the stored body.

### Autosave-create editor (AC-2, AC-3, AC-9) — UX-DR6 semantics

`trip-notes-editor.tsx` is a single inline, borderless editor composite (title input + body textarea). No Save button, no saved badge, no boxed inputs. This component must be built so Story 1.2 can reuse it for edit mode.

- **Blur = focus leaves the complete composite**: wrap in a container; on blur check `event.relatedTarget` / `containerRef.contains(...)` (focus-within semantics). Moving between title and body must NOT commit.
- **Commit** (title/body non-blank): serialize latest values → set `aria-busy` on the composite → announce delayed "Saving note" → call `createTripNote`. On success: announce "Note saved" **exactly once** via a polite live region, close the draft. On failure: keep editor open with dirty value intact, persistent linked inline error, **Retry** focused, and `toast.error(...)` (failure toast supplements, never replaces, the inline error — UX-DR9).
- **Blank discard** (AC-2): both title and body blank/whitespace on blur → no action, no row, focus returns to the `New Note` control (UX-DR10).
- **Announcements**: use the existing Packt sr-only polite-region pattern — `<div aria-live="polite" className="sr-only"><span key={announcementId}>{text}</span></div>` (keyed span so re-announcement fires; precedent: `packing-list-view.tsx`, `page-client.tsx`). Never announce optimistic state as saved; never announce the same mutation twice.
- **Field labels**: the editor has no visible labels (inline, borderless), but every form field must still be programmatically labeled — `aria-label="Note title"` on the title input and `aria-label="Note body"` on the body textarea.
- Focus into the editor lands on the **title field** (UX-DR10).
- No debounce/timer autosave exists anywhere in the app and none should be introduced — commit is blur/Enter only, matching `NoteItem`, `PlaceRowNoteEditor`, and `ReservationInlineTextField`.
- Tab-switch-away while a save is in flight: the blur fires before the tab button click completes focus transfer, so the commit starts; the in-flight server action is not cancelled by the editor unmounting, and `revalidatePath` refreshes the tree. Do not add unmount-save side effects; the blur commit is the source of truth.

### Empty state + header action (AC-1, AC-7)

- Zero Notes → existing Packt `Empty` composition (`src/components/ui/empty.tsx`): `<Empty><EmptyHeader><EmptyMedia variant="icon">…icon…</EmptyMedia><EmptyTitle>…</EmptyTitle><EmptyDescription>…</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" size="sm" …>New Note</Button></EmptyContent></Empty>`. No always-visible capture bar. Icon is decorative (`aria-hidden`), Lucide, `strokeWidth={1.5}`. Copy is not spec'd — keep it aligned with existing patterns (e.g. "No notes yet" / "Add quick trip-wide reminders — thoughts that don't belong in a Day Note or Document.") and use the confirmed action label `New Note`.
- One or more Notes → persistent upper-right compact outline action (`ml-auto` header row, mirroring `trip-docs-tab.tsx:103-113`), labeled `New Note`.
- **Both actions must be ≥44×44px** (UX-DR12 / AGENTS.md interactive floor). `size="sm"` alone is too short — apply `style={{ minHeight: 44, minWidth: 44 }}` (precedent: the repo's 44px work, e.g. `style={{ minHeight: 44 }}` on dialog buttons). Do not silently ship a sub-44px target even though `trip-docs-tab.tsx` currently does.

### List structure (AC-4, AC-5, AC-6, AC-7)

Semantic `<ol>` containing `<li>` rows in persisted visual order (per note, in the order returned by the query — position ASC). Each `trip-notes-row` shows: left Note glyph, title (or implicit title), one-line preview. The left Note glyph is decorative — render it `aria-hidden` (the title text carries the meaning), matching the empty-state icon treatment. No checkboxes, completion marks, status badges, or task colors anywhere (UX-DR4, UX-DR13). Trash action and Reorder handle belong to Stories 1.3/1.4 — do **not** add them in this story, but keep the row's outer structure (`ol`/`li`, left-glyph + content flex) so 1.2/1.3/1.4 slot in without restructuring.

The list has no date logic — it renders from the `notes` prop, so it is identical before/during/after the trip by construction (AC-6). No `getTripStatus`/`useNow` dependency is needed here.

### Known gap — trip-detail tab bar has no ARIA tab semantics (scope decision)

UX-DR1 describes ARIA `tablist`/`tab`/`tabpanel` semantics with roving `tabindex` and `aria-controls`. **The current tab bar in `page-client.tsx:213-233` is plain buttons with no `role="tablist"`, no `aria-selected`, no `aria-controls`, no roving `tabindex`.** Upgrading it is shared infrastructure affecting all 7 tabs and the `trip-tabs` E2E — that is **out of scope for Story 1.1** (its ACs only require activating the existing, already-reserved tab). Do not rebuild the tab bar's semantics in this story; keep the Notes panel behaviorally consistent with the other six panels. Flag this gap for the epic if you disagree; do not silently expand scope.

Two modified files are already over the ~250-line JSX guideline. `page-client.tsx` (332) is split in this story (tab-bar extraction — see Tasks/Wire-up). `trip-detail-tab-body.tsx` (281) stays intact: it is a pure tab dispatcher whose size is dominated by its props interface plus 7 leaf-forwarding branches — every branch already delegates to a separate component and there is no distinct UI region to extract. Do not force an artificial split here; note the dispatcher's residual size for epic-level trip-detail cleanup instead.

### What must be preserved (regression guard)

- `page-client.tsx` and `trip-detail-tab-body.tsx` are in `SHARED_GLOBS` — editing them forces the **full** E2E suite via `test:e2e:affected`. Same for `src/data/**`, `src/db/**`, `src/lib/**`, `src/components/ui/**`. Expect a full-suite run; do not be surprised, and do not trim tests to dodge it.
- Do not touch the day-note machinery (`itineraryNotes`, `createNote`/`updateNote`/`deleteNote`, `NoteItem`) — day-scoped Notes are a separate feature and must keep working (day-planning E2E).
- Do not alter `resolveTripDetailTab`, `buildTripDetailTabHref`, or the `TABS` array.
- The existing `trip-tabs.steps.ts` Notes assertion (`"Notes coming soon."`) **must** be updated or `test:e2e:affected` fails.

### Project Structure Notes

- Domain components → `src/components/packt/`, named `trip-notes-*.tsx` so the feature-map glob `src/components/packt/trip-notes-*.tsx` covers them all (required — `scripts/feature-map.test.mjs` fails the build on any unmapped `packt/*` component).
- Reusable logic → `src/lib/note-preview.ts` (feature-scoped lib module is the established norm alongside `spending.ts`, `route.ts`, `map-helpers.ts`, etc.).
- Types → `src/data/types.ts` only; never redefine in components/actions.
- Server actions → existing `src/app/(app)/trips/[tripId]/actions.ts`.
- E2E → `tests/e2e/features/trip-notes.feature` + `tests/e2e/steps/trip-notes.steps.ts` + `tests/e2e/feature-map.mjs` registration.
- No conflicts with the unified structure detected; the new names above are the only collision surface.

### References

- [Source: epics.md#Story 1.1] — ACs 1-9 verbatim; [Source: epics.md#Additional Requirements] — schema/mapper/action/type conventions.
- [Source: prds/prd-packt-2026-08-07/prd.md#FR-1..FR-2, FR-7] — create/list/empty-state requirements.
- [Source: ux-designs/ux-packt-2026-08-08/EXPERIENCE.md#Component Patterns, State Patterns, Accessibility Floor] — editor composite, blur semantics, live region, focus lifecycle, 44px floor, failure contracts.
- [Source: ux-designs/ux-packt-2026-08-08/DESIGN.md#Components] — empty state / New Note action / note row visual specs.
- [Source: project-context.md] — all coding conventions (strict TS, no single-letter vars, `cn()`, CSS tokens, Base UI, sonner mocking, server-action invariants).
- [Source: src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx:266] — placeholder to replace.
- [Source: src/app/(app)/trips/[tripId]/actions.ts:480-521, 126-174] — action patterns to mirror.
- [Source: src/lib/db-mappers.ts:299-308] — existing `dbNoteToType` (do not collide).
- [Source: src/db/schema.ts:361-376, 88-110] — `itineraryNotes` shape to mirror; `trips.notes` column to ignore.
- [Source: src/lib/queries.ts:327-525] — `getTripDetail` parallel-fetch pattern.
- [Source: src/data/types.ts:656-666, 454-471] — `TripDetailPayload`, existing Note types.

## Dev Notes — Previous Story Intelligence

This is the first story of Epic 1 — no previous story file exists.

## Dev Notes — Git Intelligence

Recent commits (see `git log --oneline -15`): predominantly bmad/map/planning-artifact cleanup. Two relevant signals for this story:
- `action-bar-44px-sizing` + "real-browser 44px geometry scenario for PlaceRowActionBar" — the repo is actively enforcing the 44×44px floor with real-browser geometry E2E. Meet it on the `New Note` action and any row controls; do not copy `trip-docs-tab.tsx`'s sub-44px `size="sm"` as a license to undersize.
- Work is committed via merge PRs on feature branches, Conventional Commits, no AI attribution trailers. The dev agent should follow the existing branch/commit conventions when starting this story.

## Dev Notes — Latest Tech Information

- **No new dependencies.** The stack already covers everything: Next.js 16.2.4, React 19.2.4, Drizzle 0.45.2, Base UI 1.4.1, lucide-react, sonner, Tailwind v4. Do not add a notes/editor library, a debounce util, or zod (repo has none and uses manual validation).
- Next.js 16: Server Actions + `revalidatePath` behave as the existing code already uses them — `revalidatePath` from a server function updates the current view immediately; `revalidatePath` is a stable API (only `revalidateTag` gained a required second arg in v16, and this story does not use it). Follow in-repo usage; consult `node_modules/next/dist/docs/` before writing any Next.js-specific code (v16 has breaking changes from training-data defaults).
- `bddgen` must run before `playwright test` for new `.feature` files (scripted by `test:e2e:*`).

## Project Context Reference

Read `_bmad-output/project-context.md` before implementing (already summarized in the Dev Notes above). Non-negotiable items for this story:

- `strict: true`, no `any`, no single-letter variable names (only `for` loop `i`).
- `ComponentNameProps` interface + destructured props on every component; `"use client"` first line of interactive components.
- `cn()` for className merging; colors only via CSS custom properties; no arbitrary Tailwind values; Lucide `strokeWidth={1.5}`; icon buttons need `title`.
- Dates ISO 8601; timestamps ISO strings in domain types; enums as `const obj + union`.
- Server actions: `"use server"`, `requireUser()` + `assertTripAccess()` before any read/write, `revalidatePath` after mutation.
- `src/lib/queries.ts` and `src/lib/auth-helpers.ts` are `server-only` — never import from client components.
- `db-mappers.ts` is in coverage scope (unlike queries/actions) — new mapper needs colocated tests.
- Unit tests colocated (`foo.tsx` → `foo.test.tsx`); mock `sonner` via `vi.mock("sonner", ...)` and import the mock after; global `next/navigation`/`next/headers` mocks already exist in `vitest.setup.mts`.
- Coverage: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`.
- E2E: scenario-owned fixtures via the mother/materializer helpers in `tests/e2e/`; do not add feature rows to `global-setup.ts`.

## Dev Notes — Testing Requirements (name tests before coding)

### Unit / component tests (Vitest, colocated, first)

- `src/lib/note-preview.ts` → `src/lib/note-preview.test.ts` (NEW): title fallback (title → implicit first-line → ""), preview (body first non-empty line → title fallback), whitespace handling, blank both → "", first-empty-line edge.
- `src/lib/db-mappers.ts` → `src/lib/db-mappers.test.ts` (UPDATE): `dbTripNoteToType` — nullable title/body → `undefined`, timestamps → ISO, position passthrough.
- `src/components/packt/trip-notes-tab.tsx` → `trip-notes-tab.test.tsx` (NEW): empty state renders Empty + `New Note` (no capture bar); populated renders `ol`/`li` in order with title+preview per row; title-only repeats title as preview; untitled uses first body line; header action present when populated; `New Note` opens editor with title focused; successful create announces "Note saved" once and closes draft; blank draft discarded (no action call, focus back to New Note); create failure keeps editor open with dirty value + inline error + Retry focused + `toast.error`; 44px target assertion.
- `src/components/packt/trip-notes-editor.tsx` → `trip-notes-editor.test.tsx` (NEW): blur-within-composite does not commit; blur-outside commits; blank discard; `aria-busy` during request; "Saving note" delay; serialization of latest values; Retry re-invokes create.
- `src/components/packt/trip-notes-row.tsx` → `trip-notes-row.test.tsx` (NEW): renders title/implicit title + one-line preview; preview uses `line-clamp-1`-safe rendering; long unbroken string does not create horizontal overflow.
- `src/app/(app)/trips/[tripId]/actions.test.ts` (UPDATE): `createTripNote` — asserts access with `"editor"`; rejects fully-blank; inserts at position 0 (shift); trims values; calls `revalidatePath`.
- `src/app/(app)/trips/[tripId]/page-client.test.tsx` + `trip-detail-tab-body.test.tsx` (UPDATE): thread `notes` through; notes branch renders `TripNotesTab` (the tab-body test already has a `buildProps` helper).
- `src/lib/queries.test.ts` (UPDATE only if it asserts the `TripDetailPayload` shape): notes fetch ordered by position.

### E2E (Playwright BDD, `tests/e2e/`)

- `tests/e2e/features/trip-notes.feature` (NEW, tag `@feat:trip-notes`): empty state shows `New Note` and no capture bar; create a note via empty-state action → appears at top with title + one-line preview; create with no title → implicit title = first body line, row never title-only; create a second note → newest at top; blank draft discarded (empty state remains). Failure/retry/announcement live in unit tests (no duplication across layers).
- `tests/e2e/steps/trip-notes.steps.ts` (NEW): scenario-owned fixture creation via `scenario.ensureCurrentTrip()` (existing helper); navigate to Notes tab via `?tab=notes` or tab button.
- `tests/e2e/feature-map.mjs` (UPDATE): add `entry("trip-notes", ["src/components/packt/trip-notes-*.tsx"])`. Required — `feature-map.test.mjs` fails the build if the new components are unmapped.
- `tests/e2e/steps/trip-tabs.steps.ts` (UPDATE): Notes case must no longer assert `"Notes coming soon."` — assert the empty-state `New Note` button instead.

### Expected validator behavior

Editing `page-client.tsx`, `trip-detail-tab-body.tsx`, `src/data/**`, `src/db/**`, `src/lib/**`, and `[tripId]/actions.ts` all match `SHARED_GLOBS` → `test:e2e:affected` runs the **full** suite. That is expected for this story; do not try to avoid it. Run targeted Vitest files first, then `packt-build-validator` once after the change is complete.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via the `bmad-dev-story` workflow.

### Debug Log References

- `packt-build-validator` full run: LINT PASS, TSC PASS, COVERAGE PASS (3254 tests, lines 96.36% / functions 96.64% / branches 90.56%), E2E PASS (198 passed; 1 initial flake in `@feat:auth` "User signs out" — `Error: write UNKNOWN` / `Test ended` mid-navigation, unrelated file, confirmed environmental by an isolated re-run of `@feat:auth` alone: 5/5 passed), BUILD PASS.
- E2E `@feat:trip-notes` (6 scenarios) and `@feat:trip-tabs` (2 scenarios) verified independently before the full validator run.

### Completion Notes List

- Ultimate context engine analysis completed — comprehensive developer guide created.
- Status set to: ready-for-dev.
- Implemented the full vertical slice: `notes` DB table + position index, `TripNote`/`CreateTripNoteInput` types, `dbTripNoteToType` mapper, `getTripDetail` query fetch, pure `note-preview.ts` title/preview helpers, `createTripNote` server action (lock → shift → insert-at-0 → revalidate), and the `trip-notes-tab` / `trip-notes-editor` / `trip-notes-row` component trio replacing the "Notes coming soon." placeholder.
- Extracted `trip-detail-tab-bar.tsx` out of `page-client.tsx` (332 → 311 lines) before threading the `notes` prop, per the Wire-up task.
- Editor is blur-commit only (no Enter-to-commit) — scoped to exactly the AC-2/AC-3/AC-9 behaviors and the named unit tests; kept intentionally reusable (plain `tripId`/`onClose` props) for Story 1.2's edit-mode extension without adding unused hooks now.
- All new/changed unit test files hit 100% line/branch/function coverage individually; project-wide coverage after the change is 96.36% lines / 90.56% branches / 96.64% functions (thresholds: 95/90/95).
- Added `entry("trip-notes", ["src/components/packt/trip-notes-*.tsx", "src/lib/note-preview.ts"])` to `feature-map.mjs` — `note-preview.ts` is exclusively consumed by `trip-notes-row.tsx`, so it is feature-mapped rather than left to force the full suite via `SHARED_GLOBS`, matching the existing `spending.ts` precedent.
- Updated `trip-tabs.steps.ts`'s Notes-tab assertion from the removed placeholder text to the empty-state `New Note` button.
- Ran `packt-build-validator` once after implementation was complete; all five checks passed (see Debug Log References).

### File List

**New files**
- `src/lib/note-preview.ts`
- `src/lib/note-preview.test.ts`
- `src/components/packt/trip-notes-tab.tsx`
- `src/components/packt/trip-notes-tab.test.tsx`
- `src/components/packt/trip-notes-editor.tsx`
- `src/components/packt/trip-notes-editor.test.tsx`
- `src/components/packt/trip-notes-row.tsx`
- `src/components/packt/trip-notes-row.test.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-tab-bar.tsx`
- `tests/e2e/features/trip-notes.feature`
- `tests/e2e/steps/trip-notes.steps.ts`

**Modified files**
- `src/db/schema.ts` — added `notes` pgTable + position index
- `src/data/types.ts` — added `TripNote`, `CreateTripNoteInput`; added `notes: TripNote[]` to `TripDetailPayload`
- `src/lib/db-mappers.ts` — added `dbTripNoteToType()`
- `src/lib/db-mappers.test.ts` — added `dbTripNoteToType` test suite
- `src/lib/queries.ts` — fetch + map trip notes in `getTripDetail`
- `src/lib/queries.test.ts` — added notes fixture to the `getTripDetail` mock select sequence
- `src/app/(app)/trips/[tripId]/actions.ts` — added `createTripNote`
- `src/app/(app)/trips/[tripId]/actions.test.ts` — added `createTripNote` test suite
- `src/app/(app)/trips/[tripId]/page-client.tsx` — extracted tab bar into `TripDetailTabBar`; threaded `notes`
- `src/app/(app)/trips/[tripId]/page-client.test.tsx` — added `notes: []` to `baseDetail`
- `src/app/(app)/trips/[tripId]/page.test.tsx` — added `notes: []` to `baseDetail`
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` — added `notes` prop; replaced placeholder with `<TripNotesTab>`
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.test.tsx` — added `notes` fixture, `TripNotesTab` mock, and a Notes-tab render test
- `src/app/(app)/trips/[tripId]/trip-detail-hero.test.tsx` — added `notes: []` to `buildDetail`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx` — added `notes: []` to fixture detail
- `tests/e2e/feature-map.mjs` — registered `trip-notes` entry
- `tests/e2e/steps/trip-tabs.steps.ts` — updated Notes-tab content assertion

**Database**
- `notes` table pushed to both the dev database (`npm run db:push`) and the E2E database (`npm run db:migrate:e2e`)

## Change Log

| Date       | Change                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------- |
| 2026-08-08 | Implemented Story 1.1 end-to-end (schema, types, mapper, query, action, UI, E2E); build validator passed; status set to review. |
