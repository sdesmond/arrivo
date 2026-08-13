---
baseline_commit: eb68465328e0b2087b6748825cb520b44e572f05
---

# Story 1.3: Delete a Note

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trip collaborator,
I want to delete a Note I no longer need, with a confirmation step,
so that I can keep my list current without risking an accidental permanent loss.

Epic: Epic 1 — Trip Notes. Builds on Stories 1.1 (done) and 1.2 (review): the `notes` table, `TripNote` types, `dbTripNoteToType`, `createTripNote`/`updateTripNote`, and the `trip-notes-tab` / `trip-notes-editor` / `trip-notes-row` trio (with single-expand + edit-autosave) all exist. This story adds the Trash action and the UX-DR8 confirmation `Dialog` (FR-5). It must NOT add the Reorder handle (Story 1.4), and it must keep the row structure ready for that handle to slot in. It also closes the deferred-work reconciliation gap (see Deferred-work wiring).

## Acceptance Criteria

From `_bmad-output/planning-artifacts/epics.md` (Story 1.3) — implement verbatim; all map to the FReqs/UX-DRs in parentheses.

- **AC-1** (FR-5, UX-DR8): Given an expanded Note — When the collaborator activates the Trash action — Then the existing Packt/Base UI confirmation `Dialog` opens with initial focus on Cancel.
- **AC-2** (FR-5, UX-DR8, UX-DR10): Given the open delete confirmation dialog — When the collaborator activates Cancel or `Esc` — Then the dialog closes, the Note remains in the list unchanged, and focus returns to the invoking Trash action.
- **AC-3** (FR-5, UX-DR8, UX-DR10, UX-DR11): Given the open delete confirmation dialog — When the collaborator confirms delete — Then focus moves to the dialog's status container, Cancel/Delete are disabled, the dialog is marked busy, "Deleting note" is announced, and — on success — the Note is permanently removed with no undo, and focus moves to the next disclosure, else the previous one, else `New Note`.
- **AC-4** (FR-5, UX-DR8, UX-DR9): Given a delete request fails — When the failure response returns — Then the dialog stays open with a persistent error, focus moves to a safe recovery control, the Note remains in the list, and a Failure toast supplements the dialog error.

## Tasks / Subtasks

- [x] Server action: `deleteTripNote(noteId)` in `src/app/(app)/trips/[tripId]/actions.ts` (AC-3, AC-4)
  - [x] `requireUser()` → resolve `tripId` from the note → `assertTripAccess(tripId, user.id!, "editor")` → `db.delete(notes)` → `revalidatePath`
  - [x] Silent no-op on missing note (mirror `deleteNote`/`updateTripNote`); plain `Error` throw style; no transaction needed
- [x] Dialog component: `src/components/packt/trip-notes-delete-dialog.tsx` (NEW, covered by existing `trip-notes-*.tsx` feature-map glob) (AC-1–AC-4)
  - [x] Base UI `Dialog` from `src/components/ui/dialog.tsx` (NOT `alert-dialog`) with destructive Delete action; no Notes-specific styling
  - [x] Initial focus on Cancel (`DialogContent` forwards `initialFocus` to Base UI Popup)
  - [x] Confirm: focus the dialog status container, disable Cancel/Delete, mark dialog busy, announce "Deleting note"
  - [x] Failure: keep dialog open, persistent linked error, focus Retry (≥44px), `toast.error` supplements
- [x] Row: add the Trash action to `trip-notes-row.tsx` (AC-1, AC-2, UX-DR5)
  - [x] `Trash2` icon, `strokeWidth={1.5}`, `aria-label="Delete {title}"`, `title` attribute, ≥44×44px; never toggles the disclosure; not nested in the disclosure button
- [x] Editor: extend the blur boundary so moving focus to the row's Trash (and same-row controls) does not trigger the native autosave commit (UX-DR6) — explicit collapse/switch/New-Note gates already commit via the tab
- [x] Tab: delete orchestration + focus-after-delete in `trip-notes-tab.tsx` (AC-2, AC-3)
  - [x] `deleteTargetNoteId` state; render the dialog; confirm runs `deleteTripNote`, on success clear `expandedNoteId`, announce "Note deleted" once, move focus to next disclosure → previous → `New Note`
  - [x] Cancel/Esc: dialog closes, focus returns to the invoking Trash action, note and (uncommitted) editor state unchanged
  - [x] Reconcile `expandedNoteId` against the `notes` prop; guard stale "Note saved" announcements for deleted notes (deferred-work)
- [x] E2E: extend `tests/e2e/features/trip-notes.feature` + `tests/e2e/steps/trip-notes.steps.ts` (AC-1, AC-2, AC-3)
- [x] Unit tests: colocated updates for every new/changed file (see Testing Requirements)

### Review Findings

