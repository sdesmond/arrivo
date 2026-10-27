---
title: "Integrated Activity and retention E2E suite"
type: "chore"
ticket: "10"
created: "2026-10-26"
status: "built"
baseline_revision: "a611232c9a29432cc01d999567ce5e13db3621a6"
route: "full"
route_source: "auto"
risk: "low"
review: "quick"
review_source: "pinned"
lenses_ran: ["quick"]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Individual stories verify producers and reader/retention behavior separately. Integrated evidence is missing for real merged edits through filters, identities surviving actual rename/deletion, recorder persistence failure, and saved policy before physical cleanup.

**Approach:** Extend existing Activity and retention Playwright features with scenario-owned integration cases on desktop and mobile; preserve existing producer and isolated PostgreSQL tests.

## Boundaries & Constraints

**Always:** Actual UI mutations for producer claims; mothers/materializers for users/trips; stable account-ID assertions; real timestamps; bounded polling for post-response work. Await mutation POST before navigation/reload. Faults affect only scenario actor; cleanup releases faults/locks even after failure. Reuse shared-policy restoration. Exercise accessible controls, keyboard confirmation/focus and contained mobile overflow.

**Never:** New event producers, production fault switches, migrations, global seeds, sleeps to simulate ten minutes, ordering tags, full-suite gate, or private values in Activity DOM/ARIA. Preserve existing runtime unless tests expose a scoped defect; any runtime fix requires matching tests first.

</frozen-after-approval>

## Code Map

- `tests/e2e/steps/instance-activity.steps.ts`: real note/expense/reservation mutations and account rename/delete steps; existing helpers poll persisted Activity and open filters. Their successful-write waits cannot be reused under injected write failure.
- `tests/e2e/steps/{profile,instance-users,account-menu}.steps.ts`: identity mutations, secondary admin, sign-in and route refusal. Reuse existing Gherkin steps.
- `tests/e2e/{scenario-fixture,activity-seed}.ts`: scenario-owned mothers and removable historical rows. Existing seeded reader fixtures do not prove actual identity transitions.
- `tests/e2e/activity-retention-fixture.ts`: isolated race tests and `holdSharedRetentionPolicy`; `src/lib/activity-maintenance.ts` owns schema-scoped maintenance lock. Reuse exact lock expression.
- `src/components/arrivo/activity-retention-settings.tsx`: save shows acknowledgment plus unavailable inspection; status refresh distinguishes pending from no expired rows. No UI changes planned.

## Tasks & Acceptance

**Execution:**

- [ ] `tests/e2e/features/instance-activity.feature` and `tests/e2e/features/activity-retention.feature`: author scenarios first. Add desktop/375px outlines for mixed real edits, recorder failure, and delayed cleanup. Extend actual rename/deletion and authority-loss scenarios rather than duplicating seeded coverage.
- [ ] `tests/e2e/activity-integration-fixture.ts`: add scoped DB fault/maintenance-lock helpers. Reject INSERT/UPDATE Activity for unique actor using uniquely named trigger/function; increment a scenario-owned PostgreSQL sequence before rejection to prove attempted recording despite rollback. Drop trigger/function/sequence and close connections on setup failure and teardown. Hold public maintenance lock only during pending-cleanup assertions; release before polling cleanup. No global recorder outage.
- [ ] `tests/e2e/steps/instance-activity.steps.ts`: combine real notes, expense and reservation; filter by current actor/action/date; reload and assert one ongoing start/end summary, safe persisted shape, no private text in DOM or accessible attributes. Verify underlying edits persist. Under fault, sign out/in and create/edit a trip using mutation-response waits independent of Activity success; verify primary DB/UI state after reload and missing failed Activity writes.
- [ ] Same steps: extend real rename then self-deletion flow with second admin. Filter stable actor ID after each transition; assert old/new event-time snapshots remain, no duplicate actor option, and deleted account remains filterable. Reuse actual producer rows, not manufactured history.
- [ ] `tests/e2e/steps/activity-retention.steps.ts`: seed removable 60-day history under saved 90-day policy. Hold maintenance lock, confirm/save 30, inspect pending state and readable expired row; release, request dynamic page, poll physical absence and refresh status. Failed shortening preserves 90, row and event count. After demotion, assert save/status denial, unchanged policy/event count and direct route refusal on reload.
- [ ] `tests/e2e/feature-map.mjs`: map integration helper to both existing feature tags. Keep existing batching coverage in targeted verification.

