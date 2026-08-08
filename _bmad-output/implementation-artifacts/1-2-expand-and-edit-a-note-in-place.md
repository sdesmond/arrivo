---
baseline_commit: 9b1585286f2913d0b9429c312f4a0867a657f134
---

# Story 1.2: Expand and edit a Note in place

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trip collaborator,
I want to tap a Note to see its full content and edit it right there,
so that I can update or re-read a thought without leaving the Notes tab or losing my place.

Epic: Epic 1 — Trip Notes. Builds directly on Story 1.1 (done): the `notes` DB table, `TripNote`/`CreateTripNoteInput` types, `dbTripNoteToType`, the `getTripDetail` notes fetch, `createTripNote`, and the `trip-notes-tab` / `trip-notes-editor` / `trip-notes-row` component trio already exist. This story adds single-expand disclosure behavior (FR-3) and edit-with-autosave (FR-4). It must NOT add the Trash action (Story 1.3) or the Reorder handle (Story 1.4), but the row structure must stay ready for them to slot in.

## Acceptance Criteria

From `_bmad-output/planning-artifacts/epics.md` (Story 1.2) — implement verbatim; all map to the FReqs/UX-DRs in parentheses.

- **AC-1** (FR-3, UX-DR5, UX-DR10): Given a collapsed Note row — When the collaborator activates its disclosure (click, tap, Enter, or Space) — Then it expands in place to reveal the full body in an inline editor composite (no dialog, no route change), with a stable `id`, `aria-expanded`, and `aria-controls` on the trigger and a matching `id`, `role="region"`, `aria-labelledby` on the expanded region, and focus moves to the title field.
- **AC-2** (FR-3, UX-DR5): Given a Note already expanded with unsaved edits — When the collaborator activates a different Note's disclosure — Then the first Note's edits are committed and only a confirmed save collapses the first and expands the second — a failed save keeps the first open and does not expand the second.
- **AC-3** (FR-4, UX-DR6, UX-DR11): Given an expanded Note — When the collaborator edits the title and/or body and then blurs the complete editor composite (not just one field) or requests collapse — Then the edit autosaves with no explicit Save button, the editor sets `aria-busy` during the request, and "Note saved" is announced once via the polite live region on confirmed success.
- **AC-4** (FR-4, UX-DR6, UX-DR9, UX-DR10): Given a save request fails — When the failure response returns — Then the editor stays open with the dirty value intact, a persistent linked inline error appears, a Retry control is focused, and a Failure toast supplements (not replaces) the inline error.
- **AC-5** (FR-4): Given an edited and saved Note — When it next collapses — Then the collapsed title/preview reflect the saved wording, and the Note's position in the list is unchanged by the edit.
- **AC-6** (FR-3, UX-DR5): Given an expanded Note with no edits — When the collaborator collapses it — Then it returns to the title + one-line-preview row with the expanded region removed entirely from the accessibility tree.

## Tasks / Subtasks

- [x] Server action: `updateTripNote(noteId, input)` in `src/app/(app)/trips/[tripId]/actions.ts` (AC-3, AC-4, AC-5)
  - [x] `requireUser()` → resolve `tripId` from the note → `assertTripAccess(tripId, user.id!, "editor")` → update `title`/`body`/`updatedAt` → `revalidatePath`
  - [x] Trim values; throw `"Note is blank"` if both blank (defense-in-depth — client discards blank edits, but the action must never persist empty rows)
  - [x] MUST NOT touch `position` (AC-5) and MUST NOT lock the trip (no ordering change — no transaction needed)
