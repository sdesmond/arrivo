---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/brainstorming/brainstorming-session-2026-05-14-1200.md
  - backlog/backlog.md
  - _bmad-output/project-context.md
---

# Packt - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Packt, decomposing the requirements from the brainstorming session (serving as PRD + UX Design) and project-context (serving as Architecture) into implementable stories. Feature: **Non-event Itinerary Items** (checklists and notes).

## Requirements Inventory

### Functional Requirements

FR1: The system shall support three distinct itinerary item types — event, checklist, and note — each as a first-class primitive with its own data model and no shared schema between types.
FR2: All itinerary items (events, checklists, notes) shall share the same ordered position index within a day; time is optional/advisory, drag order is the authoritative position truth.
FR3: Events shall display with a `MapPin` icon (replacing the current event icon).
FR4: Checklists shall display with a `ListChecks` icon.
FR5: Notes shall display with a `FileText` icon.
FR6: Creating a checklist shall place cursor directly in the first item field (title is optional and can be added later; items are the required content).
FR7: A checklist without a title shall display a generic label composed of the `ListChecks` icon + item count (e.g., "Checklist · 4 items").
FR8: When a checklist is expanded, an "Add title..." dim placeholder shall appear above the item list; clicking it enters inline edit mode on the title field.
FR9: The last row of every checklist shall be a persistent "add new item" input, always visible with no separate button or mode required. Items are ordered by creation; no reordering within a checklist.
FR10: Checking a checklist item shall keep it visible in place with a strikethrough and dimmed style (not hidden or moved).
FR11: The collapsed checklist line item header shall display a progress counter in X/Y format (e.g., "6/8") alongside the title.
FR12: When all items in a checklist are checked, the checklist shall enter a "complete" state with a subtle animation that settles into a persistent completion badge visible on the line item.
FR13: The completion state shall be reversible — unchecking any item immediately removes the completion badge. Completion is a derived calculation, not a stored field.
FR14: A checklist shall be manually collapsible and expandable at any time. Collapsed state shows title + completion badge/progress counter only.
FR15: Deleting all items from a checklist and then clicking away shall cause the checklist to remove itself from the timeline automatically (empty checklist self-destructs).
FR16: A note shall render its full text content directly inline on the timeline with no bordered container, no collapse, and no title field.
FR17: A note shall support exactly two interactions: read it and edit it inline. No acknowledgment state, no completion, no lifecycle.
FR18: Long notes shall expand the timeline naturally; no truncation or "show more" control.
FR19: On desktop, a "+" button shall appear on hover in the gap between any two timeline items, enabling insertion of a new item at that specific position.
FR20: The existing "+" at the bottom of the day shall remain for adding items at the end.
FR21: Clicking any "+" (between items or at day bottom) shall reveal a mini inline type picker with three icons (`MapPin`, `ListChecks`, `FileText`). Selecting one inserts that type at the insertion point and immediately enters edit mode.
FR22: On desktop, the trash icon and drag handle shall reveal on hover for checklists and notes (consistent with existing event behavior).
FR23: On mobile, a small "+" shall be always visible in the left gutter between each timeline item, tapping it opens the type picker at that insertion point.
FR24: On mobile, the trash icon and drag handle shall always be visible for all item types (not hidden behind hover).
FR25: Inline editing shall apply to note content, checklist titles, and checklist items — using the same "looks like a label, tap to edit" pattern as existing day notes and event notes.
FR26: Deleting a checklist item shall use the same hover-to-reveal trash icon pattern as events, applied at the individual checklist item row level.

### NonFunctional Requirements

