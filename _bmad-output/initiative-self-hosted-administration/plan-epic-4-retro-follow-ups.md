---
title: "Close epic 4 retro follow-ups A5 and A6"
type: chore
ticket: ""
created: "2026-10-31"
status: done
risk: low
context: []
---

# Close epic 4 retro follow-ups A5 and A6

Source: `epic-recovery-and-deletion/epic-recovery-and-deletion-retrospective.md` actions A5 and A6, checked as not landed in `epic-instance-overview/epic-instance-overview-retrospective.md` (Previous-retro follow-through). A1–A4 landed.

No runtime behavior changes in A5. A6 changes runtime only if the user picks the guard option (Decision below).

## Intent

**Problem:** The default review is pinned to `quick` for every build, so full-route and `risk: high` work gets the lightest lens. Ticket 3.6's risk disagrees between its plan (`high`) and its entry (`medium`). The 4.1 plan has empty review metadata. Two Activity modules have no `server-only` guard.

**Approach:** Let the route pick the review instead of pinning quick. Reconcile the 3.6 risk. Make 4.1's metadata honest. Record a disposition for A6.

## Tasks

Tests: none to add or update. A5 is configuration and ticket-tree metadata with no runtime branch, and A6 under the recommended option changes no code. If the guard option is chosen, the tests named under A6 are written first.

### A5a — stop pinning quick as the default review

- Create `_bmad/custom/bmad-build.toml` (team override, committed):

  ```toml
  [workflow]
  review = "auto"
  ```

  The shipped default `review = "quick"` pins quick for every build (`review_source: pinned`), so the route never picks the review: in epic 5, tickets 5.1–5.6 were `route: full` and still ran `quick`. `auto` selects `thorough` for full routes and `quick` for oneshot routes. The user does not need `thorough` everywhere, only for quick not to be picked every time.

- Verify: `uv run _bmad/scripts/resolve_customization.py --skill .agents/skills/bmad-build --project-root . -k workflow` prints `review = "auto"`. A next full-route build plan then reads `review: thorough` and `review_source: auto`; a oneshot plan reads `review: quick` and `review_source: auto`.
- Do not edit `.agents/skills/bmad-build/customize.toml` (vendored default).

### A5b — ticket 3.6 risk

- `epic-account-onboarding/story-regenerate-link-and-expired-state-plan.md` says `risk: high`; entry 6 in `epic-account-onboarding/tickets.toml` says `risk = "medium"`. The plan records the risk the build ran under, so set the entry to `risk = "high"`.
- Verify: `tickets.py status epic-account-onboarding` shows ticket 3.6 `risk: high`.

### A5c — ticket 4.1 review metadata

- `epic-recovery-and-deletion/story-password-reset-tracer-plan.md:11-13` has `review: ""`, `review_source: ""`, `lenses_ran: []`, while its dated `## Code Review` (2026-10-29) records 3 patches, 2 deferrals and 4 rejections. The plan names no lens, so the lens cannot be reconstructed. Do not invent one: add one line to the plan's Implementation Notes saying a review ran on 2026-10-29 with the outcome above and the lens was not recorded, and leave the frontmatter fields empty.
- Verify: the note exists and cites the Code Review section; frontmatter unchanged.

### A6 — `server-only` on `activity-maintenance.ts` and `activity-retention.ts`

Findings from the import check:

- Importers in `src/` are server code only: `(app)/layout.tsx:12`, `admin/activity/page.tsx:8`, the page's `actions.ts`. The client component `activity-retention-settings.tsx` imports neither module.
- Playwright fixtures import both modules in plain Node: `tests/e2e/activity-integration-fixture.ts:4` and `tests/e2e/activity-retention-fixture.ts:13-14`. `server-only` throws outside Next's server runtime. `tests/e2e/steps/password-reset.steps.ts:25-41` works around this with an esbuild bundle that stubs the marker.

**Decision (recommended): accept without the guard.** No client consumer exists, and the guard would break two E2E fixtures unless each gets the same bundling workaround. Record that as the disposition in `deferred-work.md` and revisit if a client component starts importing either module.

**Option, if the user wants the guard:** add `import "server-only";` as line 1 of both files; in `tests/e2e/activity-integration-fixture.ts` and `tests/e2e/activity-retention-fixture.ts` load the modules through the password-reset bundling approach, or move `ACTIVITY_MAINTENANCE_LOCK` and the other constants the fixtures need into a module without the marker. Tests: `src/lib/activity-maintenance.ts` and `src/lib/activity-retention.ts` are covered files, so their colocated `src/lib/activity-maintenance.test.ts` and `src/lib/activity-retention.test.ts` are run before and after the edit and must stay green; `vitest.config.mts:14` aliases `server-only`, so a bare marker import adds no runtime branch to assert and no new case is written for it. If the shared constants move to a new module, that module gets its own colocated test and both existing tests are updated for the new import. Run the activity-retention affected E2E (`npm run test:e2e:affected`) before and after, since the fixtures are what the guard can break.

- Write the chosen disposition as a dated `Decision:` line, and mark the ledger row for epic-2 A3 / epic-3 A5 in `deferred-work.md` closed with that disposition.

## Verification

- A5a: resolver output above.
- A5b: `tickets.py status epic-account-onboarding` row for 3.6.
- A5c: plan note present, frontmatter untouched.
- A6: ledger row updated; under the guard option only, affected Playwright run (`npm run test:e2e:affected`) passes.
- Whole change: `tickets.py status` for the initiative reports no new `problems`.

## Boundaries

Always: edit only the files named above. Never: change the vendored `.agents/skills/bmad-build/customize.toml`; invent a lens for 4.1; touch epic 4's retrospective verdict (a separate decision).

## Notes

- Branch: not yet chosen; new development work needs the branch question asked first (project rule).
- Open: epic 4's retro verdict still reads rejected; whether its validator gate passed is unchecked and is not part of this plan.
