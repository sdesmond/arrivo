---
title: "Template API follow-ups"
type: refactor
ticket: ""
created: 2026-11-22
status: built
baseline_revision: "f8a20a24a57b9da4282ea39e031cf5c354965fc6"
route: full
route_source: auto
risk: medium
review: "thorough"
review_source: "auto"
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Template API review left uncertainty about nullable replay identities, ordering semantics, large reorder performance, and a review-bot false positive.

**Approach:** Investigate and document timestamp impact; preserve and test existing ordering contracts; benchmark reorder behavior; fix comment-only review classification.

## Boundaries & Constraints

**Always:** Use branch `story/template-api-follow-ups`; PR base `feature/api-v1`. Preserve public API inputs, responses, ownership, idempotency and stale-order protections. Use isolated scenario-owned data for measurements. Report external deployment counts as unknown unless actually observed. Tests precede runtime edits.

**Never:** Change deployed data or schema based on unverified null counts; weaken deleted/recreated resource replay protection; infer a universal reorder limit from one environment; silently exempt uncertain source changes from review-bot test checks.

## I/O & Edge-Case Matrix

| Scenario | Input / state | Expected behavior |
| --- | --- | --- |
| Replay identity | Template timestamp null, or ID deleted and recreated | Replay fails closed; no other user's data is exposed |
| Section position | Target section differs from same-template anchor | Existing flat anchor position and requested membership remain accepted; editor groups by membership |
| Interleaved order | Valid full ordering with interleaved sections | API persists flat sequence; editor groups under correct headings |
| Reorder size | Isolated real Postgres, various item counts | Report elapsed times and deadline/rollback results with environment, without claiming a universal limit |
| Review bot | TS/TSX comment-only edit | Matching test not required when both full versions prove tokens unchanged |
| Review bot | Code plus comments, uncertain parse, missing versions, add/delete, or comment syntax inside strings | Existing conservative test check applies; secret detection unchanged |

</frozen-after-approval>

## Code Map

