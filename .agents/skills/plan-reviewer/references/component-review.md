# Component Review

Assess every proposed component in the plan for sizing, placement, interface requirements, and reuse. Check existing files the plan touches for size before flagging proposed components — an already-oversized file is a blocker regardless of what gets added.

Grep both `src/components/` and `src/app/` to check for existing components before flagging duplication.

## Project Component Structure

```
src/components/arrivo/   ← domain components (trip/event/day data, business logic)
src/components/ui/      ← reusable primitives (no business logic, generic)
src/app/                ← route-level components (page.tsx, page-client.tsx, etc.)
```

The 250-line limit applies to all three. Route-level client components in `src/app/` are not exempt.

## What to Assess

**Existing file sizes — check first**

For every file the plan proposes to modify, read that file and count its lines. If it already exceeds ~250 lines of JSX, it is already too large and the plan must include a step to split it — before or alongside adding the new code. Suggest a logical split based on distinct UI regions or responsibilities visible in the file (e.g., desktop vs. mobile layout, header, individual tab views, sub-lists). Always BLOCKING.

**Component size and cohesion**

A component with more than 4 distinct responsibilities is too large. Any component described as rendering multiple unrelated UI regions in one (a header area, a list, and a modal together) needs splitting. If the description implies more than ~250 lines of JSX, it needs splitting.

**Reuse opportunities**

Grep for existing component names and patterns. If a proposed component closely duplicates an existing one, flag it as DUPLICATE and name the existing file. If a proposed component is generic enough to live in `ui/`, recommend that placement.

**File placement**

- Domain component (receives or renders trip/event/day data, calls domain utilities) → `src/components/arrivo/`
- Generic primitive (button, badge, dialog shell, list — no business logic) → `src/components/ui/`
- Flag misplacements.

**Props interface**

Every proposed component must plan for an explicit `ComponentNameProps` interface. Flag any component whose props are described inline or whose plan doesn't mention a typed interface.

**`"use client"` declaration**

Any component with event handlers, `useState`, `useEffect`, or browser APIs needs `"use client"` at the top. Flag if missing from interactive components.

## Output Format

Report existing file sizes first, then proposed components:

```
COMPONENT REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXISTING FILES

src/app/(app)/trips/page-client.tsx — 647 lines ✗ TOO LARGE
  Severity: BLOCKING
  Suggested Fix: Add a split step before the new feature work. Suggested breakdown:
    - Extract MobileActiveTab, MobileUpcomingTab → trips/components/mobile-tabs.tsx
    - Extract Topbar → trips/components/topbar.tsx

[repeat for each modified file over ~250 lines]

PROPOSED COMPONENTS

ComponentName
  Placement:   ✓ OK / ✗ WRONG — should be in arrivo/ not ui/ [or vice versa]
  Size:        ✓ OK / ✗ TOO LARGE — suggested split: [SubA, SubB]
  Interface:   ✓ OK / ✗ MISSING ComponentNameProps interface
  use client:  ✓ OK / ✗ MISSING — component has [onClick handlers / useState / etc.]
  Reuse:       ✓ OK / ✗ DUPLICATE of src/components/arrivo/existing.tsx
  Suggested Fix: [concrete change if any field above is ✗]

[repeat for each proposed component]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCKING: N  |  WARNINGS: M
```

BLOCKING: existing file already over ~250 lines, wrong placement, missing interface structure. WARNING: potential reuse opportunity, slight ambiguity in how to split.

If no component issues: "No component issues found."
