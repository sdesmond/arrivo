# Architecture Review

Assess the structural decisions in the plan against Arrivo's architecture invariants. Flag anything that would require significant rework post-implementation. Grep the codebase to verify whether utilities, types, or components already exist before flagging duplication.

## Project Architecture Context

**Next.js App Router** — components are server by default. `"use client"` belongs only on components that need browser APIs, event handlers, `useState`, or `useEffect`. Data fetching belongs in server components or Route Handlers, not in client component `useEffect` hooks.

**Canonical utilities** (import from `@/lib/utils`, do not reimplement):

- `cn()` — className merging
- `isEventPast(event)` — boolean
- `isEventNow(event)` — boolean

**Types** — all domain types live in `src/data/types.ts`. New types must go there, not in component files or separate type files.

**Derived state invariant** — this is an explicit, enforced project rule: trip status (active/upcoming/past), event ordering, and any value computable from existing data must be derived at render time, never stored. Violating this is always BLOCKING.

## What to Assess

**Server vs. client component decisions**

- Client (`"use client"`) is correct when: event handlers, `useState`, `useEffect`, browser APIs, client-only libraries.
- Server is correct when: data fetching, static rendering, no interactivity.
- Flag a component described as fetching data asynchronously that's also marked client, or one with `onClick` handlers that doesn't note it needs `"use client"`.

**Derived vs. stored state**

- Flag any proposal to store: trip status (active/upcoming/past), event ordering, "is past"/"is now"/"is upcoming" flags, or any value computable from the canonical data in `types.ts`.
- These must be computed at render time — this is non-negotiable. Always BLOCKING.

**Prop drilling depth**

- Data passing through more than 2 intermediate components without context or colocation warrants a WARNING.

**Utilities reuse**

- If the plan describes implementing date comparison, className merging, or event status logic inline, flag it and cite the existing utility.
- Grep `src/lib/utils.ts` to confirm what exists before flagging.

**Types placement**

- New domain types must go in `src/data/types.ts`. Flag plans proposing local type definitions in component files or new separate type files.

**Over-engineering**

- Flag new abstractions (custom hooks, HOCs, context providers, helper modules) not required by the task. The bar: used in 3+ places immediately, or complexity without it is demonstrably worse. Flag generic utilities created for a single use case.

**State scope**

- State should live as close to where it's used as possible. Flag state lifted to a parent or global context when only one child consumes it.

## Output Format

```
ARCHITECTURE REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Check name]: [finding]
  Severity: BLOCKING / WARNING
  Location: [component or section of plan]
  Suggested Fix: [concrete change — e.g., "Remove the `status` field from state. Compute it inline: `const status = getStatus(trip.startDate, trip.endDate)`. The `getStatus` utility is already in src/lib/utils.ts." or "Move Trip type to src/data/types.ts."]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCKING: N  |  WARNINGS: M
```

BLOCKING: wrong server/client decision, stored computed state (invariant violation), types outside `src/data/types.ts`, reimplementing an existing utility.
WARNING: potential prop drilling, state lifted higher than needed, unjustified abstraction.

If the architecture looks sound: "No architecture issues found."
