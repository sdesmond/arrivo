---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'UI pattern consistency for event detail fields (time, cost, location, attachments)'
session_goals: 'Determine if multiple interaction patterns are justified; if not, crown a single winner'
selected_approach: 'progressive-flow'
techniques_used: ['Question Storming', 'Five Whys + Assumption Reversal', 'Six Thinking Hats', 'Decision Tree Mapping']
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Spencer
**Date:** 2026-05-17

## Session Overview

**Topic:** UI pattern consistency for event detail fields (time, cost, location, attachments)
**Goals:** Determine if multiple interaction patterns are justified; if not, crown a single winner

### Session Setup

Currently: time uses an inline popover near the "Add Time" button; cost, location, and attachments use a modal dialog with background blur. The question: is there a principled reason for the difference, and if not, which pattern wins?

## Technique Selection

**Approach:** Progressive Technique Flow

- **Phase 1 - Question Storming:** Generate all questions worth asking before forming opinions
- **Phase 2 - Five Whys + Assumption Reversal:** Find why patterns diverged, challenge if reasons hold
- **Phase 3 - Six Thinking Hats:** Evaluate candidate patterns from all angles
- **Phase 4 - Decision Tree Mapping:** Map verdict to concrete implementation path

---

## Phase 1: Question Storming — Key Findings

**About the data:**
- All four fields add metadata to an event; all can be revisited
- Location: least likely to change. Time: may be rescheduled. Cost: pretty constant. Docs: added progressively (confirmation docs, etc.)
- Location and time are typically set immediately upon creating an event; docs are often added later or not at all

**About the interaction moment:**
- The blur/modal pattern is useful — "they clicked the button, they must want to do the thing"
- No "peek without committing" use case exists: values display inline on the event card, so there's no reason to open the editing UI without intending to edit
- Create and edit interactions should use the same pattern
- Fields don't need a lot of real estate — just enough for the required inputs

**About the pattern:**
- The popover for time was never intentionally specified — it was Claude's initial implementation decision, never reviewed
- The popover clips off-screen; it anchors to the "Add Time" button and doesn't respond to viewport constraints
- Docs will eventually need a dialog: drop zone for file upload, list of existing filenames/previews to prevent duplicates
- If cost and location expand (more fields, sub-options), they'll need more space too
- Migration from popover → dialog is not a large lift

---

## Phase 2: Five Whys + Assumption Reversal

**Why does time use a popover?**
1. Claude implemented it that way
2. No explicit design spec existed
3. Assumption: "simple field = lightweight UI"
4. Popovers feel contextual — they anchor to what you clicked
5. Belief that modals carry unnecessary weight for a small form

**Root assumption:** Simple inputs deserve lighter patterns than modals

**Inversion:** Simplicity is actually an argument FOR a modal. A single-field form in a centered modal has almost no friction. The "weight" of a modal is visual presence, not effort. A broken, clipping popover has *more* friction than a modal.

**Why do cost/location/attachments use modals?**
1. Built that way
2. Modal communicates focus and intent (blur = "stop and do this")
3. The user clicked a button — they committed to the action
4. Modal = appropriate commitment device when there's no "peek" use case

**Root assumption:** Modal is right when the user has already committed to the action

**Inversion check:** Does this commitment logic fail for any of the four fields? No — values show inline, there's no reason to open the editing UI without intent to edit. This assumption holds equally for all four fields.

**Verdict from Phase 2:** The popover for time survives on no principled reason. Every argument — commitment, viewport safety, expansion headroom, create/edit parity — points toward modal for all four fields.

---

## Phase 3: Six Thinking Hats

**White Hat (Facts):**
- All four fields are metadata on an event
- All four have planned expansion that would outgrow a popover
- Three already use modals; one uses a broken popover
- Docs will need drop zone + file list — definitely modal
- Current modals are mostly single-field

**Yellow Hat (Benefits of unified modal):**
- Consistent user expectation: "Add X" always produces the same interaction type
- Future-proof: when any field expands, the container is already right
- Fixes the viewport clipping bug without engineering a smart-positioning popover
- Simpler codebase: one pattern, one component, one test surface

**Black Hat (Risks):**
- A modal for a single field might feel heavy — raised as a concern
- Rapid sequential editing (location → time → cost) means multiple modal open/close cycles

**Red Hat (Gut feel):**
- The familiarity and consistency of one pattern overrides the "feels heavy" concern for simple fields

**Green Hat (Creative — third options explored):**
- Inline editing: rejected, adds complexity with no clear benefit
- Bottom sheet / drawer on mobile: strongly appealing — native mobile pattern, thumb-zone action area
- Responsive pattern (modal desktop, drawer mobile): supported by existing app precedent

**Key finding from Green Hat:** The user doesn't need to see the event card while editing — at most, the event title in the dialog header provides sufficient context. The app already differentiates patterns by viewport.

**Blue Hat (Process):** Modal on desktop, bottom drawer on mobile. Consistent with existing app patterns.

---

## Phase 4: Decision Tree — The Verdict

```
User taps "Add/Edit" on any event field
         │
         ├── Desktop → Centered modal dialog
         │              Header: event title (context anchor)
         │              Size: standard (time / cost / location)
         │                     large (docs: drop zone + file list)
         │
         └── Mobile  → Bottom drawer
                        Header: event title
                        Same field content as modal
```

**No popovers. No field-specific patterns. One interaction model, two viewport presentations.**

### What was ruled out and why

| Option | Ruled out because |
|---|---|
| Popovers | Never intentional, clips off-screen, no justification survives scrutiny |
| Hybrid (popover for simple, modal for complex) | No principled field property justifies the split |
| Inline editing | Adds complexity with no clear benefit over modal |
| Single pattern regardless of viewport | App already differentiates; drawer is the native mobile feel |

---

## Implementation Path

1. **Fix time first** — actively broken (clips off-screen); replace popover with modal/drawer pattern
2. **Audit cost, location, attachments** — confirm they all use the same modal component, consolidate if not
3. **Add event title to all dialog/drawer headers** — context anchor for which event is being edited
4. **Designate docs as large-format** — size the dialog to accommodate drop zone + file list even before file upload is built
5. **Mobile bottom drawer** — implement the drawer variant and wire the responsive switch
