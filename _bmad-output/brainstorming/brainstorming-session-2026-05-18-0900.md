---
stepsCompleted: [1, 2, 3, 4]
session_active: false
workflow_completed: true
inputDocuments: []
session_topic: 'Documents tab for a trip in Packt'
session_goals: 'Generate ideas across features (what the tab can do), UI/UX (how it looks and feels), and technical design (how it is structured) — covering event-linked documents and free-floating trip-level documents'
selected_approach: 'ai-recommended'
techniques_used: ['What If Scenarios', 'SCAMPER Method', 'Morphological Analysis']
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Spencer
**Date:** 2026-05-18

## Session Overview

**Topic:** Documents tab for a trip in Packt
**Goals:** Generate ideas across features, UI/UX, and technical design — event-linked docs + free-floating trip-level docs

### Session Setup

Open-ended exploration covering all dimensions: what the tab does, how it looks and feels, and how it's built under the hood.

## Technique Selection

**Approach:** AI-Recommended Techniques
**Analysis Context:** Documents tab for a trip with focus on features + UI/UX + technical design

**Recommended Techniques:**

- **What If Scenarios:** Blasts open hidden assumptions about what "documents" even means in a travel context — generates wild/useful ideas before anchoring on anything
- **SCAMPER Method:** Systematically covers 7 lenses (Substitute, Combine, Adapt, Modify, Put to other uses, Eliminate, Reverse) to generate concrete feature and UI ideas
- **Morphological Analysis:** Maps the full parameter space (doc types × attachment models × UI patterns × access methods) to surface trade-offs for technical and UX decisions

