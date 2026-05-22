---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - '_bmad-output/brainstorming/brainstorming-session-2026-05-18-0900.md'
  - '.claude/plans/radiant-imagining-dragonfly.md'
---

# Packt - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Packt, decomposing the requirements from the Documents tab brainstorming session and implementation plan into implementable stories. Feature scope: trip-level Documents tab with real file upload (Vercel Blob), in-app viewer, and event integration.

## Requirements Inventory

### Functional Requirements

FR1: Users can upload PDF and image files from their device to a trip's Documents tab
FR2: The system stores uploaded documents in Vercel Blob and saves metadata (name, kind, size, url) to the database
FR3: The Documents tab displays a flat list of all trip-level documents sorted by upload date (most recent first)
FR4: Users can search documents by name (case-insensitive, client-side filtering)
FR5: Users can inline-edit a document's display name directly from the document row
FR6: Users can open any document in a full-screen (mobile) / modal (desktop) in-app viewer
FR7: The viewer renders images natively with alt text and PDFs via iframe (with "Open PDF" fallback on mobile Safari)
FR8: The screen does not lock or dim while the document viewer is open (Screen Wake Lock API)
FR9: Users can share a document via the native OS share sheet; falls back to clipboard copy if Web Share unavailable
FR10: Each document row shows an offline availability indicator (cached / not cached) with accessible label
FR11: Users can trigger offline saving of all trip documents via a "Save All Offline" button
FR12: When attaching a document to an event, users can pick from existing trip-level documents instead of uploading a new file
FR13: Selecting an existing trip-level document to attach to an event moves it from trip-level to event-linked (hard promote — no dual membership)
FR14: When deleting an event that has attached documents, the user is prompted to keep the documents as trip-level or delete them with the event
FR15: Document kind is inferred automatically from the uploaded file's MIME type (pdf → "pdf", image/* → "image", else "doc")
FR16: Document name defaults to the uploaded filename; user can rename at any time
FR17: The Documents tab shows a first-time empty state nudge when no documents have been added yet
FR18: Users can delete a document from the Documents tab

### NonFunctional Requirements

NFR1: All new interactive components must declare `"use client"` at the top of the file and define an explicit `ComponentNameProps` interface
NFR2: All colors must use CSS custom properties (e.g., `var(--accent-brand)`, `var(--fg)`) — no hardcoded hex/rgb values
NFR3: Icon-only buttons must have both `title` and `aria-label` attributes that include the document name for per-row screen reader context
NFR4: The offline status indicator must not rely on color alone — must include an `aria-label` with text state ("Cached offline" / "Not cached offline")
NFR5: Search input and hidden file input must each have an associated accessible `<label>` element
NFR6: Images rendered in the viewer must have descriptive `alt` text using the document name
NFR7: All modal dialogs must manage focus: trap focus on open, return focus to trigger element on close, Escape to dismiss
NFR8: All interactive touch targets must be minimum 44×44px on mobile (achievable via padding)
NFR9: Unit test coverage must remain ≥95% lines/functions, ≥90% branches across `src/components/packt/**`
NFR10: All new user-facing flows must have E2E test coverage via Playwright BDD (Gherkin feature files in `tests/e2e/features/`, steps in `tests/e2e/steps/`)
NFR11: Vercel Blob uploads must be stubbed in E2E tests via `UPLOAD_STUB=true` env var to avoid hitting real storage

### Additional Requirements

- Install `@vercel/blob` package and configure `BLOB_READ_WRITE_TOKEN` environment variable in `.env` and `.env.example`
- Fix pre-existing mapper bug: `dbDocToType` in `src/lib/db-mappers.ts` must check `eventId` before `tripId` to correctly derive `scope` (currently all docs return `"trip"` because `tripId` is always set)
- No database schema changes required — existing `documents` table (`id`, `tripId`, `eventId?`, `name`, `kind`, `size`, `offline`, `url`, `addedAt`) is sufficient
- `shareDoc(doc)` utility must be extracted to `src/lib/utils.ts` and shared by both `DocRow` and `DocViewer` (no duplication)
- The existing `deleteEvent` action must NOT be modified — doc-count check stays client-side in `place-row.tsx`
- `place-row.tsx` must be split before new additions are made (currently 425 lines — exceeds project component size limit)
- Defunct `onAdd` callback chain must be removed throughout: `AddDocDialog` → `place-row` → `TripItineraryView` → `page-client.tsx`
- E2E seed data must include at least one trip-level document for the E2E user's trip
- `playwright.config.ts` webServer env must include `UPLOAD_STUB=true`

