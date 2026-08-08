---
title: Trip Notes
status: final
created: 2026-08-07
updated: 2026-08-07
---

# PRD: Trip Notes

## 0. Document Purpose

This PRD scopes a new trip-level Notes feature for Packt. It builds directly on `_bmad-output/brainstorming/brainstorm-trip-level-notes-2026-08-07/brainstorm-intent.md`, which already resolved the feature's shape (discrete entries, Keep-inspired collapse/preview, no task state); this document turns that resolved design into functional requirements, journeys, and scope boundaries for downstream architecture and story creation. Glossary terms are used verbatim throughout; features are grouped with FRs nested under them; `[ASSUMPTION]` tags mark anything inferred without explicit confirmation.

## 1. Vision

Trip planning generates a steady stream of small admin thoughts — a passport expiry to check, a reminder to ask a travel companion about dietary needs, a note to borrow a suitcase — that aren't tied to a specific day and aren't substantial enough to be a Document. Today these thoughts have nowhere to live in Packt: they get lost, or they get jammed into a Day Note where they don't belong.

Trip Notes gives every trip a dedicated place for these discrete, titled thoughts — separate from Day Notes, separate from Documents, and deliberately never a task tracker. A user can capture a thought the moment it occurs, scan back through past notes to see what's already been captured, and revisit trip-general notes during the trip itself. It succeeds by staying out of the way: fast to add to, fast to scan, and firmly bounded so it never grows into a second Packing List or a second Documents section.

## 2. Glossary

- **Trip Notes** — The trip-level section holding all Notes for a given trip. Distinct from Day Notes. One Trip Notes section per trip.
- **Note** — A single discrete entry within Trip Notes: an optional title, a body, and an always-visible first-line preview. A Note never has checkbox or task state.
- **Day Notes** — The existing, separate per-day notes feature, scoped to a specific day within a trip's Itinerary. Trip Notes must not duplicate or replace Day Notes.
- **Documents** — The existing feature for files and confirmation numbers. Trip Notes must not become a place for files or links; that content belongs in Documents.
- **Packing List** — The existing checklist feature. Owns checkbox/task-completion state, along with Itinerary — see §5.
- **Itinerary** — The existing day-by-day trip schedule, made up of Days containing Events. Owns checkbox/task-completion state, along with Packing List — see §5.

## 3. Target User

### 3.1 Jobs To Be Done

- Capture a fleeting planning thought immediately, before it's forgotten, without breaking flow to decide "where does this go."
- Recall whether something has already been noted, by scanning rather than searching.
- Keep a trip-general reminder accessible while traveling, without it being buried inside a specific day's plan.
- Update or remove a Note as plans change, with the same lightweight interaction the rest of the app uses for Packing List and Documents.

### 3.2 Key User Journeys

- **UJ-1. Harrison captures a thought before it slips.**
  - **Persona + context:** Harrison is mid-planning and has something to remember — sometimes a bigger idea he wants to revisit later, sometimes a small logistics to-do (buy an adapter, borrow a suitcase). Trip Notes treats both identically; there's no Note "type" to choose.
  - **Entry state:** Authenticated, on the trip detail view.
  - **Path:** Opens Trip Notes → taps "New Note" (empty state, or the equivalent add action once Notes exist) → writes the thought → saves.
  - **Climax:** The Note appears in the list immediately, titled or previewed by its first line.
  - **Resolution:** Harrison moves on with planning, confident the thought is captured and findable later — with no checkbox to complete, this is explicitly a memory aid, not a task.

- **UJ-2. Harrison scans his Notes to check whether he's already written something down.**
  - **Persona + context:** Harrison isn't sure if he already noted a particular thought, or has forgotten exactly what he needed to remember.
  - **Entry state:** Authenticated, on the trip detail view, one or more Notes already exist.
  - **Path:** Opens Trip Notes → scans the vertical list, each row showing title (or implicit first-line title) plus a one-line preview → taps a row to expand it in place if the preview isn't enough to confirm.
  - **Climax:** Harrison either finds the existing Note (no duplicate created) or confirms it doesn't exist yet (writes a new one).
  - **Resolution:** No dedicated search — this is scan-and-confirm against a list, not full-text search. `[NON-GOAL for MVP]` See §6.2.

