---
title: 'Tier 1 deferred bug fixes'
type: 'bugfix'
created: '2026-05-22'
status: 'complete'
baseline_commit: '72be76b6c672a22c3faca922956ee37bde37bf87'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Several pre-existing bugs and a11y gaps were deferred from earlier story reviews: `toHHMM`/`formatTime` can produce `"NaN:NaN PM"` on bad input; the doc-count disclosure button has no `aria-expanded`; cost values render without locale formatting; `@vercel/blob` is always dynamically imported despite no reason for lazy loading; `DocViewer` mounts its hooks for every document row even when closed; and `TripEvent.position` is typed optional while the DB column is `notNull`, allowing a `?? i` fallback in `day-card.tsx` that can collide with note/checklist positions.

**Approach:** Fix each item in its canonical location with a minimal, targeted change; update all affected test fixtures; mark the `getByText` step-file precision fix as already done.

## Boundaries & Constraints

**Always:**
- Use CSS custom properties for any colour values touched
- Keep `Intl.NumberFormat` locale-agnostic (no hardcoded currency symbol — DollarSign icon already serves that role)
- `toHHMM` return type stays `string` (callers expect a string; return `""` for invalid input and guard the consumer)
- `TripEvent.position` becomes required (`number`, not `number | undefined`) — update every test fixture that constructs a `TripEvent` literal without `position`
- Mapper orphan case (both `tripId` and `eventId` null) → throw `Error`, not silent fallback
- Static `@vercel/blob` import replaces all five dynamic `import("@vercel/blob")` calls in `actions.ts`; `fs/promises` and `path` dynamic imports are unrelated and stay dynamic

**Ask First:**
- If TypeScript errors appear in files not listed in the Code Map after making `position` required

**Never:**
- Add a currency symbol or hardcode "USD" to the cost formatter (trip currency context is not available in `PlaceRowActionBar`)
- Change `DocViewer`'s external API (`doc`, `open`, `onClose`, `finalFocusRef` props) — `finalFocusRef` stays on the interface (optional), just not passed from `doc-row.tsx`
- Modify E2E step definitions (the `getByText` fix is already in place)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid ISO to `toHHMM` | `"2026-05-13T10:30:00Z"` | `"10:30"` (or local time HH:MM) | — |
| Invalid string to `toHHMM` | `"not-a-date"` | `""` | No throw; empty string |
| Empty string to `toHHMM` | `""` | `""` | No throw |
| `formatTime` called with `""` | `""` (from bad `toHHMM`) | `"—"` | No throw |
| `formatTime` called with valid HH:MM | `"10:30"` | `"10:30 AM"` | — |
| Cost with large number | `p.cost = 1234567.89` | `"1,234,567.89"` | — |
| Orphan document in mapper | `{ tripId: null, eventId: null }` | throws `Error("Orphan document …")` | Caller must handle |
| `DocViewer` when `viewerOpen=false` | `viewerOpen` state is `false` | Component not in DOM; hooks not running | — |
| `DocViewer` closes | User dismisses viewer | `setViewerOpen(false)` fires, then `viewButtonRef.current?.focus()` | — |

</frozen-after-approval>

## Code Map