- [x] [Review][Decision] Trash action renders on collapsed rows, contradicting the story's explicit expanded-only spine directive — RESOLVED 2026-08-12: approved as an intentional deviation. Trash stays visible on both collapsed and expanded rows (mockup placement wins over the EXPERIENCE.md expanded-only default). Dev Notes and EXPERIENCE.md updated below to stop contradicting the shipped code; the row/E2E tests that already assert always-visible placement are correct and do not need reverting.
- [x] [Review][Patch] `handleDeleteConfirm` unconditionally collapses/refocuses regardless of which note was deleted [src/components/packt/trip-notes-tab.tsx:101-120] — `setExpanded(null)` and `focusReturnNoteIdRef` are set from the deleted note's own index even when a *different* note is currently expanded. Deleting an unrelated note force-collapses/unmounts whatever editor is open (discarding in-flight edits), misdirects focus, and can suppress a legitimate "Note saved" announcement for the still-expanded note (guard at line 237-239 compares against `expandedNoteIdRef.current`, which this bug just nulled). Fix: only collapse/redirect focus when `noteId === expandedNoteIdRef.current`. Worth fixing regardless of the Trash-placement decision above, since it's a correct guard either way.
- [x] [Review][Patch] Delete-confirmation warning text isn't wired for screen readers [src/components/packt/trip-notes-delete-dialog.tsx:52,57-59] — "This note will be permanently removed. This cannot be undone." is a plain `<p>` instead of the app's `DialogDescription` primitive (`src/components/ui/dialog.tsx`), so it's never associated via `aria-describedby`. The manual `aria-describedby` on `DialogContent` only ever points at the error message, never the warning. Screen reader users opening the dialog never hear the irreversibility warning central to UX-DR8's accessible-confirmation contract.
- [x] [Review][Patch] No guard for the delete target vanishing while the confirm dialog is open [src/components/packt/trip-notes-tab.tsx:49-53] — an identical reconciliation effect exists for `expandedNoteId` but wasn't mirrored for `deleteTargetNoteId`. If the targeted note disappears from `notes` (e.g., concurrent delete by another collaborator), the dialog lingers with a generic "note" label and confirming re-invokes delete on a gone row.
- [x] [Review][Patch] Cancel/Esc focus restoration silently no-ops if the Trash button has left the DOM [src/components/packt/trip-notes-tab.tsx:92-98] — `document.getElementById('trip-note-delete-${noteId}')?.focus()` drops focus to `<body>` with no fallback when the element is gone (e.g., concurrent deletion), violating AC-2's "focus returns to the invoking Trash action."
- [x] [Review][Patch] Missing test for deleting the last note in a multi-note list [src/components/packt/trip-notes-tab.test.tsx] — the only scenario that exercises the `notes[deletedIndex - 1]` previous-disclosure fallback required by AC-3 / the story's own Testing Requirements is untested; only "next sibling exists" and "only note" are covered.
- [x] [Review][Patch] E2E step doesn't verify focus lands on the specific *next* note [tests/e2e/steps/trip-notes.steps.ts:1284-1290] — `the note titled {string} is absent and the next available disclosure is focused` only asserts *some* `button[id^="trip-note-disclosure-"]` is focused, not that it belongs to the specific expected note, so it would pass even if focus landed on the wrong note.
- [x] [Review][Patch] E2E step's row locator substring-matches note titles [tests/e2e/steps/trip-notes.steps.ts:56] — `.filter({ hasText: title })` would match multiple rows if one note's title is a substring of another's (e.g., "Pack" vs "Packing List"), throwing under Playwright strict mode. Scope by exact button name instead.
- [x] [Review][Patch] Dead `onRetry` prop on the delete dialog [src/components/packt/trip-notes-delete-dialog.tsx:15,77] — declared and documented but never passed by its only caller; Retry always falls back to `onConfirm`. Remove the unused prop (or wire it up if actually intended) — untested, unreachable branch otherwise.
- [x] [Review][Defer] No transaction around `deleteTripNote`'s select→access-check→delete sequence [src/app/(app)/trips/[tripId]/actions.ts:572-580] — deferred, pre-existing: identical unguarded pattern already used by `deleteEvent`, `deleteItineraryNote`, and others; the story's own Tasks/Subtasks explicitly called this out as "no transaction needed."
- [x] [Review][Defer] `setTimeout(..., 0)` focus restoration races the dialog's ~200ms CSS exit transition [src/components/packt/trip-notes-tab.tsx:98, trip-notes-delete-dialog.tsx:38] — deferred, pre-existing: identical timer-based focus pattern is already used around dialogs in `add-doc-dialog.tsx`, `add-reservation-doc-dialog.tsx`, and `new-trip-dialog.tsx`.

## Dev Notes

### What already exists (from Stories 1.1 + 1.2) — reuse, don't rebuild