- [x] Types: add `UpdateTripNoteInput` to `src/data/types.ts` (AC-3)
- [x] Editor: extend `trip-notes-editor.tsx` to support edit mode (AC-1–AC-4, AC-6)
  - [x] Props for edit mode: `noteId`, `initialTitle`, `initialBody` (or an explicit `mode` prop — keep one component for create + edit)
  - [x] Imperative `commit()` via `useImperativeHandle` returning `"saved" | "failed" | "clean"`; serialize through a single in-flight promise ref so blur and row-switch commits never duplicate
  - [x] Edit-mode blur: autosave if dirty, keep editor open (do NOT collapse on blur); collapse is the disclosure trigger or a row switch
  - [x] Blank-edit discard: clearing both title and body reverts to saved content (no server call, no delete) — blank edit must never delete (delete is Story 1.3)
  - [x] Keep create-mode behavior unchanged (blur commits and closes the draft)
- [x] Row: extend `trip-notes-row.tsx` into an interactive disclosure (AC-1, AC-2, AC-6)
  - [x] `"use client"`; real `<button>` trigger wrapping title + one-line preview (uses `getNoteTitle`/`getNotePreviewLine`), ≥44×44px, `aria-expanded`, `aria-controls`
  - [x] Expanded region: `role="region"`, `aria-labelledby` pointing at the trigger `id`, rendered ONLY when expanded (leaves the a11y tree entirely when collapsed)
  - [x] Left Note glyph stays `aria-hidden`; do NOT add Reorder handle or Trash (Stories 1.3/1.4)
- [x] Tab: add single-expand orchestration to `trip-notes-tab.tsx` (AC-2, AC-5, AC-6)
  - [x] `expandedNoteId` state; expanded editor lives in the expanded row's region; tab owns the editor ref and the "save-first-then-switch" gate
  - [x] Disclosure of a collapsed note while another is expanded → `await commit()`; only `"saved"`/`"clean"` collapses the first and expands the second; `"failed"` keeps the first open and does not expand the second
  - [x] Collapse path (trigger on expanded note): commit-if-dirty, then collapse; collapsed preview reflects saved wording (props refresh via `revalidatePath`)
  - [x] Reuse the existing tab-owned polite live region for the once-per-mutation "Note saved"
- [x] E2E: extend `tests/e2e/features/trip-notes.feature` + `tests/e2e/steps/trip-notes.steps.ts` (AC-1, AC-2, AC-3, AC-5)
- [x] Unit tests: colocated updates for every new/changed file (see Testing Requirements)

## Dev Notes

### What already exists (from Story 1.1) — reuse, don't rebuild

- `src/components/packt/trip-notes-editor.tsx` (171 lines) already implements the UX-DR6 editor composite: optional title input + body textarea, borderless inline, blur-commit with `relatedTarget`/focus-within semantics, blank-discard, `aria-busy`, delayed "Saving note" announce (400ms), persistent linked inline error + Retry (focused on failure), `toast.error(...)`, and a `isSavingRef` guard blocking overlapping commits. **Extend it for edit mode; do not write a second editor.**
- `src/components/packt/trip-notes-tab.tsx` (110 lines) owns: empty state (Empty + `New Note`), populated header `New Note` action, draft editor `<li>` at the top of the `<ol>`, and the tab-owned polite live region `<div aria-live="polite" className="sr-only"><span key={announcementId}>{announcement}</span></div>`. It currently renders `notes.map((note) => <TripNotesRow key={note.id} note={note} />)` with **no** expansion state.
- `src/components/packt/trip-notes-row.tsx` (53 lines) is a **static, server-style** collapsed row (no `"use client"`): `<li>` with left StickyNote glyph (`aria-hidden`, `var(--surface-2)` circle), title via `getNoteTitle`, one-line preview via `getNotePreviewLine`, both `line-clamp-1` + `overflowWrap: anywhere`. It must become an interactive disclosure in this story.
- `src/lib/note-preview.ts` — pure helpers; keep using them for the collapsed row and for re-deriving the preview after an edit.
- `src/app/(app)/trips/[tripId]/actions.ts` — `createTripNote` at lines 525-545. `updateNote` (day-note, lines 505-513) is the closest pattern for `updateTripNote`: resolve `tripId`, assert access, single-row `db.update(...).set({ ..., updatedAt: new Date() })`, `revalidatePath`.
- `src/data/types.ts` — `CreateTripNoteInput` at lines 821-824; add `UpdateTripNoteInput` beside it (same shape, separate name — do not reuse `CreateTripNoteInput`).

