---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'Non-event itinerary item types for Packt travel app — checklists, notes, icons, interactions, and day planner integration'
session_goals: 'Generate UX/interaction design ideas, icon choices, edge cases, and surface unconsidered features'
selected_approach: 'ai-recommended'
techniques_used: ['SCAMPER Method', 'Cross-Pollination', 'Concept Blending']
ideas_generated: 28
context_file: 'backlog/backlog.md'
session_active: false
workflow_completed: true
---

# Brainstorming Session Results

**Facilitator:** Spencer
**Date:** 2026-05-14

## Session Overview

**Topic:** Non-event itinerary item types for Packt travel app — checklists, notes, icons, interactions, and day planner integration
**Goals:** Generate UX/interaction design ideas, icon choices, edge cases, and surface unconsidered features

### Context Guidance

_Backlog item: Add non-event Itinerary Items — checklists (interactive, checkable, editable) and notes (free-form text). Each type needs a distinct icon. The current "event" icon should become a GPS marker. Existing event model is the reference design._

### Session Setup

_Session focused on product/UX design for a concrete, familiar domain. Approach: AI-Recommended three-phase technique sequence._

## Technique Selection

**Approach:** AI-Recommended Techniques
**Analysis Context:** Non-event itinerary items with focus on UX/interaction design, icons, and integration patterns

**Recommended Techniques:**

- **SCAMPER Method:** Systematically explore the existing event model through 7 lenses to map the full design space for checklists and notes
- **Cross-Pollination:** Mine patterns from travel apps, productivity tools, and physical journals — transfer battle-tested interaction conventions
- **Concept Blending:** Merge checklist + note + event to surface hybrid types and ideas beyond the original spec

**AI Rationale:** Concrete domain with an existing model calls for systematic coverage first, external inspiration second, and creative synthesis third. SCAMPER anchors the design space; Cross-Pollination brings proven patterns; Concept Blending reaches for the non-obvious.

---

## Technique Execution Results

> **Terminology note:** "Chip" refers to the existing `EventChip` component and term used in the codebase. Checklists and notes are **itinerary line items** — the same structural role as events on the timeline, but their own components. Notes in particular do not share the chip visual style; they render as plain text blocks.

### SCAMPER Method