- `src/components/packt/trip-notes-tab.tsx` (184 lines) owns: single-expand orchestration (`expandedNoteId` state + `expandedNoteIdRef`, `setExpanded()`), draft management (`isDraftOpen`), the tab-owned polite live region (`announceSaved()`, keyed span), and two focus-return mechanisms: the `[expandedNoteId, isDraftOpen]` effect that focuses `New Note` (blank-discard path) and the `[expandedNoteId]` effect that focuses `focusReturnNoteIdRef`'s disclosure. The delete path must reuse these — but see the effect-interplay warning in "Tab delete orchestration".
- `src/components/packt/trip-notes-row.tsx` (102 lines) is a `"use client"` disclosure: `<li className="flex items-start gap-3 ...">` → left `aria-hidden` StickyNote glyph span → `<div className="min-w-0 flex-1">` containing the trigger `<button id="trip-note-disclosure-{id}" aria-expanded aria-controls>` (full-width when collapsed; sr-only "Collapse {title}" + Chevron when expanded) and, only when expanded, `<div id="trip-note-region-{id}" role="region" aria-labelledby={regionLabelId}>` with an sr-only title label. The Trash action is added as a **sibling of that content div** (never inside the disclosure button), visible only when expanded (see placement decision below).
- `src/components/packt/trip-notes-editor.tsx` (271 lines) already carries the hard UX-DR6 machinery: create + edit modes, imperative `commit(): Promise<"saved"|"failed"|"clean">`, in-flight promise ref (`inFlightCommitRef`) that dedupes overlapping commits, `aria-busy`, delayed "Saving note", persistent inline error + Retry (focused on failure), `toast.error`, blank-discard/blank-edit-revert, unmount-commit effect (review-fix), and `handleBlur` that commits when `relatedTarget` leaves `containerRef`. The delete story must **extend its blur boundary**, not fork it.
- `src/app/(app)/trips/[tripId]/actions.ts` — `createTripNote` (526-546), `updateTripNote` (548-570), and the day-note `deleteNote` (516-524, the closest delete pattern: resolve note → silent no-op if missing → assert → `db.delete` → `revalidatePath`).
- `src/components/packt/delete-event-dialog.tsx` is the closest Dialog precedent (Base UI `Dialog`, destructive action, `showCloseButton={false}`) but it does **NOT** implement the full UX-DR8 contract — no status container, no busy announce, no persistent error + Retry. Do not copy its weaker behavior; UX-DR8 wins.
- `src/components/ui/dialog.tsx` — `DialogContent` spreads `...props` onto `DialogPrimitive.Popup`, and Base UI 1.4.1 Popup supports `initialFocus` (boolean | RefObject | function) — use it for "initial focus on Cancel".
- E2E: `tests/e2e/features/trip-notes.feature` (10 scenarios, `@feat:trip-notes`) + `tests/e2e/steps/trip-notes.steps.ts` (151 lines). `feature-map.mjs` entry `entry("trip-notes", ["src/components/packt/trip-notes-*.tsx", "src/lib/note-preview.ts"])` (line 179) already covers the new dialog component.
- `_bmad-output/implementation-artifacts/deferred-work.md` — the missing-note reconciliation is explicitly deferred to this story (see "Deferred-work wiring").

### Server action contract (AC-3, AC-4)

Add to `src/app/(app)/trips/[tripId]/actions.ts` (SHARED_GLOBS — no feature-map change):

```ts
export async function deleteTripNote(noteId: string): Promise<void>
```

Body, mirroring `updateTripNote` (548-570) and `deleteNote` (516-524):

1. `const user = await requireUser();`
2. Resolve `tripId`: `const [note] = await db.select({ tripId: notes.tripId }).from(notes).where(eq(notes.id, noteId)); if (!note) return;` — silent no-op on missing note (file style; also the runtime path that makes deferred-work reconciliation reachable).
3. `await assertTripAccess(tripId, user.id!, "editor");` — "editor" minimum, matching every other mutating action.
4. `await db.delete(notes).where(eq(notes.id, noteId));`
5. **No `db.transaction`, no `lockTripForUpdate`, no position compaction.** A single-row delete changes no ordering; a `position` gap is harmless (display is `ORDER BY position ASC`, and Story 1.4's reorder rewrites all positions). `createTripNote`'s shift-on-insert still works after gaps.
6. `revalidatePath(\`/trips/${tripId}\`);` returns `void`.
7. Errors thrown as plain `Error` (file style; no `{ ok }` envelope, no zod).

`actions.ts` is excluded from coverage, but `actions.test.ts` covers the trip-note actions and must be extended.

### Trash action placement (AC-1, AC-2) — always-visible (approved deviation, 2026-08-12 review)

- **RESOLVED 2026-08-12**: the Trash action renders on both collapsed and expanded rows, matching `mockups/key-notes-tab.html`. This was flagged in code review as a deviation from EXPERIENCE.md's "Delete is available only from Note expanded state" (Interaction Primitives) / "Delete control inside Note expanded state" (IA table) and from AC-1–AC-4's "Given an expanded Note" preconditions — the team accepted the always-visible placement as the intended behavior going forward. `EXPERIENCE.md` has been updated to match; treat future stories' references to "expanded-only" delete as superseded.
- Right-aligned sibling of the disclosure button, inside the same `<li>`, after the `min-w-0 flex-1` content div, on both collapsed and expanded rows. This keeps UX-DR6's control group (title, body, Retry, Delete) coherent while the row is expanded.
- Accessible name per the mockup: `aria-label="Delete {title}"` (use `getNoteTitle(note)` so untitled notes label from the implicit title), plus a `title="Delete note"` attribute. `Trash2` from lucide-react, `strokeWidth={1.5}` (AGENTS.md icon rule). `style={{ minHeight: 44, minWidth: 44 }}` (UX-DR12) — never ship a sub-44px target. Muted foreground (`var(--fg-3)`) matching the itinerary Event action treatment.
- **Never trigger the disclosure** (UX-DR5): the Trash is a separate `<button type="button">` outside the disclosure button; its click handler opens the dialog and must not call `onToggle`.
- Do NOT add the Reorder handle (`GripVertical`) — that is Story 1.4. Keep the `<ol>`/`<li>` + left-glyph + content flex layout so the handle slots in beside the Trash without restructuring.
- Because Trash is now reachable while a *different* note is expanded, delete orchestration in `trip-notes-tab.tsx` must only collapse/refocus the note that was actually deleted — see the "Tab delete orchestration" review patch below.

### Editor blur / delete-dialog interaction (UX-DR6) — do not silently commit or discard

UX-DR6: "moving among title, body, Retry, Delete, disclosure, and row controls does not commit or discard." Today `handleBlur` commits on any `relatedTarget` outside `containerRef` — so clicking the row's Trash (or the dialog's focus transfer) would fire a native autosave. **Extend the blur boundary to the whole row** so same-row focus moves don't native-commit:

```ts
function handleBlur(event: FocusEvent<HTMLDivElement>): void {
  const nextTarget = event.relatedTarget as Node | null;
  const row = containerRef.current?.closest("li");
  if (nextTarget && (containerRef.current?.contains(nextTarget) || row?.contains(nextTarget))) return;
  if (error) return;
  void commit();
}
```

Why this is safe (verify with the existing tests, which must keep passing):
- Collapse request / row switch / New-Note-open are **explicit tab gates** (`handleToggle`/`openDraft` call `commitCurrentEditor()`), so they still save-first even though the native blur no longer commits for same-row targets.
- Blur out of the row entirely (page whitespace, other rows, tab bar) still commits via `handleBlur`; the in-flight ref dedupes against any gate-triggered commit.
- The unmount-commit effect (review-fix) still covers programmatic tab switches / navigation.

Consequence for delete: activating Trash opens the dialog **without** an autosave; the expanded editor stays mounted underneath with its dirty state intact (neither committed nor discarded). If the user confirms, the note is deleted (dirty edits die with it — intended, the user chose delete). If they cancel, focus returns to the Trash and the editor keeps its dirty state (AC-2, UX-DR10 "cancel delete → returns to the invoking Delete control"). Pin both outcomes with tests.

### Delete confirmation dialog (AC-1–AC-4) — UX-DR8 contract

New `src/components/packt/trip-notes-delete-dialog.tsx` (name matches the `trip-notes-*.tsx` glob — no feature-map change). Base UI `Dialog` from `src/components/ui/dialog.tsx`, **not** the `alert-dialog` (UX-DR8 says existing Packt/Base UI confirmation `Dialog`). `showCloseButton={false}`, no Notes-specific modal styling (UX-DR13).

Props (controlled by the tab — the tab owns the list for focus-after-delete):
```ts
export interface TripNotesDeleteDialogProps {
  open: boolean;
  noteLabel: string;            // for title/announcement copy
  isDeleting: boolean;          // busy state
  error: string | null;         // persistent error shown on failure
  onOpenChange: (open: boolean) => void;   // Cancel/Esc/outside-press
  onConfirm: () => void | Promise<void>;   // tab runs deleteTripNote + focus logic
  onRetry?: () => void | Promise<void>;    // re-invokes onConfirm after a failure
}
```

