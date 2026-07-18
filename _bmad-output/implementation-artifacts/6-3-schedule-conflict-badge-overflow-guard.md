# Story 6.3: Schedule Conflict badge overflow guard, viewport-tested

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a traveler with an unusually high number of schedule conflicts in one day,
I want the Schedule Conflict badge to stay readable on narrow viewports,
so that a pathological conflict count doesn't visually break the day card layout.

## Acceptance Criteria

1. **Given** the Schedule Conflict badge at its ordinary count range (e.g. "2 tight connections today"), **when** rendered on any supported viewport width, **then** the full text remains visible, untruncated — the prior `maxWidth`+`truncate` attempt (reverted after live testing showed it clipped this exact case, natural width ~187px vs. a guessed 180px cap) must not regress.
2. **Given** a real browser at a narrow viewport (≤390px), not a guessed pixel budget, **when** measuring the badge's natural rendered width across a range of conflict counts, **then** an actual overflow threshold — or the absence of one — is determined from observed geometry, not assumption.
3. **Given** a pathological conflict count that would exceed available width, **when** rendered, **then** the badge degrades gracefully (wraps, truncates with an accessible full-text alternative, or switches to a compact numeral form) without clipping mid-word or breaking the day card's layout.
4. **And** the fix is verified with real viewport-width browser testing (e.g. Playwright resize), not jsdom class-string assertions alone — the verification method and measured numbers are recorded in the story's Completion Notes.

## Tasks / Subtasks