**[SCAMPER-S #1]: Tabula Rasa Types**
_Concept:_ Checklists and notes are first-class timeline primitives, not event variants. They carry no time, location, or duration — just content and a position on the day's timeline. The only shared attribute with events is "I exist at some point in this day."
_Novelty:_ Most apps try to unify item types under a shared schema. Treating them as genuinely distinct primitives keeps the data model clean and the UI honest.

**[SCAMPER-S #2]: Shared Index, Distinct Identity**
_Concept:_ All itinerary items (events, checklists, notes) live on the same ordered index. Time is optional and advisory — drag order is the real truth. New types inherit this positioning model for free.
_Novelty:_ No special-casing needed for new types in the timeline engine. The design problem shrinks to: what does each type look like and do, not how does it fit.

**[SCAMPER-C #3]: Clean Type Boundaries**
_Concept:_ Three distinct types, no hybrids. An item is exactly one of: event, checklist, or note.
_Novelty:_ Simplicity as a design principle — the mental model stays clear for the user and the data model stays flat.

**[SCAMPER-C #4]: Checklist Completion State**
_Concept:_ When the last item is checked, the checklist enters a "complete" state — some visual signal distinguishes it from an in-progress checklist on the timeline.
_Novelty:_ Most checklist UIs treat items independently. Aggregate completion state gives the checklist its own lifecycle, which maps nicely to travel prep ("hotel confirmation checklist: done").

**[SCAMPER-C #5]: Completion Animation + Badge**
_Concept:_ Checking the last item triggers a subtle celebratory animation, then settles into a persistent "completed" badge on the line item. In-progress and complete checklists are visually distinct at a glance.
_Novelty:_ The animation makes completion feel earned. The settled badge means you can scan the day and see at a glance what's done vs. still active.

**[SCAMPER-A #6]: Notes as In-Trip Reminders Only**
_Concept:_ Notes are scoped to active use during the trip — reminders, quick info, things to remember in the moment. Pre-trip research and post-trip reflections are out of scope and belong to a future journal feature.
_Novelty:_ Tight scope keeps the note type lightweight and purposeful. No feature creep into diary territory.

**[SCAMPER-M #7]: Notes Are Inert**
_Concept:_ A note has exactly two interactions — read it, edit it. No acknowledgment state, no completion, no lifecycle. It's a text annotation on the timeline.
_Novelty:_ Resisting the urge to add state keeps the mental model of notes distinct from checklists. Two types, two clearly different behaviors.

**[SCAMPER-E #8]: Checklist Has Title + Collapsible Body**
_Concept:_ A checklist line item shows a title and its items. It can collapse — either manually by the user, or automatically as part of the completion animation. Collapsed state shows title + completion badge only.
_Novelty:_ Collapsibility serves two purposes: completion ceremony AND practical space management when a checklist has many items.

**[SCAMPER-E #9]: Manual Collapse for Long Checklists**
_Concept:_ User can collapse/expand a checklist at any time, not only on completion. Useful for checklists with many items that would otherwise dominate the timeline view.
_Novelty:_ Separates "I'm done with this" (completion) from "I just want it out of my way temporarily" (collapse).

**[SCAMPER-E #10]: Icon Decisions**
_Concept:_ Three distinct icons establish clear visual identity for each type: `MapPin` (event), `ListChecks` (checklist), `FileText` (note). All available in Lucide at `strokeWidth={1.5}`.
_Novelty:_ `FileText` deliberately chosen over `StickyNote` — reads as "content" rather than "ephemeral," which fits a purposeful in-trip reminder better than a casual sticky note.

---

### Cross-Pollination

**[Cross-Poll #11]: Two Distinct Checklist Archetypes**
_Concept:_ In-itinerary checklists are contextual and moment-specific ("things I need when I arrive at this hotel"). Packing lists are reusable trip-level templates — a separate future feature. These serve fundamentally different purposes and shouldn't be conflated.
_Novelty:_ Clarifying this boundary now prevents the in-itinerary checklist from scope-creeping into template/reuse territory, keeping it lightweight.

**[Cross-Poll #12]: Checklists Belong on the Timeline Because They're Contextual**
_Concept:_ An in-itinerary checklist is tied to a moment — it's a reminder that's relevant at a specific point in your day, not a global list. Timeline placement is the feature.
_Novelty:_ The position on the timeline is the metadata. No need for tagging, categorizing, or associating with an event — where it sits tells you when it matters.

**[Cross-Poll #13]: Inline Editing Everywhere**
_Concept:_ Note content, checklist titles, and checklist items all follow the existing "looks like a label, tap to edit inline" pattern. No dialogs, no separate edit mode.
_Novelty:_ Consistency with the existing day note and event note patterns means zero learning curve for the user.

**[Cross-Poll #14]: Persistent "Add Item" Row**
_Concept:_ The last row of every checklist is always a persistent "add new item" input — always visible, no separate button or mode to enter. Items are ordered by creation, no reordering.
_Novelty:_ Removes a whole interaction surface (drag handles, reorder mode) while keeping the add flow effortless. The list grows naturally downward.

**[Cross-Poll #15]: Consistent Hover-Delete Pattern**
_Concept:_ Checklists and notes use the same hover-to-reveal trash icon as events — no new interaction pattern needed. Checklist items within the list follow the same logic at the row level.
_Novelty:_ Zero new affordances to learn. The delete pattern is already part of the user's mental model from working with events.

---

### Concept Blending

**[Blend #16]: Checklist Progress Counter**
_Concept:_ The collapsed checklist line item shows a `X/Y` item counter (e.g., `6/8`) alongside the title. At a glance you know how far through any checklist you are without expanding it.
_Novelty:_ Turns the collapsed state from purely decorative into genuinely informative — a checklist on the timeline communicates status even when you're not interacting with it.

**[Blend #17]: Strikethrough-in-Place**
_Concept:_ Checked items stay visible with a strikethrough and dimmed style. The checklist reads as a record of what's been done, not just what's left.
_Novelty:_ In a travel context, completed items are often confirmations ("bought tickets ✓") — seeing them crossed off is reassuring, not cluttering.

**[Blend #18]: Hover-to-Insert Between Items (Desktop)**
_Concept:_ A `+` button appears on hover in the gap between any two timeline items — clicking it inserts a new item at that position directly. The `+` at the bottom of the day remains for adding at the end.
_Novelty:_ Eliminates the "add at bottom, drag to position" two-step entirely. Insertion point is the interaction, not an afterthought.

**[Blend #19]: Mini Inline Type Picker**
_Concept:_ Clicking any `+` (between items or at day bottom) reveals a small popover with three icons — `MapPin`, `ListChecks`, `FileText`. Selecting one inserts that type at the insertion point and immediately enters edit mode on the title/content.
_Novelty:_ The entire add flow is a single tap + single pick. No navigation, no dialog, no mode switch.

**[Blend #20]: Optional Title, Required Items**
_Concept:_ Creating a checklist drops the cursor directly into the first item field. Title is optional and can be added later. Items are the core of a checklist — the title is metadata.
_Novelty:_ Inverts the typical "name first" creation flow. Gets the user adding content immediately, which matches the "quick reminder" use case better than naming things upfront.

**[Blend #21]: Untitled Checklist Shows Generic Label**
_Concept:_ A checklist without a title displays its `ListChecks` icon + item count (e.g., "Checklist · 4 items"). The icon is sufficient to identify the type; the count communicates scale.
_Novelty:_ The icon does the identity work that a title would otherwise do. Users scan by icon first anyway — the generic label is honest rather than misleading.

**[Blend #22]: Notes Are Fully Inline, No Title**
_Concept:_ A note renders its full text content directly on the timeline — no bordered container, no collapse, no title field. It's a text block between other items. Tap anywhere to edit inline.
_Novelty:_ Notes don't compete with events and checklists for visual weight. They read like margin annotations on the day, which matches how they'll actually be used.

**[Blend #23]: "Add Title" Placeholder on Expanded Checklist**
_Concept:_ When a checklist is expanded, a dim "Add title..." placeholder sits above the item list. Clicking it enters inline edit mode on the title field. When collapsed without a title, the generic label is shown instead.
_Novelty:_ Title is discoverable but not demanded — the placeholder invites without requiring.

**[Blend #24]: Gutter + for Mobile Insert**
_Concept:_ A small `+` sits in the left gutter between each timeline item on mobile — always visible, compact. Tapping it opens the type picker at that insertion point. Same behavior as the hover `+` on desktop, different trigger.
_Novelty:_ Keeps insert-between on mobile without requiring gesture discovery. The gutter is otherwise empty space anyway.

**[Blend #25]: Always-Show Controls on Mobile**
_Concept:_ The trash icon and drag handle that appear on hover (desktop) are always visible on mobile. No gesture required, no new pattern — just the same controls, always present.
_Novelty:_ One responsive rule: desktop = hover-to-reveal, mobile = always-show. The controls are identical — only the trigger changes.

**[Blend #26]: Completion Is Reversible**
_Concept:_ Unchecking any item on a "complete" checklist removes the completion badge immediately. The state is purely derived from whether all items are checked — no separate toggle or confirmation.
_Novelty:_ Completion is a live calculation, not a committed state. Keeps the UX honest.

**[Blend #27]: Notes Expand Naturally**
_Concept:_ Long notes just grow the timeline. No truncation, no "show more." What you wrote is what's there.
_Novelty:_ Consistent with the "inert text block" mental model — notes don't have UI opinions about their own length.

**[Blend #28]: Empty Checklist Self-Destructs**
_Concept:_ Deleting all items from a checklist and clicking away causes the checklist to remove itself from the timeline automatically. No empty line item lingers.
_Novelty:_ Prevents orphaned UI elements. Creation and deletion are symmetric — a checklist without items has no reason to exist.

---

## Idea Organization and Prioritization

### Thematic Organization

**Theme 1: Type Architecture** _(foundational design decisions)_
- Checklists and notes are first-class primitives with no shared schema with events (#1, #2)
- Three clean types, no hybrids (#3)
- In-itinerary checklists are contextual; packing lists are a separate future feature (#11, #12)
- Icons: `MapPin` (event), `ListChecks` (checklist), `FileText` (note) (#10)

**Theme 2: Checklist Lifecycle** _(creation through completion)_
- Created with cursor in first item; title optional, items required (#20)
- Untitled checklist shows generic label: icon + item count (#21)
- "Add Title" placeholder visible above items when expanded (#23)
- Persistent "add new item" row always at bottom; no item reordering (#14)
- Items stay in place with strikethrough when checked (#17)
- Progress counter (X/Y) visible on collapsed line item (#16)
- All items checked → subtle animation → completion badge; reversible by unchecking (#4, #5, #26)
- Manually collapsible at any time (#8, #9)
- Empty checklist (all items deleted + click away) self-destructs (#28)

**Theme 3: Note Design** _(purposefully minimal)_
- Scoped to in-trip reminders only (#6)
- Fully inert: read it, edit it, that's it. No state, no lifecycle (#7)
- No title, no collapse — renders as a full text block on the timeline (#22)
- Long notes just expand the timeline naturally (#27)

**Theme 4: Interactions & Controls** _(create, edit, delete)_
- Inline editing everywhere: note content, checklist title, checklist items (#13)
- Desktop: `+` on hover between items + at day bottom → mini type picker (#18, #19)
- Desktop: trash + drag handle reveal on hover, same as existing events (#15)

**Theme 5: Mobile Patterns** _(touch adaptations)_
- Always-visible `+` in left gutter between items replaces hover insert (#24)
- Always-visible trash icon and drag handle (#25)

### Breakthrough Concept

Notes rendered as full inline text blocks (not contained line items) — a genuinely different visual treatment that makes the three types instantly distinguishable at a glance without reading the icon.

### Future Backlog Item Surfaced

**Packing List feature:** Reusable, trip-level, template-able lists. Separate feature, not a variant of in-itinerary checklists. Keep this distinct from the contextual checklist scope defined here.

---

## Session Summary

**28 ideas generated** across 3 techniques (SCAMPER, Cross-Pollination, Concept Blending)

**Key decisions made:**
- All three item types share the existing timeline ordering index — no new positioning logic needed
- Notes are visually and behaviorally minimal: inline text block, no title, no state, no collapse
- Checklists have a full lifecycle: creation → progress → completion → collapse, with animation
- Icons are settled: `MapPin`, `ListChecks`, `FileText`
- Mobile adaptation: always-show controls, gutter `+` for insert
- Creation flow: hover/gutter `+` → inline type picker → immediate edit mode

**Scope boundaries confirmed:**
- No hybrid item types
- No item reordering within checklists
- No type filtering view
- No pre/post-trip note use — journal is a future feature
- No packing list functionality — separate future feature
