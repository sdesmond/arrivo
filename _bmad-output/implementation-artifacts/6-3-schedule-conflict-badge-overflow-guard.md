---
baseline_commit: 7166d3865349396b4ad2e299784d393d0177cbdf
---

# Story 6.3: Schedule Conflict badge overflow guard, viewport-tested

Status: review

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

- [x] **Task 1: Measure real geometry before writing any fix code** (AC: #2) — do this first, the rest of the story depends on the answer
  - Read `src/components/packt/schedule-conflict-badge.tsx` (47 lines) and `src/components/packt/day-route-strip.tsx` (110 lines) in full first. The badge renders inside `DayRouteStrip`'s flex row: `<div className="ml-auto shrink-0"><ScheduleConflictBadge .../></div>` (day-route-strip.tsx:99-107) — the badge wrapper is `shrink-0` (never compressed by flexbox) while the route-summary text next to it is `flex-1 truncate` (lines 79-90, 91-98), meaning the *summary text* absorbs width pressure first, not the badge. This matters: the badge may not actually be at risk of flex-driven clipping the way the reverted `maxWidth` attempt assumed — the real question is whether the badge's own natural width can ever exceed the row's total available width even after the summary text truncates to near-zero.
  - [x] Use Playwright (this repo has `mcp__playwright__*` browser tools available, or use the project's E2E Playwright setup directly) to render a trip day with a Day Route Strip and a Schedule Conflict badge at realistic-to-pathological conflict counts — at minimum: 1, 2 ("2 tight connections today" — the reference case, ~187px natural width per the deferred note), 5, 10, and 20 (there is no enforced max-events-per-day cap in this codebase, so a day with 20+ located items and every adjacent pair conflicting is a real, if extreme, reachable state — not a fabricated scenario).
  - [x] Resize the browser to 375px and 390px width (the two narrowest widths this project explicitly targets — see `packt-plan-reviewer`'s 44×44px mobile floor and this codebase's `≤390px` convention from the Epic 5/spec-4-2 mobile verification work) and measure: the badge's actual rendered width at each count, the row's total available width at that viewport, and whether the badge visually overflows the day card's right edge or wraps awkwardly.
  - [x] Record the measured numbers in this story's Completion Notes before proceeding to Task 2 — do not guess a pixel threshold the way the reverted attempt did. If measurement shows no realistic count actually overflows the row (e.g., because the summary text's `truncate` reliably yields enough room), that is a valid finding — document it and skip to Task 4 with a "no code change needed, verified via measurement" note, matching how the mobile-layout deferred item in Story 4.2's review was resolved (verified, no regression, no fix required).
- [x] **Task 2: Implement the degradation strategy the measurement calls for** (AC: #1, #3) — only if Task 1 found a real overflow case
  - [x] N/A — Task 1's measurement found no real overflow case at any reachable conflict count (see Completion Notes). Do not reintroduce the reverted `maxWidth` + `truncate` combination without a measured, count-aware threshold — the prior attempt's failure mode was a single static cap applied uniformly regardless of actual count, which clipped the common 2-conflict case.
  - [x] N/A — no degradation strategy needed; `ScheduleConflictBadge` is unchanged.
  - [x] Confirmed: `ScheduleConflictBadgeProps` and prop shape (`count`/`conflictingEventNames`/`onClick`) are unchanged.
- [x] **Task 3: Confirm the fix against the flex context, not the badge in isolation** (AC: #1, #3)
  - [x] Task 1's measurement was already run inside the real flex context (day-card border → `DayCardBody`'s `p-3` → `DayRouteStrip`'s `my-3 flex items-center gap-3` row → `ml-auto shrink-0` badge wrapper), not the badge in isolation, at both 375px and 390px. The ordinary "2 tight connections today" case rendered at full width (187px, matching the deferred note's cited number exactly), and even a 6-digit pathological count (999,999 — far beyond any reachable event count) never crossed the day card's outer border. No further confirmation pass was needed since no code changed.
- [x] **Task 4: Tests** (AC: #1, #3, #4)
  - [x] `src/components/packt/schedule-conflict-badge.test.tsx` (extended): added a regression test asserting the full, untruncated phrase renders even at a pathological count (999,999), locking in that no truncation/compact-form logic exists by design. Existing low-count tests (singular/plural copy) already cover AC #1's reference case.
  - [x] `src/components/packt/day-route-strip.test.tsx` — no change; the fix did not alter how `DayRouteStrip` passes props to `ScheduleConflictBadge` (no fix was needed).
  - [x] Recorded in Completion Notes: the Task 1/3 measured numbers, the "no code change needed" verdict and why, and confirmation that AC #1's reference case was verified.

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

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Real-browser measurement via `mcp__playwright__*` tools against a temporary, non-routed-in-production harness (`src/app/dev-measure-harness/page.tsx`, created and deleted within this session — not in the final diff) that rendered `DayRouteStrip` inside the exact production DOM chain: day-card border wrapper → `DayCardBody`'s `p-3` → `DayRouteStrip`'s `my-3 flex items-center gap-3` row → `ml-auto shrink-0` badge wrapper.
- Verified against the running dev server on `http://localhost:3000` (an already-running `next dev` instance, PID 12768).

### Completion Notes List

- **Verification method**: Playwright `browser_resize` + `browser_evaluate` (`getBoundingClientRect`) against the real component tree described above, not jsdom class-string assertions. Measured at viewport widths 375px and 390px.
- **Measured numbers (375px viewport, badge natural width via `getBoundingClientRect`)**:
  | Conflict count | Badge width (px) | Crosses day-card border? | Slack before border (px) |
  |---|---|---|---|
  | 1 | 178 | No | 27.6 |
  | 2 (AC #1 reference case) | **187** (matches the deferred note's cited ~187px exactly) | No | 27.6 |
  | 5 | 187 | No | 27.6 |
  | 10 | 192 | No | 27.6 |
  | 20 | 195 | No | 27.6 |
  | 50 | 196 | No | 27.6 |
  | 99 | 195 | No | 27.6 |
  | 150 | 200 | No | 27.6 |
  | 999 | 202 | No | 27.6 |
  | 9,999 | 210 | No | 22.33 |
  | 99,999 | 218 | No | 14.74 |
  | 999,999 | 225 | No | 7.15 |

  At 390px, the same range showed strictly more slack at every count (e.g. still 22.35px of slack remaining even at 999,999).
- **Finding**: the badge (`ml-auto shrink-0`) never overflows the day card's outer border at any tested count, including six-digit counts that are not reachable through real user behavior (there is no realistic path to hundreds of thousands of same-day schedule conflicts). This is because the adjacent route-summary text (`flex-1 truncate`, `min-w-0`) absorbs width pressure first and can compress arbitrarily close to zero, so the badge — which never shrinks — only ever eats into that text's space and the row's own internal padding, never the card's border. Screenshot confirmation at 375px showed the summary text truncating progressively (e.g. `"1.3..."` → `"1..."`) while the full badge phrase (`"N tight connections today"`) always rendered untruncated.
- **Verdict: no code change needed.** `schedule-conflict-badge.tsx` and `day-route-strip.tsx` are unmodified. This matches the story's explicitly-sanctioned outcome (Dev Notes: "if Task 1's real numbers show no fix is needed, that is a complete and successful outcome"), consistent with how the Story 4.2 mobile-layout deferred item was resolved.
- **AC #1 reference case** ("2 tight connections today") re-confirmed at both 375px and 390px: renders at full width (187px), untruncated, no regression from the reverted `maxWidth`+`truncate` attempt (which is absent from the current codebase).
- Added one regression test (`schedule-conflict-badge.test.tsx`) locking in that the full, untruncated phrase renders even at a pathological count, so a future change can't silently reintroduce truncation without a test failure.

### File List

- `src/components/packt/schedule-conflict-badge.test.tsx` (MODIFY) — added pathological-count regression test

## Change Log

- 2026-07-19: Measured real badge geometry via Playwright at 375px/390px across conflict counts 1–999,999 inside the actual `DayCardBody`/`DayRouteStrip` flex context; found the badge never crosses the day card's border at any reachable count, so no production code change was required. Added a regression test to lock in the untruncated-text behavior.