- `src/lib/utils.ts:74-77` — `toHHMM`: add `isNaN` guard, return `""` on invalid date
- `src/components/packt/place-row-action-bar.tsx:7-11` — `formatTime`: guard empty/NaN input, return `"—"`
- `src/components/packt/place-row-action-bar.tsx:87` — cost pill: replace `.toFixed(2)` with `Intl.NumberFormat`
- `src/components/packt/place-row-action-bar.tsx:91-112` — docs toggle button: add `aria-expanded`, `title`
- `src/app/(app)/trips/[tripId]/actions.ts:1-16` — hoist `@vercel/blob` to static import; remove 5× dynamic imports at lines 159, 187, 257, 411, 487; verify no `vi.mock("@vercel/blob")` exists in any test file that mocks this module differently
- `src/components/packt/doc-row.tsx:236` — wrap `<DocViewer>` with `{viewerOpen && ...}`; handle focus return in `onClose`; drop `finalFocusRef` from call site (prop stays on interface)
- `src/components/packt/doc-row.test.tsx` — add unit tests: (1) DocViewer absent from DOM when `viewerOpen=false`; (2) focus returns to view button after viewer closes
- `src/data/types.ts:232` — `TripEvent.position`: change `position?: number` → `position: number`
- `src/components/packt/day-card.tsx:127` — drop `?? i` fallback
- `src/lib/db-mappers.ts:73` — throw on orphan document (both FKs null)
- `src/lib/utils.test.ts` — add `toHHMM` invalid-input test cases
- `src/components/packt/place-row-action-bar.test.tsx` — add `aria-expanded` / formatting tests; add `position` to fixtures
- `src/components/packt/event-chip.test.tsx:38-43` — add `position: 0` to `baseEvent`
- `src/components/packt/day-ribbon.test.tsx:41-44` — add `position` to event fixtures
- `src/components/packt/now-card.test.tsx:46-49` — add `position` to `todayEvents` fixtures
- `src/components/packt/place-row.test.tsx:115-623` — add `position` to all `TripEvent` literals without it
- `src/components/packt/place-row-dialogs.test.tsx:86-90` — add `position` to `place` fixture
- `src/components/packt/trips-mobile-tabs.test.tsx:40,94` — add `position` to event fixtures
- `src/lib/db-mappers.test.ts` — create file; add orphan-document throw test for `dbDocToType`

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/utils.ts` -- guard `toHHMM`: if `isNaN(new Date(iso).getTime())` return `""` -- prevents `"NaN:NaN"` propagating to UI
- [x] `src/components/packt/place-row-action-bar.tsx` -- fix `formatTime` to return `"—"` when `h` or `m` is NaN; replace `p.cost.toFixed(2)` with `new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p.cost)`; add `aria-expanded={showDocs}` and `title="Show attached documents"` to the docs toggle button
- [x] `src/app/(app)/trips/[tripId]/actions.ts` -- add `import { del, put } from "@vercel/blob";` static import; remove all 5 dynamic `import("@vercel/blob")` expressions; leave `fs/promises` and `path` imports dynamic; grep test files for `vi.mock("@vercel/blob")` and update mock pattern if found
- [x] `src/components/packt/doc-row.tsx` -- wrap `<DocViewer>` with `{viewerOpen && <DocViewer doc={doc} open={true} onClose={() => { setViewerOpen(false); viewButtonRef.current?.focus(); }} />}`; remove `finalFocusRef` from the render call (keep prop on interface)
- [x] `src/components/packt/doc-row.test.tsx` -- add tests: (1) `DocViewer` not in DOM when `viewerOpen=false`; (2) view button receives focus after viewer closes
- [x] `src/data/types.ts` -- change `position?: number` to `position: number` on `TripEvent` (line 232)
- [x] `src/components/packt/day-card.tsx` -- change `position: e.position ?? i` to `position: e.position` (line 127)
- [x] `src/lib/db-mappers.ts` -- before returning the `scope` field, throw `new Error(\`Orphan document id=${row.id}: both tripId and eventId are null\`)` when `!row.tripId && !row.eventId`
- [x] `src/lib/utils.test.ts` -- add test cases: `toHHMM("not-a-date")` returns `""`, `toHHMM("")` returns `""`
- [x] `src/components/packt/place-row-action-bar.test.tsx` -- add tests: docs toggle has `aria-expanded="false"` when closed, `aria-expanded="true"` when open; cost displays formatted value; add `position: 0` to any fixture missing it
- [x] `src/components/packt/event-chip.test.tsx` -- add `position: 0` to `baseEvent`
- [x] `src/components/packt/day-ribbon.test.tsx` -- add `position: 0` / `position: 1` to events array fixtures
- [x] `src/components/packt/now-card.test.tsx` -- add `position: 0` / `position: 1` to `todayEvents` fixtures
- [x] `src/components/packt/place-row.test.tsx` -- add `position: 0` to `basePlace`; add `position: 1` to the `{ id: "ev-2", name: "Free Time" }` literal; add `position: 0` to all `draftPlace` literals and other `TripEvent` literals missing it
- [x] `src/components/packt/place-row-dialogs.test.tsx` -- add `position: 0` to `place` fixture
- [x] `src/components/packt/trips-mobile-tabs.test.tsx` -- add `position` to all `TripEvent` literals missing it
- [x] `src/lib/db-mappers.test.ts` -- create file; add test: `dbDocToType` throws when `tripId=null` and `eventId=null`; add passing test for normal event-scoped and trip-scoped rows

**Acceptance Criteria:**

- Given `toHHMM` is called with an invalid date string, when it runs, then it returns `""` and no `NaN` appears in the UI
- Given `formatTime("")` is called, when it runs, then it returns `"—"`
- Given a TripEvent with `cost: 1234567.89`, when the action bar renders, then the cost pill shows `"1,234,567.89"` (comma-separated, 2 decimal places)
- Given the docs toggle button renders with 2 docs and `showDocs=false`, when inspected, then `aria-expanded="false"` is present; after click, `aria-expanded="true"` is present; button has `title="Show attached documents"`
- Given `@vercel/blob` imports in `actions.ts`, when the file is inspected, then there are zero `await import("@vercel/blob")` expressions; there is one top-level static import
- Given `viewerOpen` is `false`, when `DocRow` renders, then no `DocViewer` is in the DOM and its hooks do not run
- Given `viewerOpen` is `true` and user closes the viewer, when `onClose` fires, then `viewerOpen` becomes `false` and focus returns to the view button
- Given TypeScript strict mode, when `position` is made required on `TripEvent`, then `npm run build` produces zero type errors
- Given a document row with both `tripId=null` and `eventId=null`, when `dbDocToType` is called, then it throws an `Error` containing the document id
- Given all tests run, when `npm test` and `npm run test:e2e` execute, then all pass

## Design Notes

**`formatTime` guard:** split `t` then check `isNaN(h)` — both `NaN` and `undefined` coerce to NaN via `Number()`:
```ts
function formatTime(t: string): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return "—";
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}
```

**DocViewer conditional render:** drop `finalFocusRef` prop from the call site; manage focus in `onClose` directly:
```tsx
{viewerOpen && (
  <DocViewer
    doc={doc}
    open={true}
    onClose={() => {
      setViewerOpen(false);
      viewButtonRef.current?.focus();
    }}
  />
)}
```

## Verification

**Commands:**
- `npm run build` -- expected: exits 0, zero TypeScript errors
- `npm test -- --run` -- expected: all unit tests pass
- `npm run test:e2e` -- expected: all E2E scenarios pass
