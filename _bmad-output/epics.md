---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-epic1-stories", "step-03-epic2-stories", "step-04-final-validation"]
inputDocuments:
  - _bmad-output/prd.md
  - _bmad-output/project-context.md
---

# Packt - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Packt, decomposing the requirements from the PRD into implementable stories.

## Requirements Inventory

### Functional Requirements

**Template Library Management**

FR1: User can create a new named packing template
FR2: User can rename an existing template
FR3: User can delete a template
FR4: User can view all their packing templates
FR5: User can add a plain-text item to a template
FR6: User can edit the text of an item in a template
FR7: User can remove an item from a template
FR8: User can add a section label to a template
FR9: User can rename a section label in a template
FR10: User can delete a section label from a template, leaving its items ungrouped
FR11: User can reorder items within a template

**Trip Packing List**

FR12: User can view a dedicated Packing tab within a trip
FR13: User sees an empty state with actionable prompts when no packing list exists for a trip
FR14: User can pull one or more templates onto a trip's packing list
FR15: System automatically deduplicates items when pulling templates, with a lightweight count notice
FR16: User can pull additional templates onto an already-populated packing list
FR17: User can add a plain-text item to a trip packing list
FR18: User can add a section label to a trip packing list
FR19: User can remove an item or section label from a trip packing list
FR20: User can save a trip's current packing list as a new named template

**List Structure**

FR21: Items and section labels coexist as siblings in a flat array with no nesting
FR22: Section labels are visually distinct and non-interactive as checkboxes
FR23: Items not under any section label appear at the bottom of the list, below all sections
FR24: A section label displays a strikethrough state when all items beneath it are checked
FR25: Items can be added contextually under a specific section or to the ungrouped bottom area

**List Interaction**

FR26: User can check an item as packed
FR27: User can uncheck a previously checked item
FR28: Check state persists across browser sessions and page reloads
FR29: User can drag an item to a new position in the list
FR30: User can reorder an item via keyboard controls without using drag
FR31: Item positions persist across browser sessions and page reloads
FR32: User can edit the text of an existing item inline
FR33: User can tap or click a section label to rename it inline
FR34: User can delete a section label via its inline edit controls

**Trip Overview Integration**

FR35: Trip card displays a packing progress count showing checked items vs total checkable items
FR36: Progress count updates when items are checked or unchecked
FR37: Progress count reflects only checkable items, not section labels

**Template Library Navigation**

FR38: User can navigate to the packing template library from the application sidebar on desktop — a dedicated app-level route accessible outside of any specific trip; mobile entry point TBD

### NonFunctional Requirements

**Performance**

NFR1: All user-initiated packing interactions (check/uncheck, add item, remove item, inline edit) complete within 300ms p95 as perceived by the user
NFR2: Template pull with deduplication for lists up to 200 items completes within 500ms
NFR3: Drag-to-reorder renders at 60fps during active drag with no visible frame drops
NFR4: Packing tab initial render (with list populated) completes within 2 seconds on a standard broadband connection

**Security**

NFR5: Packing data (templates and trip lists) is accessible only to the authenticated user who owns it
NFR6: All server actions validate user authentication and trip access before reading or writing any packing data — no action bypasses `requireUser()` + `assertTripAccess()`
NFR7: Template data is strictly user-scoped — no user can read, modify, or enumerate another user's templates

**Accessibility**

NFR8: All packing features meet WCAG 2.1 AA compliance
NFR9: Drag-to-reorder provides a keyboard-accessible alternative (move up/down) for users who cannot use mouse or touch drag
NFR10: All interactive elements have a visible focus indicator meeting WCAG 2.1 AA contrast requirements
NFR11: Check state changes are announced to screen readers via appropriate ARIA attributes
NFR12: All touch targets for interactive elements are at minimum 44×44px on mobile viewports

### Additional Requirements

_(No Architecture document provided. Implementation constraints extracted from PRD:)_

- Brownfield addition: Packing tab is already stubbed; three server actions exist (`addPackingItem`, `togglePackingItem`, `removePackingItem`) — use or extend rather than replace
- Drag-to-reorder uses `@dnd-kit/core` + `@dnd-kit/sortable` (already installed); reuse patterns from existing event drag implementation
- Server actions follow `requireUser()` + `assertTripAccess()` + `revalidatePath()` pattern — no exceptions
- All new types go into `src/data/types.ts` — no local type definitions
- All interactive packing components must have `"use client"` as first line
- No real-time sync in Phase 1 — all mutations via server actions with cache invalidation only
- Target: modern evergreen browsers only (Chrome, Safari, Firefox, Edge current + previous major release)
- Template data is strictly user-scoped at the DB query level; templates are not trip-scoped

