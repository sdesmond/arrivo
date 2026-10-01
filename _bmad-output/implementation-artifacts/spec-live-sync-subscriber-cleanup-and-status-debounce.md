---
title: "Harden live-sync throwing-subscriber cleanup and status debounce"
type: "bugfix"
created: "2026-09-09"
status: "done"
baseline_commit: "321157c728df8b4e64a7c2eb484ad2eed996e92b"
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/project-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Two findings from the heartbeat-fanout-health-check review remain open:
`deliverToTripSubscribers`/`deliverToUserSubscribers` never deregister a subscriber whose callback
keeps throwing, so a permanently-broken connection re-warns on every heartbeat tick forever; and
`SyncStatusIndicator` only debounces the *first* transition into a problem state — once already
showing one, a flapping channel re-announces on every subsequent change with no settling window.

**Approach:** Deregister (not just log) a subscriber after its callback throws, mirroring how a
normal unsubscribe already cleans up. Extend `SyncStatusIndicator`'s existing `PROBLEM_GRACE_MS`
debounce to cover the already-showing-a-problem case too, not just the healthy→problem edge.

## Boundaries & Constraints

**Always:** Keep delivery isolation intact — one throwing subscriber must still never block delivery
to the rest in the same tick (already true; don't regress it while adding deregistration).

**Ask First:** A third, related finding — promoting the internal `"heartbeat"` string literal to a
`LiveSyncEventType` member — is explicitly **excluded** from this spec. `trip-events.ts:6-8`
documents this as a *deliberate* choice ("keep `src/data/types.ts` limited to real, typed events"),
not an oversight. Confirm with the user before touching it; this spec assumes it stays as-is.

**Never:** Change the wire format of a heartbeat frame, or the personal/trip topic map shapes.

</frozen-after-approval>

## Code Map

- `src/lib/trip-events.ts:55-83` — `deliverToTripSubscribers`/`deliverToUserSubscribers`: catch +
  `console.warn` + continue, subscriber stays registered and re-fails on every future tick.
- `src/lib/trip-events.ts:200-234` — `subscribeUser`/`removeTripSubscribersForUser` already show the
  unregister pattern (delete from Set, call `.close()`) to reuse for a throwing subscriber.
- `src/components/packt/sync-status-indicator.tsx:139-152` — `isAlreadyShowingProblem` branch skips
  `PROBLEM_GRACE_MS` entirely; only the first healthy→problem edge waits.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/trip-events.ts` -- on a caught delivery throw in `deliverToTripSubscribers`/
  `deliverToUserSubscribers`, deregister that subscriber (delete from its Set/topic, call its
  `close()`) in addition to the existing `console.warn`, reusing the same cleanup path
  `removeTripSubscribersForUser`/`subscribeUser`'s unsubscribe already use.
- [ ] `src/lib/trip-events.test.ts` -- add a case: a subscriber that throws is not invoked again on
  the next publish/heartbeat tick, and its topic entry is gone.
- [ ] `src/components/packt/sync-status-indicator.tsx` -- apply `PROBLEM_GRACE_MS` (or a shorter
  re-settle window) to a status *change* while already showing a problem, not only the initial
  transition into one.
- [ ] `src/components/packt/sync-status-indicator.test.tsx` -- add a case: rapid Reconnecting ↔
  Connected flapping while a problem is already displayed does not re-announce on every tick.

**Acceptance Criteria:**

- Given a subscriber whose callback throws once, when the next event or heartbeat publishes, then
  that subscriber is not invoked again and every other subscriber still receives the frame.
- Given the indicator is already showing a problem, when the connection flaps again within the
  grace window, then the displayed status and its announcement don't thrash on every transition.

## Verification

**Commands:**

- `npx vitest run src/lib/trip-events.test.ts src/components/packt/sync-status-indicator.test.tsx` -- expected: pass.
- `packt-build-validator` -- expected: lint, type check, coverage, build, affected E2E pass.