Behavior (each is a test):
- **Open / initial focus**: `initialFocus={cancelButtonRef}` (Base UI Popup `initialFocus` passthrough through `DialogContent`) so focus lands on Cancel (AC-1). Title: `Delete {noteLabel}?` (consistent with `DeleteEventDialog`'s `Delete {eventName}?`). Description copy is not spine-specified — use a concise irreversible-removal sentence consistent with existing patterns (e.g. "This note will be permanently removed. This cannot be undone.").
- **Confirm (AC-3)**: focus moves to the dialog's **status container** (a `role="status"` div with `tabIndex={-1}` so it can receive programmatic focus), Cancel/Delete are `disabled`, the dialog is marked busy, and the status container announces "Deleting note". Then the tab's `onConfirm` runs `deleteTripNote`. Use `isDeleting` for the disabled/busy state.
- **Success**: tab closes the dialog, removes the note (props refresh via `revalidatePath`), announces "Note deleted" once via the tab's polite live region (UX-DR11 — server-confirmed delete announced exactly once), and moves focus per the list-focus rules.
- **Failure (AC-4)**: the dialog stays open, "Deleting note" is cleared, a persistent linked inline error appears (`role="alert"`, `aria-live="polite"`, matching the editor's inline-error treatment), focus moves to a **Retry** control (≥44×44px), and `toast.error(...)` supplements (never replaces) the dialog error. Retry re-runs the same mutation. Cancel remains available.
- **Cancel / Esc (AC-2)**: dialog closes via Base UI's `Esc`/close path (Base UI handles the key; `onOpenChange(false)`); the note stays in the list unchanged; focus returns to the invoking Trash action (the tab restores focus — the Trash button must still exist, which it does because the dialog did not remove anything).

The dialog component does **not** call `deleteTripNote` itself; the tab passes `onConfirm`. (Contrast `DeleteEventDialog`, which self-invokes — the tab owns the list, so focus-after-delete and the reconciliation guards belong there.) A unit test for the dialog can mock `onConfirm`.

### Tab delete orchestration + focus-after-delete (AC-2, AC-3)

- State: `deleteTargetNoteId: string | null` (the expanded note id whose Trash was activated) plus `isDeleting`, `deleteError`. The dialog renders when `deleteTargetNoteId !== null`, with `noteLabel` derived from the target note in `notes`.
- Trash activation (`onDeleteRequest` passed into the row): set `deleteTargetNoteId`. Do not close/collapse the editor and do not commit (per the blur-boundary change). The expanded editor stays mounted under the dialog.
- Confirm (`handleDeleteConfirm`):
  1. `setIsDeleting(true)`, `setDeleteError(null)` → the dialog moves focus to its status container and announces "Deleting note" (dialog-owned).
  2. `await deleteTripNote(noteId)`.
  3. On success: compute the focus target **from the current `notes` prop (pre-delete order)**: find the deleted note's index, pick `notes[index + 1]` else `notes[index - 1]` else `null`. Set `focusReturnNoteIdRef.current = nextId ?? null`, clear `deleteTargetNoteId`, `setExpanded(null)` (the deleted note was the expanded one), `announceDeleted()` ("Note deleted"). The existing `[expandedNoteId]` effect focuses `trip-note-disclosure-{nextId}`; when `nextId` is null the empty state's `New Note` takes focus (via the `[expandedNoteId, isDraftOpen]` effect). Add an `announceDeleted` alongside `announceSaved`.
  4. On failure: `setDeleteError(...)`, `setIsDeleting(false)` — dialog stays open, focuses Retry, toast already fired (or fires here).
  5. `finally`: `setIsDeleting(false)` on both paths.
- **Effect-interplay warning (pin with a test):** after a successful delete, both existing tab effects fire — the `[expandedNoteId, isDraftOpen]` effect focuses `New Note`, and the `[expandedNoteId]` focus-return effect focuses the target disclosure. They run in declaration order (New Note first, target second), so the target wins **only if** `focusReturnNoteIdRef` is set before `setExpanded(null)`. Sequence the delete-success handler accordingly and assert the final focus is the next/previous disclosure when one exists, and `New Note` only when none exists. Do not assume the empty-state focus effect silently "does the right thing".
- **Cancel / Esc (AC-2)**: `onOpenChange(false)` → `setDeleteTargetNoteId(null)`, `setIsDeleting(false)`, `setDeleteError(null)`, and focus returns to the invoking Trash action — store the invoking note id (it is `deleteTargetNoteId` itself) and, after the dialog closes, focus `trip-note-delete-{noteId}` (give the Trash a stable id like the disclosure: `trip-note-delete-${note.id}`). The note is unchanged; the editor's dirty state is untouched.

### Deferred-work wiring (required — was explicitly deferred to Story 1.3)

From `_bmad-output/implementation-artifacts/deferred-work.md`: "`updateTripNote` silently no-ops when the note is gone, but the client still announces 'Note saved' and resets its baseline, and `expandedNoteId` is never reconciled against the `notes` prop. Unreachable today (no delete action exists); **wire reconciliation + a client-side guard into Story 1.3.**"

This is now reachable. Implement both:
1. **`expandedNoteId` reconciliation**: an effect that clears the expanded note when it is no longer present in `notes`:
   ```ts
   useEffect(() => {
     if (expandedNoteId && !notes.some((note) => note.id === expandedNoteId)) setExpanded(null);
   }, [notes, expandedNoteId]);
   ```
2. **Stale-save guard**: a confirmed delete can race an in-flight (or unmount-triggered) `updateTripNote` on the deleted note — the server no-ops but the editor's success path would call `onSaved` and the tab would announce "Note saved" for a note that no longer exists. Guard the edit-mode `onSaved` so it announces only while the note is still the expanded one, e.g. pass `onSaved={() => { if (expandedNoteIdRef.current === note.id) announceSaved(); }}` for the edit-mode editor (create-mode keeps plain `announceSaved`). No stale "Note saved" may follow a confirmed delete. Pin with a test that simulates the race.

### Announcements (UX-DR11)

- "Deleting note" — announced by the **dialog's** status container during the pending request (AC-3), not the tab's polite region.
- "Note deleted" — announced **exactly once** by the tab's polite live region after server confirmation. Never announce optimistic state as deleted.
- Failure — the dialog's persistent inline error (assertive/persistent) + Failure toast; never the polite saved-region.
- Each mutation (delete vs a concurrent save) announces once; the stale-save guard prevents double/incorrect announcements.

### What must be preserved (regression guard)

- Day-note machinery (`itineraryNotes`, `createNote`/`updateNote`/`deleteNote`, `NoteItem`) — untouched; day-planning E2E keeps passing.
- `createTripNote`/`updateTripNote`, create-mode editor, single-expand gates, blank-discard/blank-edit-revert, live-region pattern — all unchanged. The blur-boundary extension must keep every existing editor/tab/row test green (verify the tests that assert blur-to-row-control commits: they must now pass via the tab gate, not the native blur).
- `notes.position` semantics: do not compact positions on delete; `updateTripNote` still never touches `position`; Story 1.4 rewrites positions.
- No new libraries, no new CSS tokens, no hardcoded colors, no arbitrary Tailwind values, icons `strokeWidth={1.5}`, `cn()` for class merging, ≥44×44px targets.
- `src/components/packt/trip-notes-*.tsx` glob already covers the new dialog — no `feature-map.mjs` change; do not add a non-`trip-notes-`-prefixed packt component.

### Known shared-infra note

The trip-detail tab bar still lacks ARIA `tablist`/`tab` semantics (UX-DR1) — out of scope for the whole epic. Also: the editor's unmount-commit (review-fix) may fire `commit()` for a note deleted elsewhere (e.g. another collaborator); that resolves to `updateTripNote`'s silent no-op and is rendered harmless by the stale-save guard — no extra work needed, but do not "fix" the silent no-op into an error (deferred-work explicitly chose the client-side guard over changing the action).

## Dev Notes — Previous Story Intelligence

Story 1.2 (`1-2-expand-and-edit-a-note-in-place.md`) built the state this story extends. Actionable learnings:

- **The `commit()` + in-flight-ref design is load-bearing.** Do not touch `TripNotesEditorCommitResult` semantics or the dedupe. The delete flow must not fight it — it rides on top (blur-boundary extension + explicit tab gates).
- **Story 1.2 review findings were patched in commit `2575f7e` ("fix: resolve trip note editor review findings")** and are present in the current source: single-field clears persist as `null` (action lines 556-557), unmount-commit saves dirty edits when no blur fires (editor lines 70-78), blur stays silent after a failed save until Retry (editor line 167), whitespace-only edits restore trimmed baseline (editor lines 108-111), the toggle re-reads the latest state via `expandedNoteIdRef` (tab lines 79-97), the region is labelled from the note title not the collapse verb (row `regionLabelId`), and E2E pins disclosure focus + 44px geometry (feature lines 43-51, steps 95-103). **Preserve all of these.**
- **Deferred to this story**: the missing-note reconciliation (see Deferred-work wiring) — it is now reachable because delete exists.
- **Focus-return pattern**: `focusReturnNoteIdRef` + the `[expandedNoteId]` effect is the established mechanism (used for collapse). Reuse it for delete's next/previous focus; mind the New-Note-effect interplay (see Tab orchestration).
- **Mockup-vs-spine**: the mockup shows Trash on every row; EXPERIENCE.md/FR-5/ACs say "from its expanded state". Spines win. If you disagree, flag it in review — do not silently implement both.
- Story 1.1's E2E registered `entry("trip-notes", [...])` — new/changed components and the dialog are already feature-mapped; `actions.ts` is `SHARED_GLOBS` (full-suite on affected is expected, as in Stories 1.1/1.2).
- Story 1.1 deferred work: the trip-detail header overflow at 320px/200% is pre-existing and out of scope.

## Dev Notes — Git Intelligence

Current branch `feature/trip-notes`, clean tree. Recent commits (`git log --oneline -15`):

- `eb68465 Merge pull request #231 from sdesmond/story/1-2-expand-and-edit-a-note-in-place`
- `2575f7e fix: resolve trip note editor review findings` — the load-bearing fixes above
- `b0c5a9d fix: stop duplicating note title/preview in expanded editor` / `8d5792d fix: improve trip note scanability`
- `0501f5a docs: record story 1.2 completion`
- `2c62a04 feat: keep trip note edits in context` / `59c450e feat: enable safe trip note updates`
- `9b15852 Merge pull request #230 from sdesmond/story/1-1-create-and-view-trip-notes`

Patterns: work on feature branches (e.g. `story/1-3-delete-a-note`), Conventional Commits, merge PRs with merge commits, **no AI attribution trailers**. Ask the user per the branch-confirmation gate before starting, and follow the same commit/PR conventions. Story 1.2 sits in `review` in `sprint-status.yaml` — do not flip its status; this story only flips `1-3` to `ready-for-dev`.

## Dev Notes — Latest Tech Information

- **No new dependencies.** Everything needed is in the repo and proven: Base UI 1.4.1 `Dialog` (with Popup `initialFocus` support — confirmed in `node_modules/@base-ui/react/esm/dialog/popup/DialogPopup.d.ts:22`), Next.js 16.2.4 (Server Actions + `revalidatePath` update the current view, matching `createTripNote`/`updateTripNote`), Drizzle 0.45.2 (`db.delete`), lucide-react, sonner. Do not add an alert-dialog for this (UX-DR8 mandates the existing confirmation `Dialog`), no zod.
- Next.js 16: no `revalidateTag`, no new API surface needed. Consult `node_modules/next/dist/docs/` before any Next.js-specific code.
- `bddgen` must run before `playwright test` for changed `.feature` files (scripted by `test:e2e:*`).
- Base UI Dialog focus management: `Esc`/outside-press close via the root's `onOpenChange`; the modal traps focus while open — the editor stays mounted underneath and is untouched.

## Project Context Reference

Read `_bmad-output/project-context.md` before implementing (summarized in the Dev Notes above). Non-negotiable items for this story:

- `strict: true`, no `any`, no single-letter variable names (only `for` loop `i`).
- `ComponentNameProps` interface + destructured props on every component; `"use client"` first line of interactive components.
- `cn()` for className merging; colors only via CSS custom properties; no arbitrary Tailwind values; Lucide `strokeWidth={1.5}`; icon buttons need `title`; ≥44×44px interactive targets.
- Dates ISO 8601; enums as `const obj + union`.
- Server actions: `"use server"`, `requireUser()` + `assertTripAccess()` before any read/write, `revalidatePath` after mutation.
- `src/lib/queries.ts` and `src/lib/auth-helpers.ts` are `server-only` — never import from client components.
- Unit tests colocated (`foo.tsx` → `foo.test.tsx`); mock `sonner` via `vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))` and import the mock after; global `next/navigation`/`next/headers` mocks already exist in `vitest.setup.mts`.
- Coverage: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`. `src/app/**` and `src/components/ui/**` are excluded.
- E2E: scenario-owned fixtures via the mother/materializer helpers in `tests/e2e/`; do not add feature rows to `global-setup.ts`.

## Dev Notes — Testing Requirements (name tests before coding)

### Unit / component tests (Vitest, colocated, first)

- `src/app/(app)/trips/[tripId]/actions.test.ts` (UPDATE): `deleteTripNote` — asserts editor access with `"editor"`; resolves `tripId` from the note and silently no-ops on a missing note; deletes the row; calls `revalidatePath("/trips/{tripId}")`; access-denied propagation.
- `src/components/packt/trip-notes-delete-dialog.tsx` → `trip-notes-delete-dialog.test.tsx` (NEW): renders title `Delete {label}?` with Cancel + destructive Delete; initial focus is Cancel; confirming calls `onConfirm`; while `isDeleting` the Cancel/Delete are disabled and the status container announces "Deleting note"; failure shows a persistent linked error and focuses Retry; Retry re-invokes the confirm; Cancel calls `onOpenChange(false)`; all interactive controls ≥44×44px; `toast.error` fires on failure (mock `sonner`; the dialog test can mock `onConfirm`).
- `src/components/packt/trip-notes-row.tsx` → `trip-notes-row.test.tsx` (UPDATE): Trash action renders **only when expanded**; `aria-label="Delete {title}"` (uses the implicit title for untitled notes); `title` attribute present; 44×44px; clicking Trash calls `onDeleteRequest(note.id)` and does **not** call `onToggle`; Trash is not inside the disclosure button; collapsed rows render no Trash; existing disclosure/region tests keep passing.
- `src/components/packt/trip-notes-editor.tsx` → `trip-notes-editor.test.tsx` (UPDATE): blurring from a field to the row's Trash (or any same-`<li>` control) does NOT call `updateTripNote`/`createTripNote`; blurring out of the row still autosaves; all existing create/edit-mode tests keep passing (the blur-boundary extension must not regress "blur outside commits").
- `src/components/packt/trip-notes-tab.tsx` → `trip-notes-tab.test.tsx` (UPDATE): activating Trash on the expanded note opens the dialog without committing and without collapsing; Cancel closes the dialog, leaves the note and the editor's dirty state intact, and returns focus to the invoking Trash; Confirm calls `deleteTripNote`, on success clears `expandedNoteId`, announces "Note deleted" once, and focuses the **next disclosure** (else previous, else `New Note` — pin all three); failure keeps the dialog open with the note intact and a toast; the stale-save guard suppresses "Note saved" for a deleted note (simulate the race: delete confirms while an `updateTripNote` resolves after); `expandedNoteId` reconciliation clears an expanded note that disappears from `notes`. Add `deleteTripNote` to the existing actions mock.
- `src/lib/note-preview.ts` and `src/data/types.ts` — unchanged (no new types needed; `deleteTripNote(noteId)` needs no input type).

### E2E (Playwright BDD, `tests/e2e/`)

- `tests/e2e/features/trip-notes.feature` (UPDATE, `@feat:trip-notes`): add scenarios — (1) deleting a note from its expanded state opens the confirmation dialog and confirming removes it (assert row gone, next note's disclosure focused); (2) cancelling the delete dialog leaves the note in the list (assert dialog closed, focus back on the Trash); (3) deleting the only note returns to the empty state with `New Note` visible. Failure/announcement/geometry live in unit tests (no duplication across layers).
- `tests/e2e/steps/trip-notes.steps.ts` (UPDATE): steps for activating the Trash (`I delete the note titled {string}` → expand if needed, click `Delete {title}`), asserting the dialog opened with Cancel focused, cancelling, confirming, and asserting focus landed on the next disclosure / `New Note`. Reuse the scenario-owned fixture (`scenario.ensureCurrentTrip()`) and existing Notes-tab steps.
- No `feature-map.mjs` change: `trip-notes-*.tsx` (including the new dialog) is already mapped to `@feat:trip-notes`; `actions.ts` and `src/data/**` are `SHARED_GLOBS`.

### Expected validator behavior

Editing `actions.ts` matches `SHARED_GLOBS` → `test:e2e:affected` runs the **full** suite; the `trip-notes-*.tsx` changes run `@feat:trip-notes`. That is expected (same as Stories 1.1/1.2); do not try to avoid it. Run targeted Vitest files first, then `packt-build-validator` once after the change is complete.

## Project Structure Notes

- New dialog component → `src/components/packt/trip-notes-delete-dialog.tsx` (covered by the existing `trip-notes` feature-map glob).
- Domain components → `src/components/packt/`, prefixed `trip-notes-` (required — `scripts/feature-map.test.mjs` fails on unmapped `packt/*` components).
- Types → none new (`deleteTripNote` takes only `noteId`).
- Server action → existing `src/app/(app)/trips/[tripId]/actions.ts`.
- E2E → existing `tests/e2e/features/trip-notes.feature` + `tests/e2e/steps/trip-notes.steps.ts`.
- No conflicts with the unified structure detected; no new files beyond the dialog component.

### References

- [Source: epics.md#Story 1.3] — ACs 1-4 verbatim; [Source: epics.md#Additional Requirements] — action/type/mapper conventions.
- [Source: prds/prd-packt-2026-08-07/prd.md#FR-5] — delete-from-expanded-state, one explicit confirmation, no soft-delete/undo.
- [Source: ux-designs/ux-packt-2026-08-08/EXPERIENCE.md#Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor] — UX-DR8 dialog contract, UX-DR6 no-commit/no-discard control set, UX-DR10 focus lifecycle (cancel→Trash, success→next/prev/New Note), UX-DR11 once-per-mutation announcements, 44px floor, "Delete is available only from Note expanded state".
- [Source: ux-designs/ux-packt-2026-08-08/DESIGN.md#Components] — Trash icon treatment (itinerary Event action), confirmation Dialog with destructive action, no Notes-specific modal styling.
- [Source: ux-designs/ux-packt-2026-08-08/mockups/key-notes-tab.html] — row anatomy + `Delete {label}` accessible name (illustrative; loses to spines on Trash placement).
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — missing-note reconciliation explicitly deferred to Story 1.3.
- [Source: 1-2-expand-and-edit-a-note-in-place.md] — previous story (review findings patched in `2575f7e`, focus-return patterns, testing conventions).
- [Source: src/components/packt/trip-notes-tab.tsx] — tab to extend (deleteTarget state, focus effects, live region).
- [Source: src/components/packt/trip-notes-editor.tsx:164-169] — blur handler to extend to the row boundary.
- [Source: src/components/packt/trip-notes-row.tsx] — row to extend (Trash sibling of the disclosure).
- [Source: src/app/(app)/trips/[tripId]/actions.ts:516-524, 526-546, 548-570] — `deleteNote`/`createTripNote`/`updateTripNote` patterns to mirror.
- [Source: src/components/packt/delete-event-dialog.tsx] — closest Dialog precedent (weaker than UX-DR8; do not copy the gaps).
- [Source: src/components/ui/dialog.tsx] + `node_modules/@base-ui/react/esm/dialog/popup/DialogPopup.d.ts:22` — `initialFocus` passthrough.
- [Source: tests/e2e/features/trip-notes.feature] + `steps/trip-notes.steps.ts` + `feature-map.mjs:179` — E2E to extend; map already covers the dialog.

## Dev Agent Record

### Agent Model Used

- Story authoring: Big-pickle (opencode), via `bmad-create-story`.

### Debug Log References

- `npx vitest run 'src/app/(app)/trips/[tripId]/actions.test.ts' src/components/packt/trip-notes-row.test.tsx src/components/packt/trip-notes-editor.test.tsx src/components/packt/trip-notes-tab.test.tsx src/components/packt/trip-notes-delete-dialog.test.tsx` — 106 passed.
- `npm run test:coverage` — 212 files, 3,311 tests passed; 96.32% lines, 96.59% functions, 90.53% branches.
- `npm run test:e2e:affected` — 206 scenarios passed.
- `npm run lint`, `npx tsc --noEmit`, and isolated production build passed.

### Implementation Plan

- Implement tasks in story order with targeted red-green-refactor cycles (server action + tests, dialog + tests, row Trash + tests, editor blur boundary + tests, tab orchestration + tests, then E2E), then run the project validator once after all targeted tests pass.

### Completion Notes List

- Ultimate context engine analysis completed — comprehensive developer guide created.
- Added accessible confirmed note deletion with status/error feedback, predictable focus recovery, and stale-save protection.
- Preserved pending editor state when moving to same-row controls and prevented duplicate creates during successful editor unmount cleanup.
- Follow-up: restored right-aligned disclosure control and exposed the delete action in both collapsed and expanded note states.

### File List

**New files**
- `_bmad-output/implementation-artifacts/1-3-delete-a-note.md`
- `src/components/packt/trip-notes-delete-dialog.tsx`
- `src/components/packt/trip-notes-delete-dialog.test.tsx`

**Modified files**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (expected by workflow)
- `src/app/(app)/trips/[tripId]/actions.ts` — add `deleteTripNote`
- `src/app/(app)/trips/[tripId]/actions.test.ts` — `deleteTripNote` test suite
- `src/components/packt/trip-notes-row.tsx` + `trip-notes-row.test.tsx` — Trash action (expanded state)
- `src/components/packt/trip-notes-editor.tsx` + `trip-notes-editor.test.tsx` — row-boundary blur extension
- `src/components/packt/trip-notes-tab.tsx` + `trip-notes-tab.test.tsx` — delete orchestration, focus-after-delete, reconciliation guards
- `tests/e2e/features/trip-notes.feature` + `tests/e2e/steps/trip-notes.steps.ts` — delete scenarios/steps

**Database** — none (no schema change in this story).

## Change Log

| Date       | Change |
| ---------- | ----------------------------------------------------------------------------------------- |
| 2026-08-12 | Story created from epics.md Story 1.3; full context analysis against Stories 1.1/1.2 implementation (including review-fix commit `2575f7e`), PRD, UX spine + mockup, deferred-work, and current source. |
| 2026-08-12 | Implemented confirmed note deletion, editor focus/cleanup safeguards, and unit/E2E coverage; status moved to review. |
| 2026-08-12 | Follow-up: made delete available in both note states and corrected the expanded disclosure alignment. |
| 2026-08-12 | Code review: approved always-visible Trash as an intentional deviation (EXPERIENCE.md updated); applied 8 patches (delete-scoped collapse/focus guard, DialogDescription accessibility wiring, vanished-target reconciliation, focus-restore fallback, removed dead `onRetry` prop, added last-note-focus and unrelated-note-collapse regression tests, tightened E2E next-note and row-locator assertions); deferred 2 pre-existing issues (TOCTOU on delete, timer-based focus pattern) to deferred-work.md. Status moved to done. |