### UX Design Requirements

_(No UX Design document provided — not applicable for this feature addition.)_

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 2 | Create named template |
| FR2 | Epic 2 | Rename template |
| FR3 | Epic 2 | Delete template |
| FR4 | Epic 2 | View all templates |
| FR5 | Epic 2 | Add item to template |
| FR6 | Epic 2 | Edit item in template |
| FR7 | Epic 2 | Remove item from template |
| FR8 | Epic 2 | Add section label to template |
| FR9 | Epic 2 | Rename section label in template |
| FR10 | Epic 2 | Delete section label from template |
| FR11 | Epic 2 | Reorder items within template |
| FR12 | Epic 1 | Packing tab within trip |
| FR13 | Epic 1 | Empty state with actionable prompts |
| FR14 | Epic 2 | Pull template(s) onto trip list |
| FR15 | Epic 2 | Automatic deduplication with count notice |
| FR16 | Epic 2 | Pull additional templates onto populated list |
| FR17 | Epic 1 | Add plain-text item to trip list |
| FR18 | Epic 1 | Add section label to trip list |
| FR19 | Epic 1 | Remove item or label from trip list |
| FR20 | Epic 2 | Save trip list as new named template |
| FR21 | Epic 1 | Flat siblings array (items + labels) |
| FR22 | Epic 1 | Section labels visually distinct, non-checkable |
| FR23 | Epic 1 | Ungrouped items at bottom |
| FR24 | Epic 1 | Label strikethrough when all items beneath checked |
| FR25 | Epic 1 | Contextual add under section or ungrouped area |
| FR26 | Epic 1 | Check item as packed |
| FR27 | Epic 1 | Uncheck item |
| FR28 | Epic 1 | Check state persists across sessions |
| FR29 | Epic 1 | Drag item to new position |
| FR30 | Epic 1 | Keyboard reorder (up/down without drag) |
| FR31 | Epic 1 | Position persists across sessions |
| FR32 | Epic 1 | Inline edit item text |
| FR33 | Epic 1 | Tap/click section label to rename inline |
| FR34 | Epic 1 | Delete section label via inline controls |
| FR35 | Epic 1 | Trip card packing progress count |
| FR36 | Epic 1 | Progress count updates on check/uncheck |
| FR37 | Epic 1 | Progress count excludes labels |
| FR38 | Epic 2 | App-level template library navigation (sidebar desktop; mobile TBD) |

## Epic List

### Epic 1: Trip Packing List
Users can create and manage a complete packing list within a trip — add items and section labels, check items off as packed, drag to reorder, with state persisting across sessions. Trip cards show live packing progress. Fully usable without any templates.

**FRs covered:** FR12, FR13, FR17, FR18, FR19, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR29, FR30, FR31, FR32, FR33, FR34, FR35, FR36, FR37

### Epic 2: Template Library & Pull
Users can build a personal template library of reusable item collections, pull one or more templates into any trip list with automatic deduplication, and save a trip list back as a template — so repeat trips start from an earned baseline rather than from scratch. Navigable from the app sidebar on desktop (mobile entry point TBD).

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR14, FR15, FR16, FR20, FR38

---

## Epic 1: Trip Packing List

Users can create and manage a complete packing list within a trip — add items and section labels, check items off as packed, drag to reorder, with state persisting across sessions. Trip cards show live packing progress. Fully usable without any templates.

### Story 1.1: Packing Tab Foundation — List Display & Item/Label Management

As a traveler,
I want to open the Packing tab on my trip and build a list of items and section labels,
So that I can capture everything I need to pack for this trip.

**Acceptance Criteria:**

**Given** a trip has no packing list items
**When** the user navigates to the Packing tab
**Then** they see an empty state with a prompt to start adding items

**Given** the user is on the Packing tab
**When** they submit a new plain-text item
**Then** the item appears in the list at the correct position
**And** the item persists after a page reload

**Given** the user adds a section label
**When** the label is created
**Then** it renders visually distinct from items and has no checkbox
**And** items added after the label appear beneath it in the flat array