**Acceptance Criteria:**

- Given real edits on desktop/mobile, when actor/action/date filters and reload run, then one persisted ongoing summary covers edits and exposes only approved metadata.
- Given actual rename/deletion, when another admin filters retained actor ID, then historical snapshots stay accurate and filterable.
- Given recorder persistence failure, when sign-in and trip mutations run, then primary outcomes persist and attempted recording failure is proven without fabricated Activity success.
- Given saved shortening with cleanup blocked, when history/status are inspected then released, then saved policy precedes physical deletion and inspection reports observed state.
- Given failed save or lost authority, when actions and direct reload run, then no unauthorized policy/event change occurs and protected reads refuse access.

## Implementation Notes

- Added `tests/e2e/activity-integration-fixture.ts` (scoped trigger/function/sequence recorder fault; public maintenance-lock hold), registered in both feature entries of `tests/e2e/feature-map.mjs`.
- `instance-activity.feature`: desktop/375px outlines for mixed real edits and recorder failure; real rename + self-deletion scenario observed by a second admin.
- `activity-retention.feature`: failed shortening, desktop/375px blocked-cleanup outline, lost-authority scenario extended (status denial, unchanged policy/event count, direct route 404).
- No runtime code changed. Mobile sign-out uses focus+Enter because the dev mock-date toggle overlaps the tab bar.
- Actual runs (`node scripts/run-e2e.mjs --server=kill --grep=<tag>`; a `|` in `--grep` breaks under cmd.exe): `@feat:instance-activity` 32 passed; `@feat:activity-retention` 19 passed; `@feat:activity-batching` 12 passed. No retries. Earlier `npm run test:e2e:affected` ran the whole suite (359 passed, 6 failed: all in new scenarios, since fixed).

## Plan Change Log

## Review Triage Log

Quick lens run inline by the implementer (no subagent was launched; the session did not authorize one), reading the diff against the acceptance criteria and AGENTS.md rules.

| finding | verdict | evidence |
| --- | --- | --- |
| `.not.toContain("123.45")` over `page.content()` could match unrelated digits | low | ISO timestamps and UUIDs in the page cannot contain `123.45`; passed on desktop and mobile. Rejected: no everyday harm. |
| Second-admin session is not closed if the scenario fails before the After hook | false | `After` closes `OTHER_ADMIN_SESSION_KEY` context unconditionally. |
| Fault trigger could reject other accounts' writes | false | Trigger `WHEN (new.actor_id = '<uuid>')`; FK `ON DELETE SET NULL` updates carry a null actor and pass. |

## Verification

- `npm run test:e2e:affected -- --grep="@feat:(instance-activity|activity-retention|activity-batching)"`: targeted integration plus existing contracts pass; record actual counts, failures and retries.
- If affected selection excludes unchanged batching, run `node scripts/run-e2e.mjs --server=kill --grep="@feat:activity-batching"` separately.
- Parent runs `build-validator` after implementation/review and targeted pass: lint, types, coverage, build, affected E2E. No second Vitest process or automatic full E2E.
- Record verification and any remaining gaps here; no operator migration required for test-only work.

## Plan Review

Original request: build ticket 2.10, integrated Activity and retention E2E suite.

- Scope PASS: integration gaps only; existing producer coverage retained.
- Architecture PASS: scenario faults remain outside runtime; partial setup and teardown restore DB objects/connections.
- Component PASS: no component creation or modification.
- Accessibility PASS: tests use labeled controls, confirmation/focus and mobile overflow; inspect private DOM/ARIA values.
- Test coverage PASS: both existing feature/step pairs named; helper registered in affected map; actual recorder rejection observed through nontransactional sequence.
- Resolved before presentation: rollback would erase an ordinary rejection counter; use sequence. Explicitly run unchanged batching if affected scope excludes it. Zero remaining blocking findings or warnings.