### UX Design Requirements

UX-DR1: Documents tab header row contains a heading ("Documents") and an "Add" button with visible text label; if an icon is used, the button must also carry a `title` attribute
UX-DR2: Document rows are minimum 44px tall; the name is inline-editable on click (shows `<input>` with underline border `var(--accent-brand)`); save on blur/Enter, cancel on Escape
UX-DR3: The in-app viewer opens full-screen on mobile and as a reasonably sized centered modal on desktop — not edge-to-edge on desktop
UX-DR4: The viewer header shows the document name, a share button, and a close button
UX-DR5: The first-time empty state uses friendly copy: "Add your first trip document — boarding passes, insurance, visas, and more." Shown once; dismissed after first upload
UX-DR6: When attaching a doc to an event and trip-level docs exist, the AddDocDialog shows a pick list first with a "Upload new instead" toggle
UX-DR7: The DeleteEventDialog presents three choices: "Keep documents" (primary, focused on open), "Delete everything" (destructive), "Cancel"

### FR Coverage Map

| Requirement | Epic |
|-------------|------|
| FR1: Upload PDF/image files | Epic 1 |
| FR2: Store in Vercel Blob + save metadata | Epic 1 |
| FR3: Flat list sorted by upload date | Epic 1 |
| FR4: Search by name (client-side) | Epic 1 |
| FR5: Inline-edit document name | Epic 1 |
| FR6: Open in full-screen / modal viewer | Epic 2 |
| FR7: Render images + PDFs in viewer | Epic 2 |
| FR8: Screen Wake Lock while viewer open | Epic 2 |
| FR9: Share via OS share sheet / clipboard | Epic 2 |
| FR10: Offline availability indicator | Epic 1 |
| FR11: "Save All Offline" button | Epic 1 |
| FR12: Pick existing trip doc when attaching to event | Epic 3 |
| FR13: Hard promote trip doc to event-linked | Epic 3 |
| FR14: Prompt on event delete with attached docs | Epic 3 |
| FR15: Infer kind from MIME type | Epic 1 |
| FR16: Name defaults to filename; user can rename | Epic 1 |
| FR17: First-time empty state nudge | Epic 1 |
| FR18: Delete document from tab | Epic 1 |

## Epic List

### Epic 1: Trip Document Upload & Management
**Goal:** Enable travelers to upload, browse, search, rename, and delete trip-level documents, establishing the Documents tab as a real, functional file management surface.
**FRs Covered:** FR1, FR2, FR3, FR4, FR5, FR10, FR11, FR15, FR16, FR17, FR18
**UX-DRs:** UX-DR1, UX-DR2, UX-DR5

### Epic 2: In-App Document Viewer
**Goal:** Let travelers view their documents without leaving the app — with screen-on behavior and a share action — so they can show boarding passes, tickets, and confirmations at checkpoints.
**FRs Covered:** FR6, FR7, FR8, FR9
**UX-DRs:** UX-DR3, UX-DR4

### Epic 3: Event Document Integration
**Goal:** Connect trip-level documents with itinerary events — letting travelers attach existing docs to events, move them back to trip-level, and make informed decisions when deleting events that have documents.
**FRs Covered:** FR12, FR13, FR14
**UX-DRs:** UX-DR6, UX-DR7

---

## Epic 1: Trip Document Upload & Management

### Story 1.1: Infrastructure Prerequisites & Documents Tab Scaffold

As a **developer**,
I want the technical prerequisites in place and an empty Documents tab rendered in the trip detail view,
So that all subsequent documents feature stories can build on a clean, correct foundation.

**Acceptance Criteria:**

**Given** the project needs Vercel Blob for file storage
**When** Story 1.1 is complete
**Then** `@vercel/blob` is installed and `BLOB_READ_WRITE_TOKEN=` is present in `.env.example` and `.env`