**Given** the user removes an item or section label
**When** the deletion is confirmed
**Then** it is removed from the list and the removal persists after a page reload

**Given** the packing list has items both under section labels and without a section
**When** the list renders
**Then** ungrouped items appear below all labeled sections

**Given** any interactive element in the packing tab
**Then** all touch targets are at minimum 44×44px on mobile viewports
**And** all interactive elements have a visible focus indicator meeting WCAG 2.1 AA contrast

**Given** any server action is called
**Then** it enforces `requireUser()` + `assertTripAccess()` before reading or writing any packing data

*(Creates `packing_list_items` DB table: id, trip_id, text, is_label, position, checked. Extends/implements existing `addPackingItem` and `removePackingItem` server actions.)*

---

### Story 1.2: Check Items as Packed with Session Persistence & Trip Card Progress

As a traveler,
I want to check items off my packing list and see my progress on the trip card,
So that I can pack incrementally across sessions and know at a glance how much is done.

**Acceptance Criteria:**

**Given** the user is on the Packing tab with items
**When** they tap or click an item's checkbox
**Then** the item is visually marked as checked/packed

**Given** an item is checked
**When** the user clicks or taps its checkbox again
**Then** it returns to unchecked state

**Given** the user has checked some items
**When** they reload the page or close and reopen the browser
**Then** the same items remain checked exactly as left

**Given** a trip has a packing list with checkable items
**When** the user views the trips list
**Then** the trip card shows "X / Y packed" (X = checked items, Y = total checkable items)

**Given** the packing list contains both items and section labels
**Then** the trip card count reflects only checkable items — labels are excluded and have no checkbox

**Given** the user checks or unchecks an item
**Then** the state change is announced to screen readers via appropriate ARIA attributes (e.g., `aria-checked`)

---

### Story 1.3: Drag-to-Reorder Items with Position Persistence

As a traveler,
I want to drag items into my preferred order and have that order stick,
So that my packing list reflects the sequence I actually pack in.

**Acceptance Criteria:**

**Given** the user is on the packing tab with multiple items
**When** they drag an item to a new position
**Then** the item moves to that position in the list
**And** the new position persists after a page reload

**Given** the packing list contains section labels
**Then** section labels cannot be dragged — drag handles are absent or inert on labels (Phase 1: items only)

**Given** the user focuses an item
**When** they use keyboard controls (e.g., arrow keys or space+arrow) to move the item up or down
**Then** the item moves one position in the indicated direction
**And** the new position persists after a page reload

**Given** the user is actively dragging an item
**Then** the drag animation renders at 60fps with no visible frame drops

**Given** a user who cannot use drag
**When** they use keyboard reorder on any item
**Then** all reorder controls are fully keyboard-accessible with a visible focus indicator

---

### Story 1.4: Inline Editing, Label Strikethrough & Contextual Add

As a traveler,
I want to edit items and labels inline and add new items under a specific section,
So that I can refine my list without leaving the packing view.

**Acceptance Criteria:**

**Given** a section label has all items beneath it checked
**When** the list renders
**Then** the section label displays a strikethrough visual state (client-side derived, no server call)
**And** if any item beneath it is unchecked, the strikethrough is immediately removed

**Given** a section label has no items beneath it
**Then** it does not display a strikethrough state

**Given** the packing list has section labels
**When** the user uses an "add item under [section]" affordance
**Then** the new item is inserted directly beneath that section label

**Given** the user adds an item to the ungrouped area
**Then** the new item appears at the bottom of the list, below all sections

**Given** the user activates inline editing on an item
**When** they change the text and confirm
**Then** the item displays the updated text and the change persists after a page reload

**Given** the user taps or clicks a section label to rename it
**When** they enter a new name and confirm
**Then** the label displays the new name and the change persists after a page reload

**Given** a section label's inline edit controls are open
**When** the user activates the delete control
**Then** the label is removed from the list
**And** items that were beneath that label remain in the list as ungrouped items

---

## Epic 2: Template Library & Pull

Users can build a personal template library of reusable item collections, pull one or more templates into any trip list with automatic deduplication, and save a trip list back as a template — so repeat trips start from an earned baseline rather than from scratch. Navigable from the app sidebar on desktop (mobile entry point TBD).

### Story 2.1: Template Library — Create, Rename & Delete Templates

As a traveler,
I want a dedicated template library where I can create, rename, and delete named packing templates,
So that I have a personal collection of reusable item collections I can pull into future trips.

