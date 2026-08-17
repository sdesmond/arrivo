---
stepsCompleted: ["step-01-validate-prerequisites", "requirements-confirmed", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-08-07/prd.md
  - _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-08-08/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-08-08/EXPERIENCE.md
  - _bmad-output/project-context.md
---

# packt - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for packt, decomposing the requirements from the PRD (Trip Notes), UX Design Spine (Trip Notes), and existing project architecture conventions (`project-context.md` — no standalone Architecture.md exists for this brownfield feature) into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: A trip collaborator with access to the trip can create a new Note from the Trip Notes section, with an optional title and a body.
- Saving a Note with no title uses its first line as the displayed title/preview — the row is never title-only.
- A Note with a title but no body shows that title as both title and preview (no separate "no body" state).
- Saves automatically on blur or on collapse — there is no explicit Save button.
- A Note with no title and no body (fully blank) is not saved: it is discarded rather than added to the list.
- A newly created Note appears at the top of the list (newest-first default order) immediately after saving.
- Creating a Note is available both from the empty state's "New Note" button and from a persistent add action once Notes exist.
- No cap on the number of Notes per trip, and no cap on a Note's title or body length.

FR-2: Each Note in the list renders collapsed, showing its title (or implicit first-line title) and a one-line body preview.
- Every row shows a non-empty preview line — a Note with only a title and no further body still shows that title as both title and preview (per FR-1).
- The list is available and behaves identically whether the current date is before, during, or after the trip's date range.
- Out of scope: full-text or keyword search across Notes.

FR-3: Tapping/activating a collapsed Note row expands it in place to show the full body, without navigating away or opening a dialog.
- Only one Note is expanded at a time — expanding a collapsed Note automatically collapses whichever Note was previously expanded.
- If the previously expanded Note had unsaved edits, it autosaves before collapsing — auto-collapse never silently discards an in-progress edit.
- Collapsing a previously expanded Note returns it to the title + one-line-preview row.

FR-4: From its expanded state, a trip collaborator with access to the trip can edit a Note's title and/or body.
- Edits save automatically on blur or on collapse (same trigger as FR-1) — there is no explicit Save button.
- Saved edits update the collapsed preview as soon as the Note next collapses.
- Editing does not change the Note's position in manual sort order (only explicit reordering does — see FR-6).

FR-5: From its expanded state, a trip collaborator with access to the trip can delete a Note, gated by a lightweight confirmation consistent with existing removal patterns (e.g., Packing List item removal, Document removal).
- Delete requires one explicit confirmation step — not a silent/instant delete, not a heavy blocking modal.
- Deleted Notes are removed from the list with no soft-delete/undo requirement in this scope.

FR-6: A trip collaborator with access to the trip can manually reorder Notes, overriding the newest-first default.
- Manual order persists across sessions and page reloads.
- Reorder interaction (e.g. drag handle vs. up/down controls) is left to UX/implementation, consistent with whatever mechanism the existing Packing List / Itinerary reordering already uses.
- New Notes created after a manual reorder still insert at the top (newest-first), per FR-1, until the user moves them.

FR-7: When a trip has zero Notes, Trip Notes shows an icon/title/description empty state with a "New Note" action, matching the Packing List and Documents empty-state pattern.
- No always-visible capture input bar is shown in the empty state (explicitly not the Keep-style pattern).

### NonFunctional Requirements

The PRD does not define a separate numbered NFR list for this feature. Non-functional constraints instead surface through:
- The UX Design Requirements below (WCAG 2.2 AA accessibility target, 44×44px interactive-target floor, reduced-motion behavior, 200% text resize / 320 CSS px reflow, live-region announcement contracts).
- The Additional Requirements below (existing auth/access-control invariants, existing DB/action/testing conventions that any new Notes code must conform to).

No performance, scalability, or compliance NFRs beyond these were identified in the PRD.

### Additional Requirements

_Derived from `project-context.md` in place of a dedicated Architecture.md — this is a brownfield feature extending Packt's existing stack, not a new system._

- New domain type(s) (e.g. `Note`) must be added exclusively to `src/data/types.ts` — never redefined locally in components or actions.
- New DB table (e.g. `notes`) in `src/db/schema.ts` following existing conventions: `uuid().primaryKey().default(sql\`gen_random_uuid()\`)`, and a `position: integer` column to persist manual order — mirrors the existing ordering pattern used by Itinerary Events and Packing List items.
- New DB mapper (e.g. `dbNoteToType()`) added to `src/lib/db-mappers.ts`; queries and actions must use it rather than mapping raw DB rows directly.
- Server actions for create/update/delete/reorder Notes live alongside the trip route (`"use server"`, e.g. under `src/app/(app)/trips/[tripId]/`); each action calls `requireUser()` then `assertTripAccess()` before any read/write, and calls `revalidatePath(\`/trips/\${tripId}\`)` after any mutation.
- No new per-collaborator permission model — Notes inherits whatever access level a trip already grants (per PRD §6.2); use the existing role hierarchy (`"viewer" < "editor" < "owner"`), consistent with the "editor" minimum used by other mutating actions.
- Failure surfaces use the existing `sonner` toast pattern (`toast.error(message)`); unit tests mock `sonner` per the existing project convention rather than re-mocking ad hoc.
- New client components live in `src/components/packt/` (e.g. a Notes list/row/editor set) following the existing `ComponentNameProps` interface + destructured-props convention; reuse existing primitives from `src/components/ui/` (Dialog, Empty, etc.) rather than introducing new ones.
- Manual reorder likely reuses `@dnd-kit/core` + `@dnd-kit/sortable`, already a project dependency, consistent with existing Itinerary/Packing List drag-and-drop.
- Icons via `lucide-react` only, always `strokeWidth={1.5}`; icon-only buttons require a `title` attribute.
- Colors via existing CSS custom properties only (no hardcoded hex/rgb, no new tokens); no arbitrary Tailwind values.
- Unit tests colocated next to source (`src/lib/**`, `src/components/packt/**`); any new/changed file in those directories needs a matching `*.test.ts(x)` in the same change; coverage thresholds (≥95% lines/functions, ≥90% branches) apply.
- New user-facing flow requires a new `.feature` file (Gherkin) under `tests/e2e/features/`, tagged `@feat:<stem>`, with matching step definitions in `tests/e2e/steps/`, and registration in `tests/e2e/feature-map.mjs` so `test:e2e:affected` picks it up.

### UX Design Requirements

UX-DR1: Notes tab reuses the existing trip-detail ARIA tablist/tab/tabpanel pattern for in-place panel switching — container `tablist`, Notes control as `tab` with `aria-selected` and roving `tabindex`, `aria-controls` linking to the Notes `tabpanel`; Left/Right move among tabs, Home/End jump to boundaries, Enter/Space activates. No new tab visual treatment or badge.

UX-DR2: Empty state uses the existing Packt `Empty` icon/title/description/action composition with a `New Note` action; icon is decorative and hidden from assistive technology unless it conveys meaning not present in title/description. No always-visible capture-bar UI.

UX-DR3: Populated state exposes the existing compact outline "New Note" add action at upper right, matching current trip-detail add actions, with a minimum 44×44px interactive target.

UX-DR4: Note row follows the existing itinerary Event row anatomy exactly: semantic `ol` containing `li` rows in persisted visual order, left Note glyph, inline title/preview content, right Reorder handle, right Trash action. Collapsed row always shows title-or-implicit-first-line-title plus one non-empty body-preview line — never title-only. This is a deliberate, intentional deviation from the existing Packing List collapse pattern (which is title-only) and must not be "corrected" to match it. No card-like field chrome, checkbox, completion mark, status badge, or task color anywhere in the row.

UX-DR5: Disclosure/expand-in-place behavior needs a stable `id`, `aria-expanded`, and `aria-controls` on the trigger, with a matching `id`, `role="region"`, and `aria-labelledby` on the expanded region; the expanded region leaves the accessibility tree entirely when collapsed. Only one Note is expanded at a time; activating a second Note's disclosure requests a save of the first, and only a successful save collapses the first and expands the second — a failed save keeps the first editor open and does not open the second. Reorder-handle and Trash-icon activation must never trigger the disclosure.

UX-DR6: Note editor (optional title + body) is a single inline, borderless editor composite — no boxed inputs, no separate form panel, no Save button, no saved badge. "Blur" means focus leaves the complete composite (via `relatedTarget`/focus-within semantics); moving among title, body, Retry, Delete, disclosure, and row controls does not commit or discard. A commit request serializes the latest value, sets the editor `aria-busy`, announces a delayed "Saving note," and queues/blocks later transition requests until the server confirms. A fully blank title+body composite discards on blur/collapse rather than creating a Note.

UX-DR7: Reorder handle matches the existing itinerary Event drag-handle treatment exactly: `GripVertical` icon, `strokeWidth={1.5}`, muted foreground (`var(--fg-3)`), 44×44px target, existing focus treatment. The handle itself moves the Note — no separate visible Move up/down controls. Keyboard: Space/Enter lift/drop, Up/Down move vertically, Escape cancels (no mutation, restores original order); Left/Right do nothing. One live region announces lift instructions, `position X of N` on each candidate position, invalid-boundary attempts, drop, cancel, and failure rollback with restored position. New Notes always insert at top regardless of prior manual reordering. This inherits the itinerary Event pattern's accepted WCAG 2.5.7 non-conformance (pointer+keyboard drag, no separate pointer-only Move controls) rather than introducing a new deviation.

UX-DR8: Delete uses the existing Packt/Base UI confirmation `Dialog` with a destructive action — Trash icon (existing itinerary Event action treatment) opens the dialog; initial focus is Cancel. Confirm is irrevocable: moves focus to the dialog's status container, disables Cancel/Delete, sets the dialog busy, and announces "Deleting note." Failure keeps the dialog open with a persistent error and focuses Retry; success removes the Note and moves focus to the next disclosure, else the previous one, else New Note. No text Delete button inside the expanded row itself, and no Notes-specific modal styling.

UX-DR9: Save/delete/reorder failures surface via the existing bottom-center Packt/Sonner error toast, supplementing (never replacing) the persistent contextual inline/dialog error and its recovery control — the toast never owns the only recovery instructions. No Notes-specific toast color, placement, icon, or motion.

UX-DR10: Focus lifecycle must be implemented exactly per spec, not left to default browser behavior: New Note → title field; expand → title field; cancel delete → returns to the invoking Delete control; successful delete → next disclosure, else previous, else New Note; blank discard → New Note; failed save → stays in the failed editor; failed delete → safe dialog recovery control; reorder success/failure → same handle (in its new or restored position).

UX-DR11: A single polite live status region announces server-confirmed create/save/delete/reorder exactly once per mutation (e.g. "Note saved," "Deleting note," reorder position updates); a separate assertive/persistent-error announcement handles failures. Optimistic (unconfirmed) state must never be announced as saved, and the same mutation's success must never be announced twice (e.g. once for blur, once for collapse).

UX-DR12: Accessibility/responsive floor — all interactive targets (New Note action, disclosure trigger, Reorder handle, inline editor controls, Trash action) remain at least 44×44px; layout reflows at 320 CSS px width and 200% text resize without two-dimensional page scrolling or clipped focus; the editor grows or provides keyboard-operable vertical scrolling; under `prefers-reduced-motion: reduce`, disclosure transitions, list-shift animation, drag overlays, and toast entrance/exit motion are suppressed, and motion never by itself communicates saved/moved/failed state.

UX-DR13: No new color, typography, elevation, shape, or motion tokens — Trip Notes inherits Packt's current CSS custom properties, type ramp, dark mode, radii, and depth rules exactly as enumerated in `DESIGN.md`. In particular, Notes UI must never show checkbox, completion-mark, progress, or task-status styling anywhere, and must not introduce a new button/drag/modal/toast/focus/theme variant.

### FR Coverage Map

FR-1: Epic 1 - Create a Note (empty-state and persistent add action, autosave, blank-discard)
FR-2: Epic 1 - View the collapsed Trip Notes list (title/implicit-title + one-line preview)
FR-3: Epic 1 - Expand a Note in place (single-expand accordion behavior)
FR-4: Epic 1 - Edit a Note from its expanded state
FR-5: Epic 1 - Delete a Note with lightweight confirmation
FR-6: Epic 1 - Manually reorder Notes (persisted order)
FR-7: Epic 1 - Empty state with "New Note" action

## Epic List

### Epic 1: Trip Notes
Trip collaborators get a dedicated, trip-level place to capture, scan, edit, delete, and reorder discrete memory-aid notes — separate from Day Notes, Documents, and Packing List, and never carrying task/checkbox state.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

---

## Epic 1: Trip Notes

Trip collaborators get a dedicated, trip-level place to capture, scan, edit, delete, and reorder discrete memory-aid notes — separate from Day Notes, Documents, and Packing List, and never carrying task/checkbox state.

### Story 1.1: Create and view Trip Notes

As a trip collaborator,
I want to open a Notes tab on my trip and add discrete notes to it,
So that I can capture planning thoughts immediately without deciding whether they belong in a Day Note or a Document.

**Acceptance Criteria:**

**Given** a trip with zero Notes
**When** a collaborator with trip access activates the existing `notes` tab value on trip detail (`TripDetailTab.Notes`, already reserved in `resolveTripDetailTab`/`buildTripDetailTabHref` but not yet rendered)
**Then** the Notes panel renders the existing Packt `Empty` icon/title/description/action composition with a `New Note` action, and no always-visible capture bar (FR-7, UX-DR2)

**Given** the empty Notes tab
**When** the collaborator activates `New Note` and types only whitespace/nothing into title and body, then moves focus away from the editor composite
**Then** no Note is created and the empty state remains (FR-1)

**Given** the empty or populated Notes tab
**When** the collaborator activates `New Note` (empty-state action or the persistent upper-right compact outline action once Notes exist) and enters a non-blank title and/or body, then blurs the full editor composite or collapses it
**Then** a `notes` row is persisted via a new server action that calls `requireUser()` then `assertTripAccess()` and `revalidatePath` on success, the Note appears at the top of the list (newest-first), and status is announced once via a polite live region ("Note saved") (FR-1, UX-DR3, UX-DR11)

**Given** a Note with a title but no body
**When** it renders collapsed in the list
**Then** the title displays as both the title and the preview line — never an empty-preview state (FR-1, FR-2)

**Given** a Note with no title
**When** it renders collapsed in the list
**Then** its first body line displays as the implicit title, and the row is never title-only (FR-2, UX-DR4 — intentional deviation from Packing List's title-only collapse; must not be "corrected" to match it)

**Given** one or more Notes exist
**When** the collaborator views the Notes tab at any point before, during, or after the trip's date range
**Then** the list renders identically with no date-dependent mode switch (FR-2)

**Given** the populated Notes tab
**When** rendered on desktop or mobile viewports, including 320 CSS px width and 200% text resize
**Then** the `New Note` action, and every row's interactive elements, remain at least 44×44px and the layout reflows without two-dimensional scrolling (UX-DR3, UX-DR12)

**Given** the new `notes` DB table and `dbNoteToType()` mapper
**When** Notes are created for a trip
**Then** each row stores a `position: integer` column following the existing Itinerary/Packing List ordering convention, ready to support manual reordering added later in this epic (Additional Requirements)

**Given** the empty or populated Notes tab
**When** the collaborator enters a non-blank title and/or body and the create request fails
**Then** the editor stays open with the dirty value intact, a persistent linked inline error appears, a Retry control is focused, and a Failure toast supplements the inline error — the Note is not added to the list (FR-1, UX-DR6, UX-DR9, UX-DR10)

### Story 1.2: Expand and edit a Note in place

As a trip collaborator,
I want to tap a Note to see its full content and edit it right there,
So that I can update or re-read a thought without leaving the Notes tab or losing my place.

**Acceptance Criteria:**

**Given** a collapsed Note row
**When** the collaborator activates its disclosure (click, tap, Enter, or Space)
**Then** it expands in place to reveal the full body in an inline editor composite (no dialog, no route change), with a stable `id`, `aria-expanded`, and `aria-controls` on the trigger and a matching `id`, `role="region"`, `aria-labelledby` on the expanded region, and focus moves to the title field (FR-3, UX-DR5, UX-DR10)

**Given** a Note already expanded with unsaved edits
**When** the collaborator activates a different Note's disclosure
**Then** the first Note's edits are committed and only a confirmed save collapses the first and expands the second — a failed save keeps the first open and does not expand the second (FR-3, UX-DR5)

**Given** an expanded Note
**When** the collaborator edits the title and/or body and then blurs the complete editor composite (not just one field) or requests collapse
**Then** the edit autosaves with no explicit Save button, the editor sets `aria-busy` during the request, and "Note saved" is announced once via the polite live region on confirmed success (FR-4, UX-DR6, UX-DR11)

**Given** a save request fails
**When** the failure response returns
**Then** the editor stays open with the dirty value intact, a persistent linked inline error appears, a Retry control is focused, and a Failure toast supplements (not replaces) the inline error (FR-4, UX-DR6, UX-DR9, UX-DR10)

**Given** an edited and saved Note
**When** it next collapses
**Then** the collapsed title/preview reflect the saved wording, and the Note's position in the list is unchanged by the edit (FR-4)

**Given** an expanded Note with no edits
**When** the collaborator collapses it
**Then** it returns to the title + one-line-preview row with the expanded region removed entirely from the accessibility tree (FR-3, UX-DR5)

### Story 1.3: Delete a Note

As a trip collaborator,
I want to delete a Note I no longer need, with a confirmation step,
So that I can keep my list current without risking an accidental permanent loss.

**Acceptance Criteria:**

**Given** an expanded Note
**When** the collaborator activates the Trash action
**Then** the existing Packt/Base UI confirmation `Dialog` opens with initial focus on Cancel (FR-5, UX-DR8)

**Given** the open delete confirmation dialog
**When** the collaborator activates Cancel or `Esc`
**Then** the dialog closes, the Note remains in the list unchanged, and focus returns to the invoking Trash action (FR-5, UX-DR8, UX-DR10)

**Given** the open delete confirmation dialog
**When** the collaborator confirms delete
**Then** focus moves to the dialog's status container, Cancel/Delete are disabled, the dialog is marked busy, "Deleting note" is announced, and — on success — the Note is permanently removed with no undo, and focus moves to the next disclosure, else the previous one, else `New Note` (FR-5, UX-DR8, UX-DR10, UX-DR11)

**Given** a delete request fails
**When** the failure response returns
**Then** the dialog stays open with a persistent error, focus moves to a safe recovery control, the Note remains in the list, and a Failure toast supplements the dialog error (FR-5, UX-DR8, UX-DR9)

### Story 1.4: Reorder Notes manually

As a trip collaborator,
I want to drag a Note to a new position in the list,
So that I can arrange my Notes for faster scanning regardless of when they were created.

**Acceptance Criteria:**

**Given** a populated Notes tab
**When** the collaborator drags a Note's Reorder handle (matching the existing itinerary Event drag-handle treatment: `GripVertical`, `strokeWidth={1.5}`, 44×44px target) to a new position
**Then** the new order persists via a server action, DOM/visual order stay aligned, and the order survives a page reload (FR-6, UX-DR7)

**Given** a Reorder handle focused via keyboard
**When** the collaborator presses Space/Enter to lift, Up/Down to move, and Space/Enter to drop
**Then** one live region announces lift instructions, `position X of N` for each candidate position, invalid-boundary attempts, and the drop outcome, and Left/Right have no effect (FR-6, UX-DR7, UX-DR11)

**Given** a lifted Note being reordered via keyboard
**When** the collaborator presses `Escape` before dropping
**Then** the reorder is cancelled, the original order is restored with no mutation, and the cancellation is announced (FR-6, UX-DR7)

**Given** a reorder persistence request fails
**When** the failure response returns
**Then** the list restores the last persisted order, a Failure toast and the live region announce the rollback and restored `position X of N`, and focus returns to the same Reorder handle (FR-6, UX-DR7, UX-DR9)

**Given** Notes have been manually reordered
**When** a new Note is created (Story 1.1)
**Then** it still inserts at the top of the list per the newest-first default, until the collaborator moves it (FR-6)