**Given** the `dbDocToType` mapper currently returns `"trip"` scope for all documents (because it checks `tripId` which is always set)
**When** the mapper is fixed
**Then** `scope` is derived as `row.eventId ? "event" : "trip"` — documents with an `eventId` return `"event"` scope, all others return `"trip"`

**Given** `place-row.tsx` is 425 lines (over the project component size limit)
**When** it is split
**Then** the inline-edit name field is extracted to `place-row-name-field.tsx` and the pill-button action bar is extracted to `place-row-action-bar.tsx`; `place-row.tsx` retains the outer container and orchestration; all existing tests still pass

**Given** the defunct `onAdd` callback chain threads through `AddDocDialog` → `place-row` → `TripItineraryView` → `page-client.tsx`
**When** it is removed
**Then** none of those files reference `onAdd` or `onAddDoc` anymore

**Given** the trip detail page currently shows "Document view coming soon."
**When** the tab is wired to a new `TripDocsTab` component
**Then** the "Document view coming soon." placeholder is replaced by the empty `TripDocsTab` rendering (initially shows the empty state or a loading scaffold); the component declares `"use client"` and has a `TripDocsTabProps` interface

**Given** E2E tests need a pre-existing trip-level document and must not hit real Blob storage
**When** Story 1.1 is complete
**Then** `e2e-seed-data.ts` includes one trip-level document for the E2E user's trip, and `playwright.config.ts` webServer env includes `UPLOAD_STUB=true`

**Given** the story implementation is complete
**When** tests are run
**Then** all existing unit tests and E2E tests continue to pass; unit tests are written for any modified files in `src/components/packt/**` or `src/lib/**` (NFR9)

### Story 1.2: Upload Documents to the Trip Tab

As a **traveler**,
I want to upload a PDF or image file from my device to the trip's Documents tab,
So that I have all my trip documents — boarding passes, confirmations, insurance — in one place.

**Acceptance Criteria:**

**Given** I am on the trip's Documents tab
**When** I tap the "Add" button
**Then** a file picker opens accepting `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic` files; the button has a visible text label ("Add") and carries a `title` attribute if an icon is included (UX-DR1); the hidden file input has an associated accessible `<label>` (NFR5)

**Given** I select a PDF file from my device
**When** the upload completes
**Then** the document is stored in Vercel Blob; a record is inserted into the `documents` table with `tripId`, `name` (defaults to filename), `kind: "pdf"` (inferred from `application/pdf` MIME type), `size` (formatted from `file.size`), and `url` (Vercel Blob public URL); the Documents tab updates to show the new document (FR1, FR2, FR15, FR16)

**Given** I select an image file (jpg, png, webp, heic)
**When** the upload completes
**Then** `kind` is set to `"image"`; all other metadata is saved identically to the PDF case

**Given** I select a file that is neither a PDF nor an image
**When** the upload completes
**Then** `kind` is set to `"doc"`

**Given** a document has been uploaded
**When** it appears in the Documents tab
**Then** it is rendered as a `DocRow` showing `DocKindBadge` and the document name; the component declares `"use client"` and defines a `DocRowProps` interface (NFR1); all colors use CSS custom properties (NFR2)

**Given** the E2E environment variable `UPLOAD_STUB=true` is set
**When** `uploadDocument` server action is called
**Then** the real `put()` Blob call is skipped and a fixed placeholder URL is used instead (NFR11)

**Given** the story implementation is complete
**When** tests are run
**Then** unit tests for `TripDocsTab`, `DocRow`, and `uploadDocument` pass with ≥95% line coverage (NFR9); a Playwright BDD scenario covering document upload exists in `tests/e2e/features/documents.feature` and passes (NFR10)

### Story 1.3: Browse & Delete Documents

As a **traveler**,
I want to see all my trip documents in a sorted list and be able to remove ones I no longer need,
So that my Documents tab stays organized and clutter-free.

**Acceptance Criteria:**

**Given** I have uploaded multiple documents
**When** I view the Documents tab
**Then** documents appear in a flat list sorted by `addedAt` descending (most recent first) (FR3)

**Given** I have never added any documents to this trip
**When** I open the Documents tab
**Then** an empty state message reads "Add your first trip document — boarding passes, insurance, visas, and more." (UX-DR5, FR17); no error or blank white space is shown