- [ ] **Task 1: Measure real geometry before writing any fix code** (AC: #2) — do this first, the rest of the story depends on the answer
  - Read `src/components/packt/schedule-conflict-badge.tsx` (47 lines) and `src/components/packt/day-route-strip.tsx` (110 lines) in full first. The badge renders inside `DayRouteStrip`'s flex row: `<div className="ml-auto shrink-0"><ScheduleConflictBadge .../></div>` (day-route-strip.tsx:99-107) — the badge wrapper is `shrink-0` (never compressed by flexbox) while the route-summary text next to it is `flex-1 truncate` (lines 79-90, 91-98), meaning the *summary text* absorbs width pressure first, not the badge. This matters: the badge may not actually be at risk of flex-driven clipping the way the reverted `maxWidth` attempt assumed — the real question is whether the badge's own natural width can ever exceed the row's total available width even after the summary text truncates to near-zero.
  - [ ] Use Playwright (this repo has `mcp__playwright__*` browser tools available, or use the project's E2E Playwright setup directly) to render a trip day with a Day Route Strip and a Schedule Conflict badge at realistic-to-pathological conflict counts — at minimum: 1, 2 ("2 tight connections today" — the reference case, ~187px natural width per the deferred note), 5, 10, and 20 (there is no enforced max-events-per-day cap in this codebase, so a day with 20+ located items and every adjacent pair conflicting is a real, if extreme, reachable state — not a fabricated scenario).
  - [ ] Resize the browser to 375px and 390px width (the two narrowest widths this project explicitly targets — see `packt-plan-reviewer`'s 44×44px mobile floor and this codebase's `≤390px` convention from the Epic 5/spec-4-2 mobile verification work) and measure: the badge's actual rendered width at each count, the row's total available width at that viewport, and whether the badge visually overflows the day card's right edge or wraps awkwardly.
  - [ ] Record the measured numbers in this story's Completion Notes before proceeding to Task 2 — do not guess a pixel threshold the way the reverted attempt did. If measurement shows no realistic count actually overflows the row (e.g., because the summary text's `truncate` reliably yields enough room), that is a valid finding — document it and skip to Task 4 with a "no code change needed, verified via measurement" note, matching how the mobile-layout deferred item in Story 4.2's review was resolved (verified, no regression, no fix required).
- [ ] **Task 2: Implement the degradation strategy the measurement calls for** (AC: #1, #3) — only if Task 1 found a real overflow case
  - [ ] Do not reintroduce the reverted `maxWidth` + `truncate` combination without a measured, count-aware threshold — the prior attempt's failure mode was a single static cap applied uniformly regardless of actual count, which clipped the common 2-conflict case. Any new threshold must be derived from Task 1's measurements and must not regress AC #1's reference case.
  - [ ] Consider options in this order of preference, informed by what Task 1 actually found: (a) allow the badge to wrap to a second line within its `ml-auto shrink-0` wrapper rather than clipping — simplest, no information loss; (b) switch to a compact numeral form ("12 conflicts" or similar) only past a measured count threshold, keeping the full phrase for ordinary counts; (c) truncate with an accessible full-text alternative (the component already has an `sr-only` announcement span for screen readers at lines 18-23,42 — extend that pattern rather than inventing a new one) only as a last resort, since AC #1 explicitly forbids truncating the ordinary case.
  - [ ] `ScheduleConflictBadgeProps` and the component's accessibility behavior (aria-live, sr-only announcement) are otherwise correct and already tested — do not change the `count`/`conflictingEventNames`/`onClick` prop shape unless the chosen degradation strategy genuinely requires it.
- [ ] **Task 3: Confirm the fix against the flex context, not the badge in isolation** (AC: #1, #3)
  - [ ] Re-run the same Playwright measurement from Task 1 against the fixed component, inside `DayRouteStrip`'s real flex layout (not the badge alone) at 375px/390px — the reverted attempt's mistake was validated against a pixel budget, not the actual sibling-element context. Confirm the ordinary "2 tight connections today" case still renders at full width, and the pathological case (Task 1's chosen worst-case count) no longer clips or breaks the row.
- [ ] **Task 4: Tests** (AC: #1, #3, #4)
  - [ ] `src/components/packt/schedule-conflict-badge.test.tsx` (53 lines, exists — extend): add cases for whatever degradation behavior Task 2 implements (e.g., a high count renders the compact form / wraps / truncates-with-sr-only-text per the chosen strategy), plus a regression case asserting the ordinary low-count case still renders full, untruncated text. jsdom class-string assertions are acceptable *here* for logic/prop-branch coverage (e.g., "renders compact form when count > threshold") — they are not a substitute for Task 1/3's real-browser geometry verification, only a complement to it.
  - [ ] `src/components/packt/day-route-strip.test.tsx` (exists, has existing conflict-badge tests at lines 67-129 — extend if the fix changes how `DayRouteStrip` passes props to `ScheduleConflictBadge`, otherwise no change needed here).
  - [ ] Record in Completion Notes: the Task 1/3 measured numbers, which degradation strategy was chosen and why, and confirmation that AC #1's reference case was re-verified post-fix.

## Dev Notes

- **This story is measurement-gated, not implementation-gated.** The previous attempt at this exact fix failed specifically because it skipped Task 1's measurement step and went straight to a guessed pixel cap. Do not repeat that mistake — if Task 1's real numbers show no fix is needed, that is a complete and successful outcome for this story, not a shortcut.
- **The flex layout already does load-bearing work.** `day-route-strip.tsx`'s `flex-1 truncate` on the summary text (not the badge) means the badge is the *last* thing to lose width in the row today. Verify this assumption holds under measurement rather than assuming the badge is the vulnerable element — Task 1 exists to test this, not confirm it.
- **Reuse the existing `sr-only` accessibility pattern** (`schedule-conflict-badge.tsx:18-23,42`) if the chosen degradation strategy involves any visual truncation — do not invent a second accessible-text mechanism alongside it.
- **No backend/data changes.** This is a pure presentation-layer fix; `ScheduleConflict`/`conflictCount` computation in `route.ts` and `route-actions.ts` is untouched and out of scope.

### Project Structure Notes

- No new files expected (Task 2 may add a small internal formatting helper *inside* `schedule-conflict-badge.tsx` if the compact-numeral-form option is chosen — keep it local to the component, do not create a new `src/lib/` utility for a single-consumer format function).
- Edits, scope bounded by Task 1's findings:
  - `src/components/packt/schedule-conflict-badge.tsx` (MODIFY, conditionally — only if Task 1 finds a real overflow case)
  - `src/components/packt/schedule-conflict-badge.test.tsx` (MODIFY)
  - `src/components/packt/day-route-strip.test.tsx` (MODIFY, only if prop passing changes)

### References

- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — "Deferred from: code review of spec-4-2-conflict-badge-in-route-strip (2026-07-16)" — original finding, including the specific reverted-attempt numbers (187px natural vs. 180px guessed cap) reused verbatim in this story's AC #1.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 6: Route Reliability & Data Integrity] — Story 6.3 acceptance criteria (this file's ACs are copied from there).
- [Source: src/components/packt/schedule-conflict-badge.tsx] — component under test, current state has no overflow guard (the reverted attempt left no trace in the current file).
- [Source: src/components/packt/day-route-strip.tsx:57-110] — the real flex context the badge renders inside; the `shrink-0`/`flex-1 truncate` split between badge and summary text.
- [Source: src/components/packt/schedule-conflict-badge.test.tsx] — existing test file to extend.
- [Source: src/components/packt/day-route-strip.test.tsx:67-129] — existing conflict-badge integration tests to extend if needed.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