- `src/lib/services/packing-templates.ts`, `src/db/schema.ts`: nullable creation timestamps; replay validation rejects null and protects resource incarnation. `src/lib/services/packing-templates.test.ts` tests existing replay paths.
- `src/lib/services/packing-template-items.ts`: create validates label and anchor independently; reorder stores input positions with membership, stale-order and ownership checks. `src/lib/services/packing-template-items.test.ts` covers service operations.
- `src/components/arrivo/packing-sort-utils.ts` groups by label and sorts by position. `src/components/arrivo/packing-sort-utils.test.ts` covers grouping. `tests/e2e/features/template-items.feature`, `tests/e2e/steps/template-items.steps.ts`, and `tests/e2e/steps/api-packing-templates.steps.ts` provide scenario-owned API/UI coverage.
- `docs/api-v1.md` promises same-template before/after anchors. Preserve it and clarify flat order versus grouped display.
- `scripts/pr-review/checks.mjs`, `scripts/pr-review/review.mjs`: checks inspect diff only; comment-only classification requires complete before/after source. `scripts/affected-e2e.mjs` illustrates retrieving versions but emitted JS equality also removes types, so cannot prove comment-only edits. Compare non-comment TypeScript tokens and parsed syntax trees, including newline-sensitive automatic semicolon insertion; fail closed on parse errors, missing or ambiguous source. Obtain base/head by exact PR commits with safe argument arrays; preserve secret scan on full diff.
- `src/lib/request-deadline.ts`: server deadline; `tests/e2e/e2e-seed-data.ts` and `tests/e2e/scenario-fixture.ts` show isolated fixture practices. Never truncate or benchmark a deployment DB.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/services/packing-templates.test.ts` — add null-current and null-recorded replay tests for create, save-list and rename; retain deleted/recreated checks. Document read-only `SELECT count(*) FROM packing_templates WHERE created_at IS NULL` for each deployment in `_bmad-output/initiative-mobile-api/deferred-work.md`; report unavailable deployments and unresolved replay/backfill implications, without claiming counts.
- [x] `src/lib/services/packing-template-items.test.ts`, `src/components/arrivo/packing-sort-utils.test.ts` — test cross-section anchor, interleaved persisted positions and grouping. Add API-to-editor scenario to `tests/e2e/features/template-items.feature` and `tests/e2e/steps/template-items.steps.ts` / `tests/e2e/steps/api-packing-templates.steps.ts` using scenario-owned fixtures. Update `docs/api-v1.md` to explain exact flat ordering and grouping; do not restrict existing clients.
- [x] `scripts/benchmark-template-reorder.mjs` and `scripts/benchmark-template-reorder.test.mjs` — add opt-in, guarded real-Postgres benchmark using a dedicated disposable database and owned fixture cleanup. Measure repeated all-changed reorders at multiple sizes, recording counts, timing distribution, deadline and rollback outcomes; refuse unconfirmed or non-isolated targets. Run locally if the disposable database is available; record environment and observed limits in `_bmad-output/initiative-mobile-api/deferred-work.md`, or exact blocker and reproducible command if unavailable. Do not change service implementation without measurements supporting it.
- [x] `scripts/pr-review/checks.test.mjs`, `scripts/pr-review/review.test.mjs` first — cover line/block comment edits, mixed code, strings/template literals, multiline tokens, newline-sensitive semicolon insertion, type-only edits, missing versions, additions/deletions, secret detection. Then update `scripts/pr-review/checks.mjs` and `scripts/pr-review/review.mjs` to fetch complete versions by immutable PR base/head and prove comment-only changes conservatively; unavailable source falls back to current checks. Keep existing output and non-comment behavior.
- [x] `_bmad-output/initiative-mobile-api/deferred-work.md` — update the five findings with measured evidence, decisions and outstanding follow-up. Retain unresolved deployment-specific facts and benchmark constraints.

**Acceptance Criteria:**

- Given API clients using existing accepted ordering inputs, when they create or reorder items, then contract and ownership behavior remain unchanged and documentation explains editor grouping.
- Given unavailable deployment data or benchmark conditions, when the sweep ends, then the results distinguish observed facts from outstanding verification and provide actionable next steps.
- Given a review-bot run, when complete source versions establish only comments changed, then the tests check passes without masking actual code changes or secret findings.

## Implementation Notes

## Plan Change Log

## Review Triage Log

- Blind: merge-base mismatch — medium, fixed; compare diff and source now use the same merge base.
- Blind: JSX pragmas — medium, fixed; changed directives no longer qualify as comment-only.
- Blind: triple-slash directives — medium, fixed by directive comparison.
- Blind: build annotations — medium, fixed by conservative directive handling.
- Blind: deadline may precede writes — medium, fixed with observed update-trigger execution before deadline.
- Blind: forced deadline not asserted — medium, fixed by asserting deadline and rollback.
- Blind: supposedly interleaved service fixture was grouped — medium, fixed with interleaved memberships.
- Edge: merge-base mismatch — medium, same verified issue and fix as blind review.
- Edge: compiler directives — medium, same verified issue and fix as blind review.
- Verification: source retrieval lacked main-level tests — medium, fixed with controlled retrieval and fallback coverage.
- Verification: JSX directives — medium, same verified issue and fix as blind review.
- Intent: deployment inventory and production-latency measurements remain unavailable; documented explicitly. API-to-editor coverage verifies ordering; anchor behavior is covered at service layer.

## Verification

Targeted: 213 tests passed; benchmark exercised real PostgreSQL with observed update and verified deadline rollback. Validation: lint, TypeScript, build, coverage (8,359 tests), and affected E2E (707 scenarios) passed. First coverage run had an unrelated focus failure; isolated retry and full coverage rerun passed.


- Run targeted Vitest service and grouping files, targeted review-bot and benchmark tests, and the affected template-items E2E scenario before broad validation.
- Run `build-validator` once after targeted checks; lint, typecheck, production build, coverage and affected E2E must pass.