**Given** I have at least one document
**When** I view the Documents tab
**Then** the empty state nudge is not shown

**Given** a document row is visible
**When** I activate the delete button on that row
**Then** the document is removed from the `documents` table via the existing `removeDocument` server action; the row disappears from the list; Vercel Blob storage for that URL is also cleaned up (FR18)

**Given** the delete button is icon-only
**When** it renders
**Then** it has `title="Delete [doc name]"` and `aria-label="Delete [doc name]"` (NFR3); the tap target is at minimum 44×44px (NFR8)

**Given** a document row is rendered
**When** it is measured
**Then** the row is at minimum 44px tall (UX-DR2, NFR8)

**Given** the story implementation is complete
**When** tests are run
**Then** unit tests for delete and empty-state behaviour in `DocRow` and `TripDocsTab` pass with ≥95% line coverage (NFR9); Playwright BDD scenarios covering delete and empty state exist in `tests/e2e/features/documents.feature` and pass (NFR10)

### Story 1.4: Search & Inline Rename

As a **traveler**,
I want to search for documents by name and rename them directly from the list,
So that I can quickly find what I need and keep names meaningful without opening a separate dialog.

**Acceptance Criteria:**

**Given** I am on the Documents tab
**When** I type in the search field
**Then** the document list filters in real time to show only documents whose names contain the typed string (case-insensitive, client-side) (FR4); documents that don't match are hidden

**Given** the search field renders
**When** inspected for accessibility
**Then** it has an associated `<label>` element (either visible or visually hidden with `sr-only`) with text "Search documents" (NFR5)

**Given** I clear the search field
**When** it becomes empty
**Then** the full document list is restored

**Given** a document name is displayed in a row
**When** I click or tap the name
**Then** the name text is replaced by an `<input>` pre-filled with the current name; the input has an underline border using `var(--accent-brand)`; focus moves to the input (UX-DR2, FR5)

**Given** I am editing a document name
**When** I press Enter or the input loses focus (blur)
**Then** `renameDocument(docId, newName)` is called; the input is replaced by the updated name text (FR5, FR16)

**Given** I am editing a document name
**When** I press Escape
**Then** the input is replaced by the original name text with no change saved

**Given** I submit an empty or whitespace-only name
**When** blur or Enter fires
**Then** the rename is not saved and the original name is restored

**Given** the story implementation is complete
**When** tests are run
**Then** unit tests for search filtering and inline rename (including empty/Escape cases) pass with ≥95% line coverage (NFR9); Playwright BDD scenarios covering search and rename exist in `tests/e2e/features/documents.feature` and pass (NFR10)

### Story 1.5: Offline Status Indicator & Save All Offline

As a **traveler**,
I want to see which documents are available offline and save them all with one tap,
So that I can access my boarding passes and tickets even without mobile data.

**Acceptance Criteria:**

**Given** a document row is rendered
**When** I view the Documents tab
**Then** each row shows an offline status indicator (a filled dot when cached, empty dot when not) alongside the document name (FR10)

**Given** the offline indicator uses a visual dot
**When** inspected for accessibility
**Then** it carries `aria-label="Cached offline"` or `aria-label="Not cached offline"` — state is not conveyed by color alone (NFR4)

**Given** I am on the Documents tab and have at least one document
**When** I view the header area
**Then** a "Save All Offline" button is present (FR11)

**Given** I tap "Save All Offline"
**When** the action completes
**Then** all trip documents are marked as `offline: true` in the database; the offline indicator for each row updates to "Cached offline" (v1 implementation — actual cache sync is a future enhancement; the DB field is the source of truth for now)

**Given** the "Save All Offline" button is rendered
**When** inspected
**Then** it meets the 44×44px minimum touch target (NFR8) and uses CSS custom properties for all colors (NFR2)

**Given** the story implementation is complete
**When** tests are run
**Then** unit tests for the offline indicator and Save All Offline button pass with ≥95% line coverage (NFR9)

---

## Epic 2: In-App Document Viewer

### Story 2.1: Open Document in the In-App Viewer

As a **traveler**,
I want to tap a document to open it in a full-screen viewer without leaving the app,
So that I can present my boarding pass or ticket at a checkpoint without switching apps.