NFR1: All three item types must be visually distinguishable at a glance without requiring the user to read the icon label (notes as raw inline text blocks achieve this distinction by visual weight alone).
NFR2: Notes are scoped to in-trip reminders only — no pre-trip research or post-trip journal functionality in this feature.
NFR3: No hybrid item types — an item is exactly one of: event, checklist, or note. Clean type boundaries with no overlap.
NFR4: No item reordering within checklists — creation order is the only order.
NFR5: Packing list functionality (reusable, trip-level, template-able lists) is explicitly out of scope — it is a separate future feature.
NFR6: No type filtering view in this feature.
NFR7: All Lucide icons must use `strokeWidth={1.5}`; icon-only buttons must have a `title` attribute for accessibility.
NFR8: Colors must use CSS custom properties (`var(--fg)`, `var(--accent-brand)`, etc.) — no hardcoded hex or rgb values.
NFR9: No arbitrary Tailwind values (e.g., `text-[14px]`) — use inline styles for dynamic or theme-aware values.
NFR10: Unit test coverage for new code must meet ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`.

### Additional Requirements

- New itinerary item types (checklist, note) must be defined in `src/data/types.ts` as const objects + union types — never the `enum` keyword.
- Database schema for checklist and note types goes in `src/db/schema.ts` using `drizzle-orm/pg-core`; all new tables use `uuid().primaryKey().default(sql\`gen_random_uuid()\`)`.
- DB mapper functions for new types must be added to `src/lib/db-mappers.ts`; never map raw DB rows directly in queries or actions.
- Server actions for checklist/note CRUD must call `requireUser()` then `assertTripAccess()` before any read or write, and `revalidatePath(\`/trips/\${tripId}\`)` after any mutation.
- New components (`ChecklistItem`, `NoteItem`) go in `src/components/packt/`; the existing `EventChip` icon must be updated to `MapPin` (`strokeWidth={1.5}`).
- The `position: integer` ordering field must be maintained correctly when inserting new items at specific positions (not just at the end).
- E2E tests for new user-facing flows go in `tests/e2e/features/` (Gherkin `.feature` files) and `tests/e2e/steps/` (TypeScript step definitions).
- Unit tests must be colocated with source files (`foo.tsx` → `foo.test.tsx` in same directory).
- E2E database schema must be migrated (`npm run db:migrate:e2e`) after any schema changes.

### UX Design Requirements

UX-DR1: The type picker must display three icons (`MapPin`, `ListChecks`, `FileText`) in a small popover — single tap/click picks a type, inserts it at the insertion point, and immediately enters edit mode. No navigation, no dialog, no mode switch.
UX-DR2: Checked checklist items must remain visible in place with strikethrough + dimmed style — they serve as a visual confirmation record ("bought tickets ✓"), not clutter to remove.
UX-DR3: The checklist completion animation must be subtle and settle into a persistent completion badge on the line item; in-progress and complete checklists must be visually distinct at a glance.
UX-DR4: The collapsed checklist header must show the progress counter (X/Y) alongside the title — collapsed state must be informative, not decorative.
UX-DR5: Notes must render as a raw text block on the timeline with no visual chrome (no border, no header, no container) — they should read like margin annotations, not like event chips.
UX-DR6: Desktop interaction model: controls (trash, drag handle) are hidden until hover. Mobile interaction model: controls are always visible. These are the only two breakpoint rules — no middle states.
UX-DR7: The hover "+" between items (desktop) and the gutter "+" (mobile) must trigger identical behavior — behavioral parity, different trigger mechanism.
UX-DR8: The "Add title..." placeholder on an expanded checklist must be visually dim to communicate optionality; it sits above the item list, not inline with items.
UX-DR9: An untitled checklist in collapsed state must show a non-blank generic label: `ListChecks` icon + "Checklist · N items" — never an empty or ambiguous chip.
UX-DR10: When all items in a checklist are deleted and focus moves away, the checklist must remove itself from the timeline automatically — no empty line item lingers.

### FR Coverage Map

| FR | Epic | Summary |
|----|------|---------|
| FR1 | 1 | Three distinct types, no shared schema |
| FR2 | 1 | Shared position index, drag order is truth |
| FR3 | 1 | Event icon → MapPin |
| FR4 | 1 | ListChecks icon registered in type system + picker |
| FR5 | 1 | FileText icon registered, used for notes |
| FR6 | 2 | Checklist creation with cursor in first item |
| FR7 | 2 | Untitled checklist shows generic label |
| FR8 | 2 | "Add title..." placeholder above items |
| FR9 | 2 | Persistent add-item row, creation order only |
| FR10 | 2 | Strikethrough + dimmed on checked items |
| FR11 | 2 | X/Y progress counter on collapsed header |
| FR12 | 2 | All-checked → animation → completion badge |
| FR13 | 2 | Completion is reversible / derived |
| FR14 | 2 | Manual collapse/expand at any time |
| FR15 | 2 | Empty checklist self-destructs on blur |
| FR16 | 1 | Note = inline text block, no chrome |
| FR17 | 1 | Note has two interactions only: read + edit |
| FR18 | 1 | Long notes grow timeline, no truncation |
| FR19 | 1 | Desktop hover "+" between items → type picker |
| FR20 | 1 | Day-bottom "+" → type picker (extends existing) |
| FR21 | 1 | Type picker: select → insert + immediate edit mode |
| FR22 | 1 | Hover-delete + drag handle on timeline items |
| FR23 | 1 | Mobile: gutter "+" always visible between items |
| FR24 | 1 | Mobile: trash + drag handle always visible |
| FR25 | 1/2 | Inline edit (notes in Epic 1; checklist title + items in Epic 2) |
| FR26 | 2 | Hover-delete on individual checklist item rows |

## Epic List

### Epic 1: Multi-type Itinerary Timeline — Foundation, Notes, and Creation Flow

Users can see three visually distinct item types on the day timeline (via the updated event icon), add free-form inline notes at any position in their day, and insert any item type at a specific position using the inline type picker — on both desktop and mobile.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24, FR25

### Epic 2: Checklists

Users can add interactive checklists at any point in their day's timeline, manage items inline, check them off with a visible strikethrough record, track progress at a glance when collapsed, and experience the full checklist lifecycle — from creation through completion animation through self-destruct when emptied.

**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR25 (checklist title + items), FR26

---

## Epic 1: Multi-type Itinerary Timeline — Foundation, Notes, and Creation Flow

Users can see three visually distinct item types on the day timeline (via the updated event icon), add free-form inline notes at any position in their day, and insert any item type at a specific position using the inline type picker — on both desktop and mobile.

### Story 1.1: Notes Data Model and Type Infrastructure

As a traveler,
I want my itinerary to recognize notes as a first-class item type,
So that notes can be stored, retrieved, and positioned on the day timeline alongside events.

**Acceptance Criteria:**

**Given** the type system in `src/data/types.ts`
**When** a developer imports the itinerary item types
**Then** an `ItineraryItemType` const object exposes `{ Event: "event", Checklist: "checklist", Note: "note" }` and the union type covers all three values

**Given** the database schema in `src/db/schema.ts`
**When** an `itinerary_notes` table is defined
**Then** it contains: `id` (uuid pk, `gen_random_uuid`), `trip_day_id` (uuid FK → trip_days), `position` (integer), `content` (text), `created_at`, `updated_at`

**Given** a raw DB note row
**When** `dbNoteToType()` is called in `src/lib/db-mappers.ts`
**Then** it returns a typed `Note` object with all fields correctly mapped

**Given** the updated schema
**When** `npm run db:migrate:e2e` is run
**Then** the `itinerary_notes` table exists in the E2E database without errors

**Given** the mapper unit test
**When** tests run
**Then** `dbNoteToType()` correctly maps all fields including type coercions

---

### Story 1.2: Event Icon Updated to MapPin

As a traveler,
I want events to display with a map pin icon,
So that the event type is visually distinct and semantically clear.

**Acceptance Criteria:**

**Given** an event chip rendered on the day timeline
**When** it is displayed
**Then** it uses the `MapPin` lucide icon with `strokeWidth={1.5}` in place of the previous icon

**Given** the EventChip unit test
**When** the component renders
**Then** the test finds `MapPin` in the rendered output (not the old icon)

---

### Story 1.3: Inline Type Picker and Between-Item Insertion (Desktop)

As a traveler,
I want to insert a new item at any specific point in my day's timeline,
So that I can place notes and events exactly where they belong in the flow of my day.

**Acceptance Criteria:**

**Given** a day timeline with at least one item on desktop
**When** the user hovers between two items
**Then** a "+" button appears in the gap between them

**Given** the "+" at the bottom of the day
**When** the user interacts with it
**Then** it shows the same type picker as the between-item "+"

**Given** a visible "+" button
**When** the user clicks it
**Then** a small popover appears with `MapPin` and `FileText` icons (each `strokeWidth={1.5}`)

**Given** the type picker popover
**When** the user selects `FileText` (note)
**Then** a new note is created at that position and inline edit mode opens on the note content immediately

**Given** the type picker popover
**When** the user selects `MapPin` (event)
**Then** a new event is created at that position and event edit mode opens immediately

**Given** a new item created between two existing items
**When** it is created
**Then** its `position` value correctly places it between the surrounding items with no position conflicts

**Given** the type picker popover
**When** the user clicks outside or presses Escape
**Then** the popover closes without creating any item

**Given** the TypePicker component unit test
**When** it renders with a given set of types
**Then** it renders the correct Lucide icons with `strokeWidth={1.5}`

---

### Story 1.4: Inline Note Item on the Day Timeline

As a traveler,
I want to add free-form notes between events in my day's itinerary,
So that I can capture reminders and context exactly where they're relevant in my day.

**Acceptance Criteria:**

**Given** a note on the day timeline
**When** it renders
**Then** it appears as a raw inline text block — `FileText` icon + note text, no border, no header row, no container

**Given** a note with long content
**When** it renders
**Then** the timeline expands naturally to show all text with no truncation and no "show more" control

**Given** a note on the timeline
**When** the user clicks the text content
**Then** it becomes an inline editable field (same pattern as existing day note inline edit)

**Given** an inline-edited note
**When** the user clicks away or presses Enter
**Then** the updated content is saved via the `updateNote` server action and the note re-renders with the new text

**Given** a note on the timeline on desktop
**When** the user hovers over it
**Then** a trash icon appears (same hover-reveal pattern as events)

**Given** the visible trash icon
**When** the user clicks it
**Then** the note is deleted via the `deleteNote` server action and removed from the timeline

**Given** `createNote`, `updateNote`, and `deleteNote` server actions
**When** any of them execute
**Then** they call `requireUser()` and `assertTripAccess()` before any DB operation, and `revalidatePath(\`/trips/\${tripId}\`)` after mutation

**Given** the NoteItem unit tests
**When** tests run
**Then** component renders `FileText` with `strokeWidth={1.5}`, renders content as text, inline edit activates on click, delete triggers the delete action

**Given** an E2E test for the note flow
**When** the test runs
**Then** user can create a note via the type picker, see it on the timeline, edit it inline, and delete it — all without page navigation

---

### Story 1.5: Mobile Timeline Adaptations

As a traveler on mobile,
I want insertion and delete/reorder controls to always be visible,
So that I can manage my itinerary without hover interactions that don't exist on touch devices.

**Acceptance Criteria:**

**Given** a day timeline on a mobile viewport (below the `sm` breakpoint)
**When** the timeline renders
**Then** a small "+" is always visible in the left gutter between each pair of timeline items

**Given** a gutter "+" on mobile
**When** the user taps it
**Then** the same type picker popover appears — same icons, same behavior as the desktop hover "+"

**Given** any timeline item on mobile
**When** the timeline renders
**Then** the trash icon and drag handle are always visible (not hidden behind hover)

**Given** a desktop viewport
**When** the timeline renders
**Then** gutter "+" buttons are not rendered (desktop uses hover "+" only)

**Given** unit tests for the timeline item components
**When** tests check responsive rendering
**Then** controls render always-visible at mobile width and hover-only at desktop width

---

## Epic 2: Checklists

Users can add interactive checklists at any point in their day's timeline, manage items inline, check them off with a visible strikethrough record, track progress at a glance when collapsed, and experience the full checklist lifecycle — from creation through completion animation through self-destruct when emptied.

### Story 2.1: Checklist Database Schema and Type Infrastructure

As a traveler,
I want my itinerary to support checklists as a first-class item type,
So that checklist data can be stored, retrieved, and positioned on the timeline.

**Acceptance Criteria:**

**Given** the type system in `src/data/types.ts`
**When** a developer imports checklist types
**Then** a `Checklist` type exists with fields: `id`, `tripDayId`, `position`, `title` (optional string), `items` (array of `ChecklistItem`); and `ChecklistItem` has `id`, `checklistId`, `content`, `isChecked`, `createdAt`

**Given** the database schema in `src/db/schema.ts`
**When** `itinerary_checklists` is defined
**Then** it contains: `id` (uuid pk), `trip_day_id` (uuid FK → trip_days), `position` (integer), `title` (text nullable), `created_at`, `updated_at`

**Given** the database schema
**When** `checklist_items` is defined
**Then** it contains: `id` (uuid pk), `checklist_id` (uuid FK → itinerary_checklists), `content` (text), `is_checked` (boolean, default false), `created_at`; items are ordered by `created_at` (creation order, no position field)

**Given** raw DB rows for a checklist and its items
**When** `dbChecklistToType()` is called in `src/lib/db-mappers.ts`
**Then** it returns a typed `Checklist` with correctly mapped fields and nested `ChecklistItem[]`

**Given** the updated schema
**When** `npm run db:migrate:e2e` is run
**Then** both tables exist in the E2E database without errors

**Given** the mapper unit test
**When** tests run
**Then** `dbChecklistToType()` correctly maps all fields, boolean coercions, and nested items

---

### Story 2.2: Checklist Creation and Title Management

As a traveler,
I want to create a checklist with an optional title from the type picker,
So that I can start capturing items immediately without being forced to name it first.

**Acceptance Criteria:**

**Given** the type picker popover (from Story 1.3)
**When** it renders
**Then** it now includes the `ListChecks` icon (`strokeWidth={1.5}`) as a third option alongside `MapPin` and `FileText`

**Given** the user selects `ListChecks` in the type picker
**When** the new checklist is created
**Then** focus drops directly into the first item input field — not a title field

**Given** an expanded checklist with no title set
**When** it renders
**Then** a dim "Add title..." placeholder appears above the item list; clicking it enters inline edit mode on the title field

**Given** an expanded checklist with a title set
**When** it renders
**Then** the title appears above the items and can be edited inline by clicking it

**Given** a checklist with no title in collapsed state
**When** it renders
**Then** it shows: `ListChecks` icon + "Checklist · N items" (where N is the current item count) — never a blank or empty chip

**Given** a checklist with a title in collapsed state
**When** it renders
**Then** it shows: `ListChecks` icon + the title text

**Given** the `createChecklist` server action
**When** it executes
**Then** it calls `requireUser()`, `assertTripAccess()`, creates the checklist at the correct position, and calls `revalidatePath(\`/trips/\${tripId}\`)`

**Given** the ChecklistItem unit tests
**When** the component renders with no title
**Then** it shows the "Add title..." placeholder; when rendered with a title, it shows the title

---

### Story 2.3: Checklist Item Management

As a traveler,
I want to add, edit, and remove items in a checklist,
So that I can build and maintain the list of things I need to do or remember.

**Acceptance Criteria:**

**Given** an expanded checklist
**When** it renders
**Then** the last row is always a persistent "add item" input (placeholder text visible, no button required to activate it)

**Given** the persistent add-item row
**When** the user types text and presses Enter or clicks away
**Then** a new checklist item is created via `createChecklistItem` and appended in creation order

**Given** an existing checklist item
**When** the user clicks its text
**Then** the item text becomes an inline editable field

**Given** an inline-edited checklist item
**When** the user clicks away or presses Enter
**Then** the updated content is saved via `updateChecklistItem` and the item re-renders with the new text

**Given** a checklist item on desktop
**When** the user hovers over it
**Then** a trash icon appears at the row level (same hover-reveal pattern as timeline-level items)

**Given** the row-level trash icon
**When** the user clicks it
**Then** the item is deleted via `deleteChecklistItem` and removed from the list

**Given** `createChecklistItem`, `updateChecklistItem`, and `deleteChecklistItem` server actions
**When** any of them execute
**Then** they call `requireUser()` and `assertTripAccess()` before any DB operation, and `revalidatePath(\`/trips/\${tripId}\`)` after mutation

**Given** checklist item unit tests
**When** tests run
**Then** inline edit activates on click; delete triggers the delete action; persistent add-row is always rendered last

---

### Story 2.4: Checklist Check State, Progress, and Completion

As a traveler,
I want to check off items and see my overall progress at a glance,
So that I can track what's done during my trip without losing the record of completed items.

**Acceptance Criteria:**

**Given** a checklist item
**When** the user clicks its checkbox
**Then** the item is marked checked via `toggleChecklistItem` and immediately renders with strikethrough text and a dimmed style — it stays in place in the list

**Given** a checked item
**When** the user clicks its checkbox again
**Then** the item is unchecked and the strikethrough/dimmed style is removed

**Given** a checklist with some items checked
**When** the checklist header is in collapsed state
**Then** a progress counter in "X/Y" format (e.g., "3/5") is visible alongside the title or generic label

**Given** all items in a checklist are checked
**When** the last item is checked
**Then** a subtle completion animation plays on the checklist, which settles into a persistent "completed" badge visible on the line item

**Given** a checklist showing the "completed" badge
**When** the user unchecks any item
**Then** the "completed" badge is removed immediately — completion is derived from item states, not a stored field

**Given** `toggleChecklistItem` server action
**When** it executes
**Then** it calls `requireUser()`, `assertTripAccess()`, toggles `is_checked` on the item, and calls `revalidatePath(\`/trips/\${tripId}\`)`

**Given** the ChecklistItem unit tests
**When** tests run
**Then** checked items render with strikethrough + dimmed style; unchecked items render normally; progress counter shows correct X/Y; completion badge appears only when all items are checked

---

### Story 2.5: Checklist Collapse and Empty Self-Destruct

As a traveler,
I want to collapse checklists I'm done with and have empty ones disappear automatically,
So that my timeline stays clean and navigable as I work through my day.

**Acceptance Criteria:**

**Given** an expanded checklist
**When** the user clicks the collapse control (chevron or title area)
**Then** the checklist collapses to show only the header row (title or generic label + badge/progress counter)

**Given** a collapsed checklist
**When** the user clicks the header
**Then** the checklist expands to show all items and the persistent add-item row

**Given** a completed checklist (all items checked)
**When** the completion animation finishes
**Then** the checklist auto-collapses as part of the completion ceremony

**Given** a checklist where the user deletes all items
**When** the user clicks away (focus leaves the checklist)
**Then** the checklist removes itself from the timeline automatically via `deleteChecklist` — no empty line item remains

**Given** `deleteChecklist` server action
**When** it executes
**Then** it calls `requireUser()`, `assertTripAccess()`, deletes the checklist and all its items, and calls `revalidatePath(\`/trips/\${tripId}\`)`

**Given** the Checklist unit tests for collapse
**When** tests run
**Then** collapsed state renders only the header; expanded state renders items + add-row; empty + blur triggers deletion

**Given** an E2E test for the checklist flow
**When** the test runs
**Then** user can create a checklist, add items, check them off, see the completion badge, collapse it, and delete it — all without page navigation
