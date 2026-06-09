---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: "Zero-day itinerary UX for new unscheduled trips and trips whose days were all removed"
session_goals: "Converge on one implementation-ready flow for creating a day without dates, adding itinerary content to it, and assigning dates later"
selected_approach: "ai-recommended"
techniques_used: ["Question Storming", "Assumption Reversal", "Superposition Collapse"]
ideas_generated: 15
context_file: ""
session_continued: true
continuation_date: 2026-06-09T06:25:26.0225791-06:00
technique_execution_complete: true
session_active: false
workflow_completed: true
---

# Brainstorming Session Results

**Facilitator:** Spenc
**Date:** 2026-06-08T20:39:11.0314280-06:00

## Session Overview

**Topic:** Zero-day itinerary UX for new unscheduled trips and trips whose days were all removed
**Goals:** Converge on one implementation-ready flow for creating a day without dates, adding itinerary content to it, and assigning dates later

### Session Setup

Focus is limited to the zero-day itinerary state in two cases: a brand-new trip with no dates and a trip that previously had scheduled days but now has none. The intended outcome is a single recommended flow that resolves the current empty-state mismatch and can move directly toward implementation.

## Technique Selection

**Approach:** AI-Recommended Techniques
**Analysis Context:** Zero-day itinerary UX with a focus on converging on one implementation-ready flow

**Recommended Techniques:**

- **Question Storming:** Clarifies what the first user action should actually create before the UI is redesigned.
- **Assumption Reversal:** Flips the current day-after-content mental model to explore stronger alternatives.
- **Superposition Collapse:** Narrows multiple plausible flows into one chosen implementation direction.

**AI Rationale:** The current issue is a mental-model mismatch, not just weak empty-state copy. This sequence starts by identifying the right core object, then challenges the inherited assumptions, then forces a clear decision.

## Technique Execution Results

**Question Storming:**