**Acceptance Criteria:**

**Given** I am on the Documents tab
**When** I tap the "View" button on a document row
**Then** the `DocViewer` component opens with that document; on mobile it is full-screen; on desktop it is a reasonably sized centered modal — not edge-to-edge (FR6, UX-DR3)

**Given** the viewer opens
**When** focus is managed
**Then** focus moves to the viewer's first interactive element (close button) on open; focus is trapped inside the viewer while it is open; pressing Escape closes the viewer and returns focus to the triggering row button (NFR7)

**Given** the viewer header renders
**When** I view it
**Then** it shows the document name, a share button, and a close button (UX-DR4)

**Given** the "View" button in a `DocRow` is icon-only
**When** it renders
**Then** it has `title="View [doc name]"` and `aria-label="View [doc name]"` (NFR3); tap target is minimum 44×44px (NFR8)

**Given** the viewer is open
**When** I tap the close button or press Escape
**Then** the viewer closes and focus returns to the "View" button that triggered it (NFR7)

**Given** the story implementation is complete
**When** tests are run
**Then** unit tests for `DocViewer` open/close and focus management pass with ≥95% line coverage (NFR9); a Playwright BDD scenario covering document viewing exists in `tests/e2e/features/documents.feature` and passes (NFR10)

### Story 2.2: Render Document Content in the Viewer

As a **traveler**,
I want the viewer to display my document correctly whether it's an image or a PDF,
So that I can actually read and present the content without downloading it separately.

**Acceptance Criteria:**

**Given** the open document has `kind: "image"`
**When** the viewer renders
**Then** an `<img>` element is displayed with `src={doc.url}` and `alt={doc.name}`; the image fits within the viewer with `object-fit: contain` and does not overflow (FR7, NFR6)

**Given** the open document has `kind: "pdf"` and the user is NOT on mobile Safari
**When** the viewer renders
**Then** an `<iframe>` is displayed with `src={doc.url}` and `title={doc.name}` (FR7)

**Given** the open document has `kind: "pdf"` and the user IS on mobile Safari (which cannot embed PDFs in iframes)
**When** the viewer renders
**Then** a fallback `<a href={doc.url} target="_blank">Open PDF</a>` link is shown instead of the iframe (FR7)

**Given** the open document has `kind: "doc"` or any unrecognised kind
**When** the viewer renders
**Then** a `<a href={doc.url} download={doc.name}>Download</a>` link is shown (FR7)

**Given** the `DocViewer` component is created
**When** inspected
**Then** it declares `"use client"` at the top; defines a `DocViewerProps` interface; uses only CSS custom properties for colors (NFR1, NFR2)

**Given** the story implementation is complete
**When** tests are run
**Then** unit tests for image, PDF, mobile-Safari-fallback, and doc rendering branches pass with ≥95% line coverage (NFR9)

### Story 2.3: Share Document & Keep Screen On

As a **traveler**,
I want to share a document link and have my screen stay on while viewing it,
So that I can hand my phone to staff at a checkpoint without the screen dimming mid-presentation.

**Acceptance Criteria:**

**Given** the viewer is open
**When** I tap the share button in the viewer header
**Then** if `navigator.share` is available, the native OS share sheet opens with `{ title: doc.name, url: doc.url }`; if not available, the URL is copied to the clipboard via `navigator.clipboard.writeText` (FR9)

**Given** the share button is present in both `DocRow` and `DocViewer`
**When** the share logic is inspected
**Then** both use the same `shareDoc(doc)` utility extracted to `src/lib/utils.ts` — no duplicated implementation

**Given** the share button in the viewer header is icon-only
**When** it renders
**Then** it has `title="Share [doc name]"` and `aria-label="Share [doc name]"` (NFR3); tap target is minimum 44×44px (NFR8)

**Given** the viewer opens with a document
**When** the Wake Lock effect runs
**Then** `navigator.wakeLock.request('screen')` is called if the API is available; the lock is released when the viewer closes or the component unmounts; errors are silently caught (FR8)

**Given** a browser that does not support Wake Lock
**When** the viewer opens
**Then** no error is thrown and the viewer functions normally without the lock

