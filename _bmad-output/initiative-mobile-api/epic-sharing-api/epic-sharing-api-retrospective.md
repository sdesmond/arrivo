---
epic: epic-sharing-api
date: 2026-11-18
verdict: accepted-with-open-items
criteria: declared
headless: false
---

# Collaboration through the API retrospective

## Epic summary

Interactive review at `09916cb9`; no going-in concerns. All seven entries in `tickets.toml` are built, state review: 4.1 invite, 4.2 contributor changes, 4.3 accept/decline, 4.4 invitation lifecycle, 4.5 leave, 4.6 refactor, 4.7 integrated verification. All are finished under this workflow; `pending_tickets` is empty. No ticket status changed here.

Evidence: epic Done when and S1–S8, initiative R3/R7, ticket records, seven plans and review logs, commits and diffs, previous retrospective and `deferred-work.md`. No story files were pulled. Session logs were not located; process analysis cannot establish causes beyond the plans. Architecture context is `docs/plans/mobile-api.md` and the initiative. A full dependency graph and exhaustive duplication analysis were not run; conclusions below are scoped to changed sharing modules and plan evidence.

`git_evidence.py` measured the ranges below; all merges on each first-parent spine were measured and no binary revisions appeared in the per-file records. Each end is the next baseline; the final end is inferred at the epic's last merge, current HEAD. Merge first-parent counts restate merged changes and are not added to non-merge churn.

| Ticket | Range | Commits including merge |
| --- | --- | --- |
| 4.1 | `d2e352c6..0cca1870` | 2 |
| 4.2 | `0cca1870..9ca251e8` | 6 |
| 4.3 | `9ca251e8..955eb18b` | 5 |
| 4.4 | `955eb18b..d8bcd867` | 2 |
| 4.5 | `d8bcd867..aed0f2c8` | 5 |
| 4.6 | `aed0f2c8..5dc2b2d1` | 2 |
| 4.7 | `5dc2b2d1..09916cb9` | 3 |

## Findings

### Aggregate views and specification

- **Architecture:** Sharing moved from action modules to contracts, API routes and `src/lib/services/sharing.ts`; the 4.7 plan's evidence map lists S1–S8 and audits retired exports. The range has no schema, migration, example environment or Dockerfile change. This is a scoped import and diff inspection, not a cycle analysis. Disposition: accept as-is; prevention: none.
- **Size and duplication:** `sharing.ts` is 556 lines and `membership-writes.ts` 506 lines. Several operations share transaction, lock and replay orchestration; size alone does not establish a god class. The 4.6 plan removed an unused resend alias while retaining wrappers for tests. No broad duplication scan was performed. Disposition: accept as-is; prevention: revisit cohesion when adding operations.
- **F1 — Membership protection:** `src/lib/membership-writes.ts:219–233` upserts invitation data including `isCreator: false` over an existing membership. If membership is created after an invitation but before acceptance, its role and creator flag can be overwritten. This inherited issue is tracked in `deferred-work.md` under 4.3 and conflicts with preserving role boundaries. Disposition: fix now; prevention: test existing membership in lifecycle transitions.
- **F2 — Invite identity race:** `src/lib/services/sharing.ts:120–125` resolves a username before locking; the later locked account check does not recheck the name. A concurrent rename or reassignment can target an unintended account. Existing behavior, tracked in `deferred-work.md` under 4.1. Disposition: fix now; prevention: revalidate user-facing identifiers under the write lock.
- **F3 — Aborted transaction:** `src/lib/membership-writes.ts:171–187` catches a PostgreSQL unique violation inside the transaction; the transaction is already aborted. Cooperating invitation writers are serialized, so reachability depends on another conflicting writer. Tracked under 4.1 in `deferred-work.md`. Disposition: defer pending a real conflict reproduction; prevention: use conflict-safe insertion or a savepoint.

### Diff review: adversarial, edge cases and verification gaps

Fresh `bmad-review` lenses inspected the staged code diff `d2e352c6..09916cb9`, weighting ticket boundaries. Independent reports were checked against source; F1–F3 consolidate overlapping adversarial findings.

- **F4 — Production concurrency path untested by real-lock scenarios:** `tests/e2e/steps/deletion-concurrency.steps.ts:135,160,176` calls writer wrappers, while production acceptance and contributor changes enter `src/lib/services/sharing.ts:250,347` and perform transaction, lock and replay orchestration there. Service tests mock transaction/locks (`sharing.test.ts:527,782`). Existing deferred-work entries track these gaps. Disposition: fix now; prevention: move concurrency fixtures when extracting writers into services.
- **F5 — Lost invitation decision response:** `src/components/arrivo/pending-invitations-list.tsx:42–64` calls the client without a stable idempotency key. If acceptance commits but the response is lost, retry encounters the already-decided invitation rather than replaying success and navigation. The API supports keyed replay; this is a resilience gap, not an established regression from the old action. Disposition: defer pending product decision; prevention: specify lost-response behavior for client mutations.

## Behavior verification