**[Category #1]**: Blank Planning Container
_Concept_: In the zero-day state, the user's first need is not “add an event” or even necessarily “add a dated day,” but to create a lightweight planning container they can fill in before dates exist. This reframes the empty state around starting a planning structure first and scheduling it later.
_Novelty_: This treats the empty state as a structural setup problem instead of a content-entry problem, which is the opposite of the current implementation.

**[Category #2]**: Dateless Day, Not Placeholder Object
_Concept_: The planning container should still be called a day from the beginning because travelers think in trip days even before dates are known. The system can support “Day 1” without a calendar date and allow dates to be assigned later without renaming the concept.
_Novelty_: This preserves the user's natural mental model while avoiding a second temporary object type that would add conceptual overhead.

**[Category #3]**: Single Structural CTA
_Concept_: In the zero-day state, the primary action should simply be `Add Day`. Event, note, and checklist creation should remain part of the existing per-day UI and only become available after a day exists.
_Novelty_: This removes the current dead-end action set and makes the first step structurally valid instead of asking users to place content into a nonexistent container.

**[Category #4]**: Immediate Expanded Day 1
_Concept_: After tapping `Add Day`, the interface should render `Day 1` immediately in the same expanded form used for scheduled trips so planning can begin without mode-switching. The only meaningful difference is that the day has no date yet.
_Novelty_: This reuses the familiar itinerary UI instead of introducing a special empty-day editor, keeping the interaction model stable while only changing the date state.

**[Category #5]**: Order-First Day Model
_Concept_: If users need to move one full day and all of its contents to a different slot, then day order must be an editable planning primitive and dates should flow from that order rather than locking the order in place. A moved day should carry its events, notes, and checklists intact while surrounding days renumber and, when scheduled, re-date automatically.
_Novelty_: This turns the itinerary into a reorderable sequence of trip days instead of a static date ledger, which better matches how travelers refine plans over time.

**[Category #6]**: Reordering Must Be Designed In
_Concept_: Even if day reordering does not ship in the exact same implementation slice as the zero-day flow, the flow and data model must be planned around it now so dateless days, scheduled days, numbering, and date assignment all remain compatible. The UX chosen for empty-state creation cannot assume day order is fixed forever.
_Novelty_: This prevents a near-term UX fix from hardening the wrong structural assumptions and creating a second round of redesign when reordering arrives.

**[Category #7]**: Guided Scheduling, Not Freeform Dates
_Concept_: Users should not casually assign arbitrary standalone dates to individual days because that invites accidental gaps, huge jumps, and incoherent itineraries. Scheduling should be guided by trip-level dates or heavily constrained logic rather than open-ended per-day date entry.
_Novelty_: This protects itinerary integrity by making dates a controlled projection of trip structure instead of raw editable fields.

**[Category #8]**: Date-Range Expansion Needs Mapping Rules
_Concept_: When a trip grows from three days to five, the product needs a deterministic rule for where the existing three planned days stay and where the two new blank days appear. Without that rule, trip-level scheduling becomes ambiguous and can feel destructive even when no data is actually lost.
_Novelty_: This surfaces trip-length change as a content-mapping problem, not just a metadata edit.

**[Category #9]**: Preserve Existing Planned Start
_Concept_: If a trip’s date range expands earlier, the existing first planned day should remain anchored as the first planned day rather than being pushed forward by prepended blank days. Additional trip length should be created after the planned itinerary instead of before it.
_Novelty_: This prioritizes preservation of the user’s authored sequence over strict calendar-slot purity, reducing surprise when a trip becomes longer at the front.

**[Category #10]**: Day 1 Anchor, End-Only Growth and Shrink
_Concept_: Any trip date change should preserve the itinerary from Day 1 forward, shift dates across the existing ordered days, and only add or remove day slots at the end of the itinerary. Existing shortening logic for trimmed days can continue to handle cases where planned content falls beyond the new trip length.
_Novelty_: This unifies date expansion, date contraction, dateless planning, and future reordering under one simple mental model instead of separate special-case rules.

**[Category #11]**: Day Labels Stay Ordinal Until Scheduled
_Concept_: Dateless itinerary cards should be titled `Day 1`, `Day 2`, and so on, with no per-day date picker. Scheduling is exposed through a trip-level `Set trip dates` CTA, while dated trips can continue showing calendar dates in the day header as they do today.
_Novelty_: This keeps the planning UI legible and consistent while separating day identity from date assignment.

**[Category #12]**: Shared Scheduling CTA Above the Itinerary
_Concept_: The strongest placement for `Set trip dates` is a prominent trip-level action above the itinerary rather than embedding it inside each day card or hiding it only in existing trip metadata controls. A lighter supporting reminder can still live near the day list if needed, but the main action should read as applying to the whole itinerary.
_Novelty_: This reinforces that scheduling is a sequence-level action, not a property users tweak one day at a time.

**[Category #13]**: Collapsed Final Model Candidate
_Concept_: The converged model is a day-first, order-first itinerary where users create dateless days, fill them with normal content immediately, and schedule the whole ordered sequence later with a trip-level date action. Day identity is ordinal, dates are derived from sequence order, and future day reordering changes both numbering and projected dates together.
_Novelty_: This unifies empty-state creation, date assignment, trip-length changes, and future day movement into one consistent model instead of separate interaction paradigms.

**[Category #14]**: Longer Date Ranges Append Blank Days
_Concept_: When users schedule a dateless itinerary, the selected date range may be longer than the number of existing planned days. In that case, the current planned days keep their order from Day 1 forward and any extra trip length becomes new blank days appended at the end.
_Novelty_: This allows scheduling to stay flexible without forcing users to pad the itinerary manually before choosing dates.

**[Category #15]**: Explicit Trip-Level Scheduling Copy
_Concept_: The scheduling CTA should use the plain label `Set trip dates`. That wording is direct, familiar, and consistent with the trip-level mental model already established for assigning dates to the ordered itinerary.
_Novelty_: This avoids inventing new terminology like “schedule itinerary” when the core user task is simply setting the trip’s dates.

## Idea Organization and Prioritization

**Chosen Product Invariant:**
Every trip must always contain at least one day.

**Converged Flow:**

- New trip with dates: initialize days from the selected date range and keep the current scheduled behavior.
- New trip without dates: initialize with a pre-populated dateless `Day 1`.
- Add day behavior in undated trips: `Add Day` creates the next ordinal day directly (`Day 2`, `Day 3`, and so on) with no extra prompt.
- Zero-day state: eliminated entirely.
- Deletion rule: when a trip has only one remaining day, the delete icon does not appear on that day.
- Scheduling rule: when dates are added later, existing days map from `Day 1` forward and any extra range length appends blank days at the end.

**Why This Wins:**

- Removes the empty-state mismatch by keeping the itinerary structurally valid at all times.
- Preserves the user's mental model that trips are made of days, even before dates exist.
- Makes delete behavior deterministic and easier to understand than allowing a temporary zero-day state.

## Implementation-Ready UX Rules

### Product Invariant

- A trip must always contain at least one day.
- The product never renders a zero-day itinerary state.

### Trip Creation Rules

- If the user creates a trip with dates, initialize trip days from the chosen trip date range using the existing scheduled-trip behavior.
- If the user creates a trip without dates, initialize the itinerary with a single dateless `Day 1`.
- A newly created dateless `Day 1` uses the normal day UI so the user can immediately add itinerary content.

### Day Creation Rules

- In an undated trip, `Add Day` creates the next ordinal day directly: `Day 2`, `Day 3`, `Day 4`, and so on.
- Creating a new day does not prompt for a date.
- New undated days are appended to the end of the itinerary in ordinal order.

### Day Deletion Rules

- The delete icon appears on a day only when the trip contains more than one day.
- When a trip has exactly one day remaining, the delete icon is hidden on that day.
- Deleting a day renumbers remaining days in ordinal order.
- If the trip is dated, deleting a day also causes remaining day dates to reflow based on their new order.

### Scheduling Rules

- In an undated trip, day headers use ordinal labels only, such as `Day 1` and `Day 2`.
- The primary scheduling action is a trip-level `Set trip dates` CTA.
- The product does not require or encourage per-day date assignment in the undated state.
- When the user sets trip dates later, existing days map from `Day 1` forward in their current order.
- If the selected trip date range is longer than the existing number of days, additional blank days are appended at the end.
- If the selected trip date range is shorter than the existing number of days, shortening behavior should preserve the earliest authored days and handle overflow using the existing trim logic.

### Display Rules

- Undated days display ordinal labels with no calendar date in the day header.
- Dated trips continue to display calendar dates in day headers as they do today.
- The empty-state action set for zero-day itineraries is removed because the state no longer exists.

## Acceptance Criteria

1. Creating a trip without dates results in a trip that contains exactly one day labeled `Day 1`.
2. The initial `Day 1` in an undated trip is immediately usable for adding itinerary content without requiring date entry.
3. Creating a trip with dates results in the same day initialization behavior the product currently uses for scheduled trips.
4. A trip can never enter a state with zero days.
5. In an undated trip, selecting `Add Day` appends the next ordinal day with no intermediate prompt.
6. In any trip with more than one day, the delete icon is visible for each day.
7. In any trip with exactly one remaining day, the delete icon is not visible on that day.
8. Deleting a day renumbers the remaining days sequentially from `Day 1`.
9. In an undated trip, day headers do not show dates.
10. In an undated trip, a trip-level `Set trip dates` action is available to assign dates later.
11. Setting trip dates on an undated trip assigns dates across existing days from `Day 1` forward in order.
12. If the chosen date range is longer than the current number of days, the product appends blank days at the end to match the full range.
13. If the chosen date range matches the current number of days, the product assigns dates without changing day count or day order.
14. Dated trips continue to use the current date-display behavior in day headers.

## Action Plan

1. Replace the zero-day itinerary assumptions in creation and deletion flows with the invariant that a trip always has at least one day.
2. Initialize new undated trips with a persisted dateless `Day 1`.
3. Update day deletion UI and logic so the delete icon is hidden whenever only one day remains.
4. Ensure `Add Day` in undated trips appends the next ordinal day without a date prompt.
5. Confirm scheduling logic maps existing days from `Day 1` forward and appends blank days for extra date-range length.
6. Add or update tests for trip creation, last-day delete behavior, ordinal renumbering, and later date assignment.

## Session Summary and Outputs

- Final recommendation adopted: every trip always has at least one day.
- Implementation-ready artifact created: `spec-dateless-itinerary-day-invariant.md`