**Given** the story implementation is complete
**When** tests are run
**Then** unit tests for `shareDoc`, Wake Lock mount/unmount, and no-Wake-Lock fallback pass with ≥95% line coverage (NFR9); a Playwright BDD scenario covering document sharing exists in `tests/e2e/features/documents.feature` and passes (NFR10)

---

## Epic 3: Event Document Integration

### Story 3.1: Attach an Existing Trip Document to an Event

As a **traveler**,
I want to pick a document I've already uploaded when attaching a file to an itinerary event,
So that I don't have to upload the same file twice.

**Acceptance Criteria:**

**Given** I tap "Add document" on an event that has no attached documents
**And** there are trip-level documents available
**When** the `AddDocDialog` opens
**Then** it shows a pick list of existing trip-level docs first (each showing `DocKindBadge` + name), with an "Upload new instead" toggle below (FR12, UX-DR6)

**Given** the pick list is displayed
**When** I select a document from it
**Then** `attachTripDocToEvent(docId, eventId)` is called; the document's `eventId` is set in the database (moving it from trip-level to event-linked — no dual membership); the dialog closes (FR12, FR13)

**Given** I tap "Upload new instead" in the pick list panel
**When** the toggle activates
**Then** the dialog switches to the upload panel (file input + name field) identical to the standalone upload flow

**Given** there are no trip-level documents
**When** the `AddDocDialog` opens for an event
**Then** it opens directly in upload mode — no pick list is shown

**Given** the pick list panel opens
**When** focus is managed
**Then** focus moves to the first list item on open; Escape closes the dialog and returns focus to the trigger (NFR7)

**Given** the `AddDocDialog` is updated
**When** inspected
**Then** it declares `"use client"`; defines `AddDocDialogProps` with `tripDocs?: Document[]`; `tripDocs` is passed from `place-row.tsx` which receives it from the trip data (NFR1)

**Given** the story implementation is complete
**When** tests are run
**Then** unit tests for pick-mode panel, upload-mode toggle, and `attachTripDocToEvent` pass with ≥95% line coverage (NFR9); a Playwright BDD scenario covering "attach existing doc to event" exists in `tests/e2e/features/documents.feature` and passes (NFR10)

### Story 3.2: Delete an Event with Attached Documents

As a **traveler**,
I want to decide what happens to my documents when I delete an event that has files attached,
So that I don't accidentally lose documents I still need.

**Acceptance Criteria:**

**Given** I trigger the delete action on an event
**And** that event has one or more attached documents
**When** the delete is initiated
**Then** instead of immediately deleting, a `DeleteEventDialog` opens showing "Delete [event name]? This event has [N] attached document(s)." (FR14, UX-DR7)

**Given** the `DeleteEventDialog` is open
**When** I view the footer
**Then** three buttons are shown: "Keep documents" (primary action, receives focus on open), "Delete everything" (destructive variant), and "Cancel" (UX-DR7, NFR7)

**Given** I choose "Keep documents"
**When** the action runs
**Then** `deleteEventWithDocDecision(eventId, true)` is called; all documents previously attached to that event have their `eventId` set to `null` (promoting them back to trip-level); the event is deleted; the dialog closes (FR14)

**Given** I choose "Delete everything"
**When** the action runs
**Then** `deleteEventWithDocDecision(eventId, false)` is called; the event and all its attached documents are deleted; the dialog closes (FR14)

**Given** I choose "Cancel" or press Escape
**When** the dialog closes
**Then** no changes are made; focus returns to the delete trigger in `place-row.tsx` (NFR7)

**Given** I trigger delete on an event with no attached documents
**When** the delete is initiated
**Then** the existing `deleteEvent` action is called directly — no dialog is shown; `deleteEvent` is NOT modified (existing behavior preserved)

**Given** the `DeleteEventDialog` component is created
**When** inspected
**Then** it declares `"use client"`; defines a `DeleteEventDialogProps` interface; uses the existing `Dialog` primitive for focus trap and Escape handling (NFR1, NFR7)

**Given** the story implementation is complete
**When** tests are run
**Then** unit tests for keep-docs path, delete-all path, cancel, and no-docs (direct delete) pass with ≥95% line coverage (NFR9); Playwright BDD scenarios covering both event-delete paths exist in `tests/e2e/features/documents.feature` and pass (NFR10)