**AI Rationale:** Goals span divergent (what's possible?) and convergent (how should it work?) thinking — this 3-phase sequence opens wide with What If, covers ground methodically with SCAMPER, then closes in on a design matrix with Morphological Analysis.

## Technique Execution: What If Scenarios

**Ideas Generated:** 26

**[Feature #1]: Two-Section Document Hub**
_Concept:_ Documents tab has two distinct sections — event-linked docs (pooled from all trip events) and orphan docs (trip-level, not tied to any event). Visually separated, not intermixed.
_Novelty:_ Preserves the semantic distinction between "this belongs to my hotel check-in" vs. "this is my travel insurance."

**[Feature #2]: Cross-Link to Event**
_Concept:_ Each event-linked doc has a back-link to the event it belongs to — tap it and you jump to that event in the timeline.
_Novelty:_ Documents tab becomes a navigation entry point into the itinerary, not just a file drawer.

**[Feature #3]: Contextual "Doc You Need Now"**
_Concept:_ The tab surfaces a doc (or small set of docs) based on current time vs. event times — flight boarding pass floats to the top 2 hours before departure.
_Novelty:_ Transforms a passive archive into an active travel assistant at the exact moment of use.

**[Feature #4]: Filtering by Date / Type / Label**
_Concept:_ Docs are filterable across dimensions — requires metadata (type, label) that doesn't fully exist yet.
_Novelty:_ Raises the question of where metadata comes from — event inference vs. manual entry.

**[Feature #5]: Event-Inferred Metadata with Manual Override**
_Concept:_ A doc attached to a flight event inherits type = flight, date = flight date, automatically. User can override any field. Orphan docs require manual entry.
_Novelty:_ Minimum friction for the common case; escape hatch for edge cases.

**[UI #6]: Collapsing "Right Now" Section**
_Concept:_ A section at the top of the Documents tab that expands when an event with attached docs is approaching or active, shows relevant docs prominently, then collapses back to the standard two-section list when nothing is time-relevant.
_Novelty:_ The tab is passively useful always, actively useful exactly when needed — no mode-switching required.

**[Feature #7]: Lingering "Right Now" Window**
_Concept:_ "Right Now" doesn't drop off at event start time — it persists until a configurable post-event buffer elapses (e.g., stays active 30 min after flight departure, accounting for real-world delays).
_Novelty:_ Designed for how travel actually works, not how it's scheduled.

**[Feature #8]: User-Configurable Time Windows**
_Concept:_ In preferences, users set how early "Right Now" activates before an event and how long it lingers after. Default probably something like 2h before / 30min after.
_Novelty:_ Connects Documents tab behavior to the existing preferences system rather than hardcoding travel assumptions.

**[UI #9]: Stacked "Right Now" for Overlapping Events**
_Concept:_ When multiple events fall in the active window simultaneously, their docs stack in chronological order within the "Right Now" section — earliest event first.
_Novelty:_ No prioritization logic needed; chronological order is intuitive for travel.

**[Technical #10]: Document as First-Class Entity**
_Concept:_ `Document` has its own table — `id`, `type`, `label`, `date`, `tripId`, optional `eventId`. When `eventId` is set it's event-linked; when null it's an orphan.
_Novelty:_ Clean model — filtering by `eventId IS NULL` gives orphans, joining on `eventId` gives event-linked docs.

**[Feature #11]: Device Upload, In-App Viewer**
_Concept:_ Docs are uploaded from device storage (Files, Photos). Viewing opens a full-screen in-app viewer rather than handing off to the OS — PDF scrollable, images pinch-to-zoom.
_Novelty:_ Keeps the user in Packt at the moment they need the doc most; no context switch at the airport gate.

**[UI #13]: Auto-Brightness + Keep Screen On in Viewer**
_Concept:_ When the in-app doc viewer opens, screen brightness bumps to max and auto-lock is suppressed. Reverts when viewer closes.
_Novelty:_ Eliminates the two most common failure modes at a scanner — dim screen and screen locking mid-scan.

**[Feature #14]: Orphan Doc "Add" Button on Documents Tab**
_Concept:_ The orphan section has its own add button — opens the device file picker, creates a doc with `eventId = null`.
_Novelty:_ Makes the Documents tab the canonical home for anything not tied to a specific event.

**[Feature #15]: Pick from Orphans When Attaching to Event**
_Concept:_ When attaching a doc to an event from the day/timeline view, the picker offers two options — upload new, or select from existing orphan docs. Selecting an orphan sets its `eventId`, promoting it to event-linked.
_Novelty:_ Avoids duplicate uploads; lets users upload once and attach contextually later.

**[Data Model #16]: Hard Promote — Move Not Copy**
_Concept:_ Promoting an orphan to an event is a destructive move — `eventId` is set, doc leaves the orphan section permanently. No dual-membership.
_Novelty:_ Simpler model, clearer user mental map. Orphan = not yet placed; event-linked = placed.

**[UI #17]: Day-Primary, Event-Secondary Grouping**
_Concept:_ Event-linked docs are grouped by day (Day 1, Day 2...) with event sub-groups within each day ("Delta Flight 441", "Hotel Indigo"). Mirrors the timeline hierarchy.
_Novelty:_ Familiar mental model for users already navigating the day-based itinerary.

**[Feature #18]: Event Delete Warning for Docs**
_Concept:_ Deleting an event with attached docs triggers a dialog — "This event has X attached documents. Delete them too, or keep as trip documents?" Choosing keep demotes them to orphans.
_Novelty:_ No silent data loss; user stays in control.

**[Feature #19]: Doc Name vs. File**
_Concept:_ Doc entity carries two name fields — user-provided `name` (display name) and `file` (the uploaded asset, giving filename, size, MIME type). Row displays `name`.
_Novelty:_ Clean separation between "what the user calls this doc" and "what the file actually is."

**[Feature #20]: Search by Name**
_Concept:_ A search input on the Documents tab filters docs by user-provided name across both sections.
_Novelty:_ Essential for trips with many docs; fastest path when you know what you're looking for.

**[UI #21]: Viewer as Shared Component**
_Concept:_ The in-app doc viewer is launched from both the event card and the Documents tab — same full-screen experience either way. No redirects.
_Novelty:_ Consistent behavior regardless of entry point.

**[Technical #22]: Offline-First Architecture**
_Concept:_ Docs are stored locally on device as the primary source; sync to server is secondary. Every doc is accessible without a network connection.
_Novelty:_ Architectural decision that affects the whole stack. Travel use case demands it.

**[Feature #23]: Manual Offline Controls + Status Indicators**
_Concept:_ Short-term: a "Save All Offline" button on the Documents tab, plus a per-doc indicator showing cached / not cached status. User can also trigger per-doc manually.
_Novelty:_ Transparency about what's actually on device vs. what requires connectivity.

**[Feature #24]: Auto-Cache for Upcoming Events (Long Term)**
_Concept:_ A preference to automatically download docs for events within a configurable time window (e.g., next 48h). Optionally, a reminder push notification before a trip.
_Novelty:_ Removes the "I forgot to save it offline" failure mode entirely.

**[Data #25]: Orphan Sort by Upload Date**
_Concept:_ Orphan section defaults to reverse-chronological upload order. Search handles navigation for large collections.
_Novelty:_ Simple, predictable — most recently added is most likely to be relevant.

**[Data #26]: Doc Type Taxonomy v1**
_Concept:_ Type picker includes: Boarding Pass, Hotel Confirmation, Train/Bus Ticket, Car Rental, Visa/Passport, Travel Insurance, Activity Ticket, Restaurant Reservation, Other.
_Novelty:_ Drives both filtering and event-type inference (flight event → Boarding Pass default, hotel event → Hotel Confirmation default).

## Technique Execution: SCAMPER Method

**Ideas Generated:** 15 (running total: 41)

**[UI #27]: Optional Thumbnail Toggle (Low Priority)**
_Concept:_ List view is default; a toggle could show small doc previews for visual scanning. Not essential given day/event grouping was dropped.
_Novelty:_ Nice-to-have deferred to post-v1.

**[Design Pivot #28]: Docs Tab = Trip-Level Only**
_Concept:_ Documents tab shows only trip-level docs — no parallel timeline of event-linked docs. Event docs live on events. Documents tab is the travel wallet for trip-wide papers.
_Novelty:_ Cleaner mental model — each surface has one job. Documents tab = reference library, main page = active assistant.

**[Design Pivot #29]: "Right Now" Lives on Main Trip Page**
_Concept:_ The main trip page already surfaces the active event and its docs. Documents tab doesn't need a time-based section.
_Novelty:_ Eliminates duplication; the main page is already the real-time assistant.

**[Feature #30]: Confirmation Number Field — Manual Now, Auto-Parse Later**
_Concept:_ Doc entity has an optional `confirmationNumber` field. Short-term: user enters it manually. Long-term: OCR/parsing extracts it from the uploaded file. No migration needed when auto-parsing lands.
_Novelty:_ Field is in the data model now; the intelligence comes later.

**[Feature #31]: Barcode/QR Extraction (Long-Term)**
_Concept:_ Eventually, uploading a boarding pass would extract and surface the QR code as the primary element. Short-term: full document view is sufficient.
_Novelty:_ Transforms the viewer from a file reader into an intelligent travel assistant — deferred until foundation is solid.

**[Feature #32]: Tags on Documents (Deferred)**
_Concept:_ Docs support multiple free-form tags for flexible cross-cutting organization. Deferred — v1 uses name only.
_Novelty:_ Open-ended user-defined organization beyond finite type values.

**[UX #33]: Frictionless Upload with Smart Defaults**
_Concept:_ Add doc flow: pick file → done. Name defaults to filename, everything else optional. Every field editable after the fact.
_Novelty:_ Removes setup cost that makes people not bother uploading.

**[UI #34]: Enriched Doc Row (Simplified)**
_Concept:_ Doc row shows name + offline status indicator. Confirmation number and tags deferred to post-v1.
_Novelty:_ Even a name-only row with offline status is genuinely useful.

**[Feature #35]: Trip Copy with Doc Selector**
_Concept:_ When duplicating a trip, a toggle lets you include or exclude the trip's documents. Default off — copied trips usually need new confirmations.
_Novelty:_ Avoids stale docs silently carrying over.

**[Feature #36]: Share Doc from App**
_Concept:_ Doc viewer offers a share action — exports the file via the OS share sheet. Useful for sending a hotel confirmation to a travel companion.
_Novelty:_ Low implementation cost via native share sheet.

**[Feature #37]: App-Level Traveler Wallet**
_Concept:_ A "Wallet" section for long-lived traveler documents (passport scan, vaccination records, annual insurance, etc.). Accessed by tapping your name in the sidenav, which now opens a menu: "Preferences" and "Wallet."
_Novelty:_ Three-tier hierarchy — Preferences (text/numbers), Wallet (long-lived files), Trip Documents (trip-specific files).

**[Design Decision #38]: Name Only — No Type, Tags, or Labels for v1**
_Concept:_ Doc entity carries just `name`. Type, tags, label, and confirmation number all deferred. Minimum viable data model.
_Novelty:_ Forces UI to earn each field before adding it.

**[UX #39]: Inline Name Edit from Row**
_Concept:_ Tapping a doc row's name opens an inline edit — consistent with editing patterns elsewhere in the app. A separate action opens the viewer.
_Novelty:_ No separate edit screen needed; name edit and viewing are two distinct obvious actions.

**[Feature #40]: Document Expiry Warnings**
_Concept:_ Wallet documents can carry an expiry date. The app surfaces an in-app warning when a doc expires within a configurable window. Backed by a preference to opt out.
_Novelty:_ Catches the "passport expires next month, trip is next week" failure mode before it becomes a crisis.

**[UX #41]: First-Time Docs Nudge**
_Concept:_ An empty state prompt on the Documents tab encourages first-time users to add their first trip doc — shown once, dismissed permanently.
_Novelty:_ Onboarding pattern, not a recurring feature.

**[UI #42]: Responsive Viewer**
_Concept:_ Doc viewer opens full-screen on mobile. On desktop, opens as a reasonably sized modal. Same viewer component, responsive sizing.
_Novelty:_ Appropriate for context — mobile is immersive (airport use), desktop is more ambient.

**[UI #43]: Wallet Flat List with Expiry Indicators**
_Concept:_ Wallet UI mirrors the trip Documents tab — flat list, inline name edit, upload button. Docs with an expiry date show a warning icon when within the configured warning window.
_Novelty:_ Reuses the same list component; expiry warning is additive, not a separate view.

## Idea Organization and Prioritization

### Thematic Organization

**Theme 1: Core Trip Documents Tab** ← v1 focus
- Trip-level docs only — clean mental model, no timeline duplication
- First-class `Document` entity: `id`, `tripId`, `name`, `fileUrl`, `fileSize`, `mimeType`, `uploadedAt`
- Frictionless upload — pick file → done, name defaults to filename
- Flat list sorted by upload date, search by name
- Inline name edit from row (consistent with app patterns)
- First-time empty state nudge, dismissed after

**Theme 2: App-Level Traveler Wallet** ← breakout idea
- Long-lived traveler docs: passport, vaccination records, annual insurance
- Sidenav profile tap → popover menu: "Preferences" / "Wallet"
- Same flat list UI + expiry date field + warning icon
- Opt-out preference for expiry warnings

**Theme 3: In-App Document Viewer** ← v1, core
- Full-screen on mobile, modal on desktop
- Auto-brightness + keep screen on (scanner-ready at gate)
- Share via OS share sheet
- Shared component — same viewer launched from event card or Docs tab

**Theme 4: Offline & Storage** ← architectural foundation
- Offline-first — local storage primary, server sync secondary
- "Save All Offline" button + per-doc cached/not-cached indicator
- Auto-cache for upcoming events (long-term preference)

**Theme 5: Event Integration** ← v1, connective tissue
- Event attachment picker can pull from existing trip docs (pick vs. upload new)
- Picking a trip doc for an event moves it — no dual membership
- Event delete → dialog: keep docs as trip-level or delete them
- Trip copy → selector: include docs or not

**Deferred (named, not forgotten):**
Type/tags/labels, confirmation number field, barcode/QR extraction, time-based surfacing on docs tab, thumbnail toggle, filtering by type/date, auto-cache preference

### Prioritization Results

**Top Priority — Real Document Upload + Viewer**
Replace the current mock (name + type picker) with real file storage and an in-app viewer. This is the foundation every other feature depends on.

**Quick Win — Frictionless Upload**
Pick file → done. Name defaults to filename. Zero metadata required. Gets docs into the app with minimum friction from day one.

**Most Exciting Long-Term — Auto-Document Parsing**
Upload a boarding pass and Packt extracts the confirmation code, seat, flight number, and QR code automatically. The data model (confirmation number field, file storage) is designed to support this when the time comes.

### Action Plans

**Action Plan #1: Real Document Upload + Viewer (v1 Core)**

*Foundation everything else is built on.*

1. Choose file storage solution — S3-compatible (Supabase Storage fits existing stack)
2. Migrate `Document` entity to real schema: `id`, `tripId`, `eventId?`, `name`, `fileUrl`, `fileSize`, `mimeType`, `uploadedAt`
3. Build upload flow: file picker → upload to storage → save record (name defaults to filename)
4. Build in-app viewer: PDF scrollable, images pinch-to-zoom, full-screen mobile / modal desktop
5. Wire auto-brightness + keep-screen-on when viewer opens
6. Add inline name edit on row, search, offline status indicator, share action
7. Event integration: attachment picker can pull from existing trip docs; event delete dialog; trip copy selector

**Timeline estimate:** 2–3 feature iterations to get upload + viewer + offline solid.

**Action Plan #2: App-Level Traveler Wallet (v2)**

*New surface, high value for frequent travelers.*

1. Expand sidenav profile tap → popover menu: "Preferences" / "Wallet"
2. Build Wallet screen — same list component as Documents tab + expiry date field
3. Add warning icon logic — surface when expiry is within configured window
4. Add expiry warning opt-out to preferences

**Action Plan #3: Auto-Document Parsing (Long-Term)**

*The feature that makes Packt feel magical.*

1. Confirmation number field ships with manual entry (data model already designed for it)
2. OCR layer — parse text from uploaded PDF/image on upload
3. Pattern matching — extract confirmation codes, dates, barcodes
4. QR/barcode detection — surface scannable element as hero of the viewer
5. Expiry date extraction for Wallet docs (passport, insurance)

## Session Summary and Insights

**Total Ideas Generated:** 43 across 3 techniques (What If Scenarios, SCAMPER, Morphological Analysis)

**Key Achievements:**
- Pivoted from a complex two-section doc hub mirroring the timeline to a clean, focused trip-level document library — simpler and more useful
- Discovered the App-Level Traveler Wallet as a new surface that complements the trip documents tab and existing preferences
- Defined a three-tier hierarchy: Preferences (text/numbers) → Wallet (long-lived files) → Trip Documents (trip-specific files)
- Nailed the data model: first-class Document entity designed to support auto-parsing and Wallet expiry without future migration

**Breakthrough Moments:**
- The SCAMPER "Combine" lens surfaced the insight that duplicating the timeline inside the Documents tab was redundant — killing the feature's complexity in one pivot
- The "Put to Other Uses" lens revealed the Wallet concept and the sidenav profile menu expansion — neither was anticipated at session start

**Deferred with Intention:**
Every deferred feature (type, tags, filtering, barcode extraction, auto-cache) has a clear trigger for when it becomes worth building. Nothing was discarded — it was staged.