**Acceptance Criteria:**

**Given** the user is on the desktop app
**When** they look at the sidebar
**Then** they see a navigation link to the Packing Templates library

**Given** the user navigates to the template library
**When** the page loads
**Then** they see all their packing templates listed by name
**And** if no templates exist, an empty state prompts them to create their first template

**Given** the user creates a new template with a name
**Then** the template appears in the library list and persists after a page reload

**Given** a template exists
**When** the user renames it
**Then** the template displays the new name and the change persists after a page reload

**Given** a template exists
**When** the user deletes it
**Then** it is removed from the library and the deletion persists

**Given** any template action (create, rename, delete, view)
**Then** `requireUser()` is enforced and operations are restricted to templates owned by the authenticated user — no user can read or enumerate another user's templates

*(Creates `packing_templates` DB table: id, user_id, name, created_at. Adds app-level route for the library. Adds sidebar navigation entry on desktop.)*

---

### Story 2.2: Template Item & Label Management

As a traveler,
I want to add, edit, remove, and reorder items and section labels within a template,
So that each template accurately reflects the items I need for that trip type.

**Acceptance Criteria:**

**Given** the user is viewing a template
**When** they add a plain-text item
**Then** it appears in the template list at the correct position and persists after a page reload

**Given** a template item exists
**When** the user edits its text inline and confirms
**Then** it displays the updated text and the change persists

**Given** a template item exists
**When** the user removes it
**Then** it is gone from the template list and the removal persists

**Given** the user adds a section label to a template
**Then** it renders visually distinct from items (no checkbox)
**And** items added after it appear beneath it in the flat array

**Given** a section label exists in the template
**When** the user renames it
**Then** the new name is displayed and persists

**Given** a section label exists in the template
**When** the user deletes it
**Then** the label is removed and items that were beneath it remain in the template as ungrouped items

**Given** a template has multiple items
**When** the user drags an item to a new position
**Then** the item moves to that position and the new order persists after a page reload

**Given** any template item action
**Then** `requireUser()` is enforced and the action operates only on templates owned by the authenticated user

*(Creates `packing_template_items` DB table: id, template_id, text, is_label, position.)*

---

### Story 2.3: Pull Templates onto a Trip Packing List

As a traveler,
I want to pull one or more templates onto my trip's packing list with automatic deduplication,
So that I can populate a trip list from my accumulated packing expertise in seconds.

**Acceptance Criteria:**

**Given** a trip packing list is empty
**When** the user views the Packing tab
**Then** the empty state offers both an "add items manually" path and a "pull from a template" path

**Given** the user selects a template to pull onto an empty trip list
**Then** all items and labels from the template are copied into the trip list in their original order

**Given** the user pulls two or more templates
**Then** items from all selected templates are merged into a single flat list

**Given** two templates share one or more item texts (case-insensitive match)
**When** both are pulled onto the same trip list
**Then** duplicate items appear only once
**And** a lightweight notice shows "X duplicate(s) skipped"

**Given** a pull operation involving up to 200 total items across templates
**When** the pull completes
**Then** it completes within 500ms

**Given** a trip already has packing list items
**When** the user pulls an additional template
**Then** the template items are appended to the existing list
**And** deduplication applies against all existing items, not just within the new template

**Given** the user has no templates
**When** they attempt to pull a template
**Then** they see a message indicating no templates exist with a link to create one

**Given** the pull server action is called
**Then** `requireUser()` + `assertTripAccess()` are enforced before writing to the trip list

---

### Story 2.4: Save Trip List as Template

As a traveler,
I want to save my current trip packing list as a named template,
So that future trips of the same type start from this list rather than from scratch.

**Acceptance Criteria:**

**Given** the user has a trip packing list with at least one item
**When** they choose "Save as template" and provide a name
**Then** a new template appears in the template library containing all items and labels from the trip list in the same order

**Given** the user initiates save-as-template without providing a name
**Then** they see a validation error and the save is not performed

**Given** some items on the trip list are checked
**When** the list is saved as a template
**Then** the template items are all unchecked — templates are pristine starting points, not snapshots of packed state

**Given** the user saves the trip list as a template
**Then** the original trip packing list is unchanged

**Given** the save-as-template action is called
**Then** `requireUser()` + `assertTripAccess()` are enforced and the resulting template is owned by the authenticated user