### Server action contract (AC-3, AC-4, AC-5)

Add to `src/app/(app)/trips/[tripId]/actions.ts` (already SHARED_GLOBS — no feature-map change needed for the action):

```ts
export async function updateTripNote(noteId: string, input: UpdateTripNoteInput): Promise<void>
```

Body, following the file's existing style (mirror `updateNote` at lines 505-513, `createTripNote` at 525-545):

1. `const user = await requireUser();`
2. Resolve `tripId`: `const [note] = await db.select({ tripId: notes.tripId }).from(notes).where(eq(notes.id, noteId)); if (!note) return;` (match `updateNote`'s silent no-op on missing note).
3. `await assertTripAccess(tripId, user.id!, "editor");` — "editor" minimum, matching every other mutating action.
4. Guard: `const title = input.title?.trim() || undefined; const body = input.body?.trim() || undefined; if (!title && !body) throw new Error("Note is blank");` — same message as `createTripNote`. This is defense-in-depth: the client discards blank edits, but the action must never persist an empty row (FR-2/UX-DR4 guarantee every row shows a non-empty preview).
5. `await db.update(notes).set({ title, body, updatedAt: new Date() }).where(eq(notes.id, noteId));`
6. **Do NOT touch `position`** (AC-5 — editing never changes manual sort order). **No `db.transaction`, no `lockTripForUpdate`** — a single-row content update changes no ordering, unlike `createTripNote`/`reorderDayItems`.
7. `revalidatePath(\`/trips/${tripId}\`);` returns `void`.
8. Errors thrown as plain `Error` (file style; no `{ ok }` envelope, no zod).

`actions.ts` is excluded from coverage, but `actions.test.ts` already covers the trip-note actions and must be extended (see Testing Requirements).

### Edit-mode editor (AC-1–AC-4) — the critical coordination

The create-mode editor closes on blur (`onClose()` after `onSaved()`). **Edit mode is different**: blur autosaves but the Note stays expanded so the collaborator can keep editing; collapse only happens on an explicit collapse request (disclosure trigger on the expanded Note) or a row switch. After a successful save, reset the editor's baseline to the saved (trimmed) values so a later blur with no further changes does not re-save.

Design the expanded editor as **tab-owned**: `TripNotesTab` holds `expandedNoteId`, finds the expanded Note, and renders `<TripNotesEditor mode="edit" .../>` inside that row's expanded region. This gives the tab a single ref to the one editor that can exist at a time and keeps the save-first-then-switch gate in one place.

Expose an imperative handle on the editor:

```ts
useImperativeHandle(ref, () => ({
  commit(): Promise<"saved" | "failed" | "clean">,
}));
```

- `commit()` serializes the **latest** values, sets `aria-busy`, announces the delayed "Saving note", and returns the outcome. On `"saved"` it announces once via `onSaved` (tab's live region) and resets its baseline to the saved values. On `"failed"` it keeps the dirty value intact, shows the persistent linked inline error, focuses Retry, and fires `toast.error(...)`.
- **Anti-race guard (critical):** blur-commit and the row-switch commit can overlap. When the collaborator clicks Note B's disclosure while Note A's editor is open, A's `onBlur` fires *first* (focus leaves the composite) and starts a commit; then the click handler runs and the tab requests a second commit for the switch. Store the in-flight commit promise in a ref; a second `commit()` call must **await the same in-flight promise** rather than starting a duplicate request. The existing `isSavingRef` guard is the seed of this — promote it to hold the promise. This is the "queues/blocks later transition requests until the server confirms" requirement (UX-DR6) and the exact failure the Story 1.1 review patched (`block overlapping save interactions that can duplicate notes or discard edits made after request snapshot`).
- `"clean"` outcome: no changes since baseline → resolve immediately without a server call (this is also the AC-6 "expanded with no edits" collapse path — nothing to save, just collapse).
- **Blank-edit discard (edge case the dev must decide, do not guess):** clearing BOTH title and body in edit mode, then blur/collapse, reverts the editor to the saved content and collapses — **no server call, no delete**. Story 1.3 owns deletion. If this is ambiguous, follow "the blank composite discards" rule from UX-DR6 applied to edit: it discards the *edit*, not the Note. Do not silently persist an empty Note and do not delete the row.

### Row disclosure (AC-1, AC-2, AC-6) — UX-DR4/UX-DR5 semantics

`trip-notes-row.tsx` becomes `"use client"` and renders the disclosure trigger + (only when expanded) the region:

- Trigger: a real `<button type="button">` wrapping the title + one-line preview block (currently the `<div>` content of the row). Give it a stable `id` (e.g. `trip-note-disclosure-${note.id}`), `aria-expanded={isExpanded}`, `aria-controls="trip-note-region-${note.id}"`, and `style={{ minHeight: 44, minWidth: 44 }}` (UX-DR12 floor — never ship a sub-44px target). It is the whole title/preview area, consistent with the itinerary Event row disclosure anatomy. The left Note glyph stays `aria-hidden` and **outside** the button (or inside but aria-hidden — pick one; it must not enter the accessible name). Add a Chevron rotate on expanded state as a hint, matching the day-card-header pattern — optional, no Notes-specific decoration.
- Region: rendered **only** when expanded: `<div id="trip-note-region-${note.id}" role="region" aria-labelledby="trip-note-disclosure-${note.id}">` containing the editor. When collapsed the element is absent entirely — it leaves the accessibility tree (AC-6). Do not render it hidden; conditional render only.
- Row activation = disclosure button only. The `<li>` itself is not interactive. Enter/Space work automatically on a `<button>`.
- **Do NOT add** Reorder handle or Trash in this story (Stories 1.3/1.4). Keep the outer `<ol>`/`<li>`, left-glyph + content flex layout so they slot in without restructuring (Story 1.1 instruction).
- The row receives `isExpanded`, `onToggle` (or `onExpand`/`onCollapse`), and the editor element for the region from the tab. No ref plumbing into the row: the tab renders the editor and owns its ref.

### Tab single-expand orchestration (AC-2, AC-5, AC-6)

- State: `expandedNoteId: string | null` (draft editor stays separate — only one editor total: either the draft at top or the expanded row's editor; opening `New Note` while a Note is expanded should commit/collapse the expanded one first per the same gate, then open the draft — document this in the PR/EPIC note if it feels out of scope, but do not lose an in-progress edit).
- `handleToggle(noteId)`:
  - If `expandedNoteId === noteId` → collapse: `const result = await editorRef.current?.commit();` if `"failed"` keep open; else `setExpandedNoteId(null)` (AC-3 "requests collapse" autosaves first; AC-6 clean collapse just closes).
  - Else if `expandedNoteId !== null` → row switch: `const result = await editorRef.current?.commit();` if `result === "failed"` → keep the first Note open, **do not** expand the second (AC-2). Otherwise `setExpandedNoteId(noteId)`.
  - Else `setExpandedNoteId(noteId)`.
- Focus: expanding sets `expandedNoteId` → the editor's `autoFocus` on the title field lands focus (UX-DR10 "expand → title field"). On collapse, return focus to the disclosure trigger.
- The collapsed list renders from the server-confirmed `notes` prop. `updateTripNote` → `revalidatePath` refreshes props, so on the next collapse the title/preview show the saved wording (AC-5) — no optimistic local mutation, matching the create flow and UX-DR11.

### Announcements (UX-DR11)

The tab already owns the single polite live region. Edit saves announce "Note saved" **exactly once** per mutation via the existing `announceSaved()` (`onSaved` → `setAnnouncement("Note saved")`). Because the editor's `commit()` (not the blur handler) is the single place that announces, a blur-then-collapse sequence for the same mutation announces once. Never announce optimistic state as saved; failure uses the persistent inline error + Failure toast (assertive), never the polite saved-region.

### What must be preserved (regression guard)

- Day-note machinery (`itineraryNotes`, `createNote`/`updateNote`/`deleteNote`, `NoteItem`) — untouched; day-planning E2E keeps passing.
- Create flow unchanged: empty state, `New Note` (empty-state + populated header actions), draft editor blur-commit + blank-discard, create-failure Retry path, "Note saved" once.
- The `notes` table `position` column is reserved for Story 1.4 — `updateTripNote` must not write to it.
- Do not introduce a new component for the editor; reuse `trip-notes-editor.tsx` for both create and edit (a `mode`/`noteId`/`initial*` prop surface is the expected shape).
- No new libraries, no new CSS tokens, no hardcoded colors, no arbitrary Tailwind values, icons `strokeWidth={1.5}`, `cn()` for class merging.

### Known shared-infra note

The trip-detail tab bar still lacks ARIA `tablist`/`tab` semantics (UX-DR1) — that gap is out of scope for the whole epic (Story 1.1 decision). Notes tab activation keeps working as it does today; do not rebuild tab semantics here.

## Dev Notes — Previous Story Intelligence

Story 1.1 (`1-1-create-and-view-trip-notes.md`) built the entire foundation this story extends. Actionable learnings:

- **The editor already carries the hard UX-DR6 machinery** — blur-within-composite does not commit, `aria-busy`, delayed "Saving note", persistent inline error + Retry, `toast.error`, blank-discard. Extend it for edit; do not fork it.
- **Story 1.1 review patches are load-bearing** — keep them intact: (1) commit-from-title-on-Enter while Enter stays a newline in the body; (2) the successful-save announcement must stay mounted after the editor closes (tab-owned live region — the tab, not the editor's internal region, owns the confirmed "Note saved"); (3) block overlapping save interactions that can duplicate or discard post-snapshot edits (`isSavingRef` — this story extends it to the row-switch race). Do not "simplify" these.
- **Preview correctness comes from `note-preview.ts`** (`getNoteTitle`/`getNotePreviewLine`, first *non-empty* line). After an edit, the collapsed row automatically re-derives title/preview from the refreshed prop — do not duplicate the logic in the row/editor.
- **44×44px floor is enforced in this epic with real-browser E2E geometry checks** — the disclosure trigger must meet it, not just `size="sm"`.
- The tab's live region pattern is `<div aria-live="polite" className="sr-only"><span key={announcementId}>…</span></div>` — keyed span re-announces. Reuse it; do not add a second region.
- Story 1.1's E2E registered `entry("trip-notes", ["src/components/packt/trip-notes-*.tsx", "src/lib/note-preview.ts"])` — the new/changed components are already feature-mapped, so no `feature-map.mjs` change is required for this story.
- Story 1.1 deferred work (`deferred-work.md`): trip-detail header Edit/Share row overflows at 320px/200% text — pre-existing, not this story.

## Dev Notes — Git Intelligence

Recent commits (`git log --oneline -15`), all Story 1.1 on branch `feature/trip-notes` (current branch, clean tree):

- `9b15852 Merge pull request #230 from sdesmond/story/1-1-create-and-view-trip-notes` (merged via PR)
- `0611d52 fix: harden trip note save behavior` — the save-coordination hardening this story builds on
- `542afe7 feat: wire the Notes tab into trip detail` / `5452267 feat: add trip notes tab, editor, and row components` / `f20bb9e feat: add createTripNote server action` / `78eb601 feat: add trip notes data layer`

Patterns: work happens on feature branches (e.g. `story/1-1-create-and-view-trip-notes`), Conventional Commits, merged via PR with merge commits, **no AI attribution trailers**. Start Story 1.2 on its own feature branch (ask the user per the branch-confirmation gate) and follow the same commit/PR conventions.

## Dev Notes — Latest Tech Information

- **No new dependencies.** Everything needed is already in the repo and proven in Story 1.1: Next.js 16.2.4, React 19.2.4, Drizzle 0.45.2, lucide-react, sonner, Tailwind v4, Base UI. Do not add an accordion library, a debounce util, or zod.
- Next.js 16 Server Actions: `revalidatePath` from `updateTripNote` refreshes the current view immediately (Server Functions update the UI for the affected path) — no manual `router.refresh()`, matching `createTripNote`. Consult `node_modules/next/dist/docs/` before writing any Next.js-specific code (v16 has breaking changes from training-data defaults).
- `bddgen` must run before `playwright test` for changed `.feature` files (scripted by `test:e2e:*`).

## Project Context Reference

Read `_bmad-output/project-context.md` before implementing (already summarized in the Dev Notes above). Non-negotiable items for this story:

- `strict: true`, no `any`, no single-letter variable names (only `for` loop `i`).
- `ComponentNameProps` interface + destructured props on every component; `"use client"` first line of interactive components.
- `cn()` for className merging; colors only via CSS custom properties; no arbitrary Tailwind values; Lucide `strokeWidth={1.5}`; icon buttons need `title`.
- Dates ISO 8601; timestamps ISO strings in domain types; enums as `const obj + union`.
- Server actions: `"use server"`, `requireUser()` + `assertTripAccess()` before any read/write, `revalidatePath` after mutation.
- `src/lib/queries.ts` and `src/lib/auth-helpers.ts` are `server-only` — never import from client components.
- Unit tests colocated (`foo.tsx` → `foo.test.tsx`); mock `sonner` via `vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))` and import the mock after; global `next/navigation`/`next/headers` mocks already exist in `vitest.setup.mts`.
- Coverage: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`.
- E2E: scenario-owned fixtures via the mother/materializer helpers in `tests/e2e/`; do not add feature rows to `global-setup.ts`.

## Dev Notes — Testing Requirements (name tests before coding)

### Unit / component tests (Vitest, colocated, first)

- `src/app/(app)/trips/[tripId]/actions.test.ts` (UPDATE): `updateTripNote` — asserts editor access with `"editor"`; resolves `tripId` from the note and no-ops on missing note; rejects fully-blank with `"Note is blank"`; trims title/body; updates `updatedAt`; **does not call `position`/`lockTripForUpdate`/`db.transaction`**; calls `revalidatePath("/trips/{tripId}")`.
- `src/components/packt/trip-notes-editor.tsx` → `trip-notes-editor.test.tsx` (UPDATE): edit mode prefills `initialTitle`/`initialBody`; blur with changes calls `updateTripNote` with trimmed values and keeps the editor open; blur with no changes does NOT call the action; blank-edit reverts (no action call, no delete); `aria-busy` during request; "Saving note" delayed announce; failure keeps dirty value + inline error + Retry focused + `toast.error`; Retry re-invokes `updateTripNote`; imperative `commit()` returns `"saved" | "failed" | "clean"`; two `commit()` calls during an in-flight save await the same promise (single `updateTripNote` invocation); success resets baseline (second blur does not re-save); "Note saved" announced exactly once via `onSaved`. Create-mode existing tests keep passing.
- `src/components/packt/trip-notes-row.tsx` → `trip-notes-row.test.tsx` (UPDATE): collapsed renders trigger button with `aria-expanded="false"` + `aria-controls` and NO region in the tree; expanded renders region with `role="region"` + `aria-labelledby` matching the trigger id; trigger click calls `onToggle`; Enter/Space activate (native button); trigger ≥44×44px; title + one-line preview still correct via `getNoteTitle`/`getNotePreviewLine`; no Reorder/Trash controls.
- `src/components/packt/trip-notes-tab.tsx` → `trip-notes-tab.test.tsx` (UPDATE): expanding a collapsed Note renders the edit-mode editor with focus on the title field; expanding a second Note while the first is expanded commits the first first and only collapses+expands on `"saved"`/`"clean"`; a `"failed"` first save keeps it open and does not expand the second; expanded Note with no edits collapses to the row (region gone from tree); editing + blur autosaves and announces "Note saved" once; after save + collapse the row shows the saved title/preview; edit does not reorder the list (position unchanged); `New Note` while a Note is expanded commits/collapses it before opening the draft (no lost edits).
- `src/data/types.ts` has no colocated test; the `UpdateTripNoteInput` shape is exercised via `actions.test.ts`.

### E2E (Playwright BDD, `tests/e2e/`)

- `tests/e2e/features/trip-notes.feature` (UPDATE, `@feat:trip-notes`): add scenarios — (1) expanding a note reveals its full body in place with no route change (still on Notes tab, no dialog); (2) expanding a second note collapses the first (single-expand); (3) editing title+body then blurring/collapsing updates the collapsed preview to the saved wording; (4) note stays in the same list position after an edit. Failure/retry/announcement live in unit tests (no duplication across layers).
- `tests/e2e/steps/trip-notes.steps.ts` (UPDATE): steps for "I expand the note titled {string}" (activate the row's disclosure), edit via `Note title`/`Note body` labels, and assert the updated collapsed preview. Reuse the scenario-owned fixture (`scenario.ensureCurrentTrip()`) and the existing Notes-tab steps.
- No `feature-map.mjs` change: `trip-notes-*.tsx` is already mapped to `@feat:trip-notes`; `actions.ts` and `src/data/**` are `SHARED_GLOBS`.

### Expected validator behavior

Editing `actions.ts` and `src/data/types.ts` matches `SHARED_GLOBS` → `test:e2e:affected` runs the **full** suite; the `trip-notes-*.tsx` changes run `@feat:trip-notes`. That is expected; do not try to avoid it. Run targeted Vitest files first, then `packt-build-validator` once after the change is complete.

## Project Structure Notes

- Domain components → `src/components/packt/`, named `trip-notes-*.tsx` (already covered by the `trip-notes` feature-map glob).
- Reusable logic → `src/lib/note-preview.ts` (unchanged, already mapped).
- Types → `src/data/types.ts` only (`UpdateTripNoteInput` beside `CreateTripNoteInput`).
- Server actions → existing `src/app/(app)/trips/[tripId]/actions.ts` (`updateTripNote` beside `createTripNote`).
- E2E → existing `tests/e2e/features/trip-notes.feature` + `tests/e2e/steps/trip-notes.steps.ts`.
- No conflicts with the unified structure detected; no new files needed beyond what exists.

### References

- [Source: epics.md#Story 1.2] — ACs 1-6 verbatim; [Source: epics.md#Additional Requirements] — action/type/mapper conventions.
- [Source: prds/prd-packt-2026-08-07/prd.md#FR-3, FR-4] — expand-in-place, single-expand, autosave-on-blur/collapse, position-unchanged.
- [Source: ux-designs/ux-packt-2026-08-08/EXPERIENCE.md#Component Patterns, State Patterns, Accessibility Floor] — UX-DR5 disclosure/region ARIA, UX-DR6 editor composite + commit queue, UX-DR10 focus lifecycle (expand → title field), UX-DR11 once-per-mutation announcement, UX-DR12 44px floor.
- [Source: ux-designs/ux-packt-2026-08-08/DESIGN.md#Components] — note-row disclosure anatomy, note-editor visual (inline, transparent fields, no Save button).
- [Source: project-context.md] — all coding conventions (strict TS, `cn()`, CSS tokens, sonner mocking, server-action invariants).
- [Source: 1-1-create-and-view-trip-notes.md] — previous story file (foundation, review patches, testing conventions).
- [Source: src/components/packt/trip-notes-editor.tsx] — editor to extend (create-mode blur-commit, `isSavingRef` guard, error/Retry).
- [Source: src/components/packt/trip-notes-tab.tsx] — tab to extend (draft management, live region, `<ol>` render).
- [Source: src/components/packt/trip-notes-row.tsx] — row to convert to disclosure.
- [Source: src/app/(app)/trips/[tripId]/actions.ts:505-513, 525-545] — `updateNote`/`createTripNote` patterns to mirror.
- [Source: src/data/types.ts:821-824] — `CreateTripNoteInput` shape to mirror.
- [Source: tests/e2e/features/trip-notes.feature] + `steps/trip-notes.steps.ts` — E2E to extend.

## Dev Agent Record

### Agent Model Used

- Story authoring: Big-pickle (opencode), via `bmad-create-story`.
- Implementation: OpenAI Codex (GPT-5), via `bmad-dev-story`.

### Debug Log References

- RED: `actions.test.ts` failed four `updateTripNote` tests because action was missing.
- GREEN: targeted action suite passes 31 tests after adding typed, authorized, non-ordering update path.
- RED: eight edit-mode editor tests failed against create-only implementation.
- GREEN: editor suite passes 23 tests with shared imperative commit path for create and edit modes.
- RED: four disclosure-row tests failed against static row markup.
- GREEN: row suite passes nine tests with native button disclosure and conditionally rendered labelled region.
- RED: seven tab orchestration tests failed against stateless row rendering.
- GREEN: tab suite passes 15 tests with one editor ref and save-gated transitions.
- RED: BDD generation reported six missing expand/edit step definitions; initial browser run exposed three page-wide locator errors.
- GREEN: BDD generation succeeds, four targeted Vitest files pass 78 tests, and trip-notes browser suite passes all 11 scenarios.
- VALIDATION: lint, TypeScript, production build, 3,281-test coverage suite, and 203 affected E2E tests pass; coverage is 96.29% lines, 96.61% functions, and 90.48% branches.
- VISUAL: desktop and 320px mobile Playwright fallback reviews pass with one expanded region, title focus, ≥44px targets, no horizontal overflow, and no console errors; named reviewer instruction files were unavailable.

### Implementation Plan

- Implement tasks in story order with targeted red-green-refactor cycles, then run project validator once after all targeted tests pass.

### Completion Notes List

- Ultimate context engine analysis completed — comprehensive developer guide created.
- Added authorized, trimmed trip-note updates without changing note position.
- Extended shared editor with edit autosave, blank-edit reversion, failure recovery, and deduplicated imperative commits.
- Added accessible single-expand rows and save-gated tab orchestration with confirmed-save announcements.
- Added unit/component and browser coverage for expand, switch, edit, collapse, refresh, ordering, and failure paths.
- Status set to: review.

### File List

**New files**
- `_bmad-output/implementation-artifacts/1-2-expand-and-edit-a-note-in-place.md`

**Modified files**
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/data/types.ts` — added `UpdateTripNoteInput`
- `src/app/(app)/trips/[tripId]/actions.ts` — added `updateTripNote`
- `src/app/(app)/trips/[tripId]/actions.test.ts` — `updateTripNote` test suite
- `src/components/packt/trip-notes-editor.tsx` — edit mode + imperative `commit()`
- `src/components/packt/trip-notes-editor.test.tsx` — edit-mode tests
- `src/components/packt/trip-notes-row.tsx` — disclosure trigger + expanded region
- `src/components/packt/trip-notes-row.test.tsx` — disclosure tests
- `src/components/packt/trip-notes-tab.tsx` — single-expand orchestration
- `src/components/packt/trip-notes-tab.test.tsx` — single-expand tests
- `tests/e2e/features/trip-notes.feature` — expand/edit scenarios
- `tests/e2e/steps/trip-notes.steps.ts` — expand/edit steps

## Change Log

| Date       | Change |
| ---------- | ----------------------------------------------------------------------------------------- |
| 2026-08-08 | Story created from epics.md Story 1.2; full context analysis against Story 1.1 implementation, PRD, UX spine, and current source. |
| 2026-08-08 | Implemented in-place expansion and autosave editing with accessible disclosure semantics, guarded transitions, and full test coverage. |