- **UJ-3. Harrison edits and deletes Notes as plans change.**
  - **Persona + context:** A Note is now stale (already resolved) or needs updated wording.
  - **Entry state:** Authenticated, on the trip detail view, viewing an expanded Note.
  - **Path:** Expands the Note → edits its content in place, or triggers delete.
  - **Climax:** Edits save without leaving the expanded view; delete asks for a lightweight confirmation (matching existing Packing List / Documents removal patterns) before removing the row.
  - **Resolution:** The list reflects the change immediately; no orphaned or stale entries linger.

- **UJ-4. Harrison references a trip-general Note during the trip itself.**
  - **Persona + context:** Mid-trip, Harrison wants a reminder that applies to the whole trip, not a specific day (e.g., "ask about the dietary thing" isn't tied to one day's events).
  - **Entry state:** Authenticated, on the trip detail view, during the trip's active date range.
  - **Path:** Opens Trip Notes (same surface as during planning) → scans or expands the relevant Note.
  - **Climax:** Harrison gets the reminder without hunting through a specific day's plan.
  - **Resolution:** Trip Notes behaves identically before and during the trip — no mode switch, no day-scoping.

## 4. Features

### 4.1 Trip Notes

**Description:** A vertical list of discrete Notes at the trip level, separate from Day Notes, Documents, and the Packing List. Each Note collapses to a title (or, when no title is given, its first line standing in as the implicit title) plus an always-visible one-line body preview — never title-only-collapsed. Tapping a row expands it in place (accordion behavior, not a dialog) to reveal the full body and edit/delete controls. An empty state with a "New Note" button matches the existing Packing List / Documents empty-state pattern. Notes sort newest-first by default and support manual reordering, consistent with Packing List items and Itinerary days. Realizes UJ-1 through UJ-4.

**Functional Requirements:**

#### FR-1: Create a Note

A trip collaborator with access to the trip can create a new Note from the Trip Notes section, with an optional title and a body. Realizes UJ-1.

**Consequences (testable):**

- Saving a Note with no title uses its first line as the displayed title/preview — the row is never title-only.
- A Note with a title but no body shows that title as both title and preview (no separate "no body" state).
- Saves automatically on blur or on collapse — there is no explicit Save button.
- A Note with no title and no body (fully blank) is not saved: it is discarded rather than added to the list.
- A newly created Note appears at the top of the list (newest-first default order) immediately after saving.
- Creating a Note is available both from the empty state's "New Note" button and from a persistent add action once Notes exist. `[ASSUMPTION: exact placement/form of the persistent add action — e.g. floating button vs. header button — is left to UX/implementation.]`
- No cap on the number of Notes per trip, and no cap on a Note's title or body length.

#### FR-2: View the Trip Notes list

Each Note in the list renders collapsed, showing its title (or implicit first-line title) and a one-line body preview. Realizes UJ-2, UJ-4.

**Consequences (testable):**

- Every row shows a non-empty preview line — a Note with only a title and no further body still shows that title as both title and preview (per FR-1).
- The list is available and behaves identically whether the current date is before, during, or after the trip's date range.

**Out of Scope:**

- Full-text or keyword search across Notes — see §6.2.

#### FR-3: Expand a Note in place

Tapping/activating a collapsed Note row expands it in place to show the full body, without navigating away or opening a dialog. Realizes UJ-2, UJ-3.

**Consequences (testable):**

- Only one Note is expanded at a time — expanding a collapsed Note automatically collapses whichever Note was previously expanded.
- If the previously expanded Note had unsaved edits, it autosaves before collapsing — auto-collapse never silently discards an in-progress edit.
- Collapsing a previously expanded Note returns it to the title + one-line-preview row.

#### FR-4: Edit a Note

From its expanded state, a trip collaborator with access to the trip can edit a Note's title and/or body. Realizes UJ-3.

