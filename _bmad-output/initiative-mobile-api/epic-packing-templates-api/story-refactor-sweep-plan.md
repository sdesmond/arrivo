---
title: "Packing template refactor sweep"
type: refactor
ticket: 6
created: 2026-11-22
status: done
baseline_revision: "c48db44e539a1eed2e0fd6618c8bfadfcb9b5503"
route: full
route_source: auto
risk: medium
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Five template API stories left review findings needing evidence and disposition. A failed editor rename also leaves an unhandled promise rejection.

**Approach:** Resolve the editor rejection and audit each recorded finding against current behavior, recording evidence and any remaining follow-up without changing public API contracts.

## Boundaries & Constraints

**Always:** Work on `story/6-6-refactor-sweep`, based on latest `feature/api-v1`; PR base is `feature/api-v1`. Preserve API responses, accepted inputs, ownership and replay safety. Test first. Record a disposition for every epic 6 deferred finding.

**Never:** Change API validation or reorder semantics to resolve a finding; weaken deleted/recreated resource replay protection; assert facts about deployed data without evidence; commit to the integration branch or target main.

## I/O & Edge-Case Matrix

| Scenario | Input / state | Expected behavior |
| --- | --- | --- |
| Failed rename | Rename callback rejects on Enter or blur | Rejection handled; existing error notification remains; original title remains visible |
| Successful rename | Rename callback resolves | Existing refresh and title behavior preserved |
| Deferred findings | Existing evidence insufficient or fix changes public contract | Record the evidence and specific outstanding follow-up instead of claiming resolution |

</frozen-after-approval>

## Code Map

- `src/components/arrivo/template-editor-view.tsx` invokes `commitTitleEdit` with `void` on Enter and blur; `onRenameTemplate` rejects on API failure. `src/app/(app)/packing/[templateId]/page-client.tsx` uses `useApiMutation`, which already displays errors.
- `src/components/arrivo/template-editor-view.test.tsx` covers inline title editing; extend existing tests for rejected and successful callbacks and keyboard/blur behavior.
- `_bmad-output/initiative-mobile-api/deferred-work.md` contains six epic 6 entries: review-bot comment-only false positive, nullable timestamps on replay, rename rejection, cross-section anchors, noncanonical order rendering, and large reorder transaction limit. The story 6.3 review mentions the timestamp twice; it is one finding.
- `src/lib/services/packing-templates.ts` fails closed on null creation timestamps to protect replay identity. `src/db/schema.ts` permits null; absence of deployed nulls is unproven.
- `src/lib/services/packing-template-items.ts` accepts an anchor from a different section and updates reordered items individually; `template-editor-view.tsx` and its item-list components determine rendered grouping. Investigate and document observed behavior without restricting currently accepted inputs.
- `tests/e2e/feature-map.mjs` maps template routes and services to their affected features; verify coverage remains intact. Review bot finding concerns `scripts/pr-review` and comment-only source edits, outside runtime.

## Tasks & Acceptance

**Execution:**

- [x] `src/components/arrivo/template-editor-view.test.tsx` — first add rejection tests for Enter and blur, checking original title and no unhandled rejection, plus existing successful rename behavior.
- [x] `src/components/arrivo/template-editor-view.tsx` — handle callback failure without duplicating the existing error toast or changing successful behavior.
- [x] `_bmad-output/initiative-mobile-api/deferred-work.md` — append evidence-backed dispositions to all six entries. Trace actual grouped rendering for interleaved order; assess large reorder using a reproducible representative-size test or document why measurement cannot establish a supported limit. Preserve unresolved items with concrete next steps.
- [x] `tests/e2e/feature-map.mjs` — verify existing mapping for touched runtime source and document the result; update mapping only if genuinely missing.

**Acceptance Criteria:**

- Given a failed template rename, when the user commits by Enter or blur, then the original title remains, the existing error feedback appears, and no unhandled rejection occurs.
- Given the six deferred review findings, when the sweep ends, then each has a recorded disposition supported by current code or reproducible evidence, including explicit remaining work where unresolved.
- Given existing API clients, when they use template operations, then existing accepted inputs, responses and ownership protections remain unchanged.

## Implementation Notes

`template-editor-view.tsx` is already mapped to `@feat:template-items` in `tests/e2e/feature-map.mjs`; `node scripts/affected-e2e.mjs --format=scope` confirms that scope. No mapping change needed.

## Plan Change Log

## Review Triage Log

- false — Catch silently hides unreported errors: the sole production callback uses the mutation hook, which reports ordinary failures and routes authentication loss; no alternative production caller was found.
- false — Rejection test does not establish handling: Vitest reports unhandled rejections and both tests failed before the catch; separate real-hook test verifies feedback.
- low, rejected — Editor and mutation hook are tested separately rather than as a single integration; both sides of the callback contract are exercised and an additional integration harness adds complexity for negligible risk.
- false — Validation omitted from plan: validation was pending during review and completed before closing; results recorded below.
- Intent alignment: code trace and explicit follow-up provide evidence without claiming a deployed-data or transaction-limit measurement; no API contract changed.

## Verification

- `npx vitest run src/components/arrivo/template-editor-view.test.tsx` — targeted component tests pass.
- The two rejection cases produced unhandled rejections before the fix; all 20 tests pass afterward. `git diff --check` passes.
- Run any targeted checks needed to substantiate recorded findings; run `build-validator` once after targeted tests pass, including affected E2E.

- Validation: lint, TypeScript, production build, coverage (98.07% lines, 97.65% functions, 94.15% branches), and affected E2E (11 passed) passed. Targeted editor and client tests: 34 passed.