This run built the production app and exercised `A manager invites an existing user to the trip` through the sharing dialog and reload: the scenario and authentication setup passed (2 tests). The first attempted filter matched no tests and exercised nothing. Story 4.7 records a separate production build and run of API, trip-sharing, pending-invitations and leave-trip: 633 passed, zero failed, after correcting the storage root (`story-verify-collaboration-api-end-to-end-plan.md:95`). Its checklist leaves the final validator unchecked and Verification lists expected commands without actual results; no final validator PASS is evidenced there. Story 4.6 records lint, types, build, coverage and 8 affected scenarios passing. Story 4.4 records no validator PASS after its affected selection requested the full suite. These do not establish a final gate pass.

## Previous-retro follow-through

Source: `epic-documents-covers-api-retrospective.md`, Action items and carried items.

- A-1 cover orphan record, developer: landed, `deferred-work.md:136–138`.
- A-2 anonymous API client, developer: landed, `deferred-work.md:158–160`.
- A-3 blank-first-item case, verification author: landed, `tests/e2e/features/api.feature:78` and `tests/e2e/steps/api.steps.ts:686`.
- A-4 document delete/retry, developer: landed and later changed to a deletion record, `deferred-work.md:110–114`.
- A-5 full E2E before merging toward main, user: no evidence found of a user-run full suite or integration into main.
- A-6 close previous epic through bmad-ticket, user: no evidence found; current status reports its tickets built/review.
- Process lesson, verification author: 4.7 records a full selected-set rerun after correcting the storage root (`story-verify-collaboration-api-end-to-end-plan.md:95`); applicability to a post-run harness code fix was not tested.
- Optional split, developer: no evidence found of a split; `api.feature` continues to collect API cases.
- Carried prior A-2 checklist-item retry: landed, `deferred-work.md:18–20`; prior A-5 blank item and A-6 full regression are addressed above. Other previously carried items were already reported landed or closed in the previous retrospective.

## Action items

The five original proposals were approved and applied in `../plan-epic-4-retrospective-remediation.md`, Tasks & Acceptance and Verification. Their historical findings remain above. One open action remains:

1. **Developer:** investigate whether a real non-cooperating invitation writer can trigger F3; reproduce the conflict before choosing a conflict-safe insert or savepoint. Deferred and tracked in `../deferred-work.md` under 4.1.

Process lessons retained: test protected membership across lifecycle transitions, revalidate user-facing identifiers under the write lock, exercise concurrency through production entry points, and record the final validator result in the plan.

## Decision records

Approved: manager invitation resend/dismiss supplies a trip ID for locked authorization, allowing deleted-row replay while concealing cross-trip IDs. Story 4.4 Design Notes and commit `285a82df`; recorded in `docs/decisions/adr-authorize-invitation-replay-by-trip.md`. Shared API replay and access status decisions already have ADRs under `docs/decisions/`.

## Acceptance verdict

**accepted-with-open-items** against declared criteria, based on the remediation working tree assessed at follow-up. All seven tickets were `built` / `review` at that assessment, with no unfinished tickets under this workflow; they were subsequently marked done on closure. Story 4.7 records broad production-flow success; the remediation plan records a further production E2E run and the final validator. F1, F2, F4 and F5 are addressed as detailed below. F3 remains deferred and tracked; its reachability requires a conflicting non-cooperating writer. This is a machine assessment, not a human override.

The original assessment at `09916cb9` was **rejected**: F1 and F2 were unresolved, with real-lock service coverage and final validator evidence also open. That historical assessment is retained here; the current evidence supersedes it for the frontmatter verdict.

### Remediation follow-up

- **F1 resolved:** `src/lib/membership-writes.ts` preserves an existing collaborator on invitation acceptance; the remediation plan records service and API coverage of role and creator preservation.
- **F2 resolved:** `src/lib/services/sharing.ts` rechecks the resolved account and normalized username under lock, after replay handling. The plan records a real-lock rename test and authorized replay after rename.
- **F4 resolved:** `tests/e2e/features/deletion-concurrency.feature` and `tests/e2e/deletion-http-fixture.ts` exercise production HTTP/service paths under real deletion contention. The plan records both lock orders and authorization cases.
- **F5 resolved within approved scope:** `src/components/arrivo/pending-invitations-list.tsx` retains decision-specific replay keys through uncertain failures and retries while mounted. The plan records lost accept and decline response E2E cases. Recovery across unmount or reload remains outside the approved scope.
- **Final gate passed:** `../plan-epic-4-retrospective-remediation.md`, Verification, records lint, TypeScript and production build passing; coverage passed 8,139 tests (98.12% lines, 97.82% functions, 94.06% branches), and affected production E2E passed 786 tests. Its targeted combined production E2E run passed 40 tests. The original manual sharing-dialog behavior check remains recorded above; no additional manual exercise was performed for this follow-up.

## Open questions

- Determine whether a conflicting non-cooperating invitation writer can trigger F3.
- Story 4.7's own final validator result remains unevidenced; the later remediation gate passed on the current working tree.
- The previous retrospective's user-run full E2E and epic-closure actions still have no evidence of completion here.