**Consequences (testable):**

- Edits save automatically on blur or on collapse (same trigger as FR-1) — there is no explicit Save button.
- Saved edits update the collapsed preview as soon as the Note next collapses.
- Editing does not change the Note's position in manual sort order (only explicit reordering does — see FR-6).

#### FR-5: Delete a Note

From its expanded state, a trip collaborator with access to the trip can delete a Note, gated by a lightweight confirmation consistent with existing removal patterns (e.g., Packing List item removal, Document removal). Realizes UJ-3.

**Consequences (testable):**

- Delete requires one explicit confirmation step — not a silent/instant delete, not a heavy blocking modal.
- Deleted Notes are removed from the list with no soft-delete/undo requirement in this scope.

#### FR-6: Reorder Notes manually

A trip collaborator with access to the trip can manually reorder Notes, overriding the newest-first default. Realizes UJ-2 (faster scanning once a user has organized their own list).

**Consequences (testable):**

- Manual order persists across sessions and page reloads.
- Reorder interaction (e.g. drag handle vs. up/down controls) is left to UX/implementation, consistent with whatever mechanism the existing Packing List / Itinerary reordering already uses. `[ASSUMPTION: exact reorder control is deferred to that existing pattern rather than specified here.]`
- New Notes created after a manual reorder still insert at the top (newest-first), per FR-1, until the user moves them.

#### FR-7: Empty state

When a trip has zero Notes, Trip Notes shows an icon/title/description empty state with a "New Note" action, matching the Packing List and Documents empty-state pattern. Realizes UJ-1.

**Consequences (testable):**

- No always-visible capture input bar is shown in the empty state (explicitly not the Keep-style pattern).

## 5. Non-Goals (Explicit)

- Trip Notes will never gain checkbox or task-completion state in any form. That state is owned exclusively by the Packing List and Itinerary.
- Trip Notes is not a replacement for Day Notes — day-specific reminders stay in Day Notes.
- Trip Notes is not a place for files, links, or confirmation numbers — that content belongs in Documents.
- Trip Notes does not introduce a new capture-bar UI pattern (no Keep-style always-visible input); entry points match the app's existing empty-state + button pattern.
- Trip Notes does not introduce a new per-collaborator permission model — see §6.2.

## 6. MVP Scope

### 6.1 In Scope

- Create, view, edit, delete Notes at the trip level (FR-1, FR-3, FR-4, FR-5).
- Collapsed list view with title/implicit-title + one-line preview (FR-2).
- In-place accordion expand/collapse (FR-3).
- Manual reordering, newest-first default (FR-6).
- Empty state matching existing app pattern (FR-7).
- Identical availability of Trip Notes before, during, and after the trip (UJ-4).

### 6.2 Out of Scope for MVP

- **Full-text/keyword search across Notes** — scanning the collapsed list is the MVP answer.
- **Granular per-collaborator permissions on Notes** — the app does not yet have a live collaboration/sharing feature with differentiated roles; Trip Notes simply inherits whatever access a trip already grants.
- **Attachments, links, or files within a Note** — stays in Documents (see §5).
- **Any form of task/checkbox state** — permanently out of scope, not just deferred (see §5).

## 7. Success Metrics

No success metric is being tracked for this feature at launch — confirmed explicitly during discovery. `[NOTE FOR PM]` If this changes post-launch, revisit with usage-based candidates (e.g., % of trips with at least one Note) rather than retrofitting metrics later.

## 8. Open Questions & Assumptions Index

None open — all scope decisions in this PRD were confirmed during discovery, except two implementation-level details deliberately left to UX/implementation rather than decided here:

- FR-1 — exact placement/form of the persistent "add a Note" action (once Notes exist) is left to UX/implementation.
- FR-6 — exact reorder control (drag handle, up/down controls, etc.) is left to UX/implementation, deferred to whatever pattern Packing List / Itinerary reordering already uses.

`[NON-GOAL for MVP]` and `[NOTE FOR PM]` callouts elsewhere mark deferred items, not assumptions.
