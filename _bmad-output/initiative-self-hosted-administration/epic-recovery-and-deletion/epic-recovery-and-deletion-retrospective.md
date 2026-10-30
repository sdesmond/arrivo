---
epic: epic-recovery-and-deletion
date: 2026-10-30
verdict: rejected
criteria: declared
headless: false
---

# Recovery and deletion retrospective

## Epic summary

Epic 4 resolves to `epic-recovery-and-deletion`, covering CAP-5, CAP-6 and CAP-7. All seven tickets are done; no tickets remain built or unfinished (`pending_tickets: []`). Completeness was checked with `tickets.py status` and every entry read with `find`. Container closure is outside this retrospective.

| Ref | Ticket | State | Baseline range | Commits / merges / measured merges |
| --- | --- | --- | --- | --- |
| 4.1 | Password reset tracer | done | `298a53db..66a3ecd2` | 10 / 4 / 2 |
| 4.2 | Deletion concurrency and self-service | done | `66a3ecd2..c8449ab6` | 3 / 1 / 1 |
| 4.3 | Admin deletion and private succession | done | `c8449ab6..3e296391` | 5 / 1 / 1 |
| 4.4 | Admin recovery issuance service | done | `3e296391..c0d93b1f` | 4 / 1 / 1 |
| 4.5 | CLI recovery completion and cutover | done | `c0d93b1f..f8a41b26` | 8 / 1 / 1 |
| 4.6 | Refactor sweep | done | `f8a41b26..eac1acec` | 1 / 0 / 0 |
| 4.7 | Integrated recovery and deletion E2E suite | done | `eac1acec..4a26a28b` | 2 / 0 / 0 |

Ranges follow each plan's `baseline_revision` in history order. Final range ends at last epic implementation/evidence commit `4a26a28b`, inferred from subjects and plans, rather than audit-only HEAD `2791aa73`. Later `7fc401a8` and `2791aa73` completion-audit documentation was also read as current evidence. All runtime findings refer to current code, unchanged by those audit commits.

**Inventory:** epic file with declared Done when; seven entries and seven same-folder `story-*-plan.md` files; no separate story files (`find` returned null); initiative file; canonical spec's Capabilities section (initiative has no Requirements section); architecture spine; previous epic-3 retrospective; current runtime, tests, diffs and commit subjects. No PRD folder exists in this initiative. Session logs were unavailable: explanations of abandoned approaches and conversational process causes are not inferred.

`git_evidence.py` ran once per distinct range: 33 distinct commits, nine merges, seven measured merges, no binary revisions. Non-merge churn and merge-first-parent churn were inspected separately and never summed together. Two nested merges in 4.1 were unmeasured by the pre-pass; endpoint diff was also inspected, but merge-resolution attribution remains limited. Range 4.1 includes supporting validation/tooling and planning commits; range membership is provenance, not proof every line is recovery runtime.

Phase 2 used delegated aggregate analysis and independent `bmad-review` adversarial, edge-case-hunter and verification-gap lenses on unified diff `298a53db..4a26a28b`. Reports were rechecked against primary files; duplicate stale-session reports were consolidated below. No team discussion requested. User supplied no specific going-in concerns ("nothing specific").

## Findings

### F1. Revoked session can finish queued self-service deletion

**Lenses:** adversarial + verification-gap. **Instance disposition:** fix now (A1). **Prevention:** include already-authenticated mutations, not only future requests, in revocation acceptance matrices.

`src/app/(app)/profile/actions.ts:371–377` captures authenticated user before calling `deleteOwnAccount(db, userId, choices)`. Service locks singleton/account but reads no session version (`src/lib/account-deletion.ts:39–55`). Reset and recovery bump that version under lifecycle locks (`src/lib/password-reset.ts:29–35`; `src/lib/admin-recovery-completion.ts:103–111`), yet waiting deletion proceeds after revocation. Admin deletion already checks locked version (`account-deletion.ts:317–328`); security-action sweep does likewise (`profile/security-actions.ts:185–200`).

**Reproduced:** isolated real-Postgres fixture held lifecycle locks; started deletion so it blocked; completed actual `completePasswordReset` through same held transaction; committed reset; released queued deletion. Observed `resetCompleted: true`, then `queuedDeletionSucceeded: true`, `accountStillExists: false`. This probes service boundary representing request that passed `requireUser` before blocking; it does not replay browser action wire format. Recovery shares version/lock mechanism but this specific race was reproduced with reset only.

Verification gap confirmed by repo-wide `deleteOwnAccount`/import searches: profile adapter tests mock deletion and expect only DB/ID/choices (`profile/actions.test.ts:820–958`); self-service service tests cover choices and last-admin guard, not revoked sessions (`account-deletion.test.ts:175–386`). `password-reset.feature:38–67` covers password change, global sign-out and device-removal races. Integrated suite observes subsequent navigation, not pending self-deletion. All these tests can pass while F1 remains.

### F2. Deleted manager can still apply queued contributor changes

**Lens:** edge-case-hunter. **Instance disposition:** fix now (A2). **Prevention:** recheck actor membership/role after acquiring mutation lock.

Action checks manager access before entering writer (`src/app/(app)/trips/actions.ts:911–958`). Writer locks trip and reads current collaborators, but `myRow` may be absent or demoted; it only uses optional row ID to forbid self-edit (`src/lib/membership-writes.ts:249–280`). After account deletion removes manager's memberships, pending action can mutate surviving trip's other collaborators. No locked manager-authority assertion exists.

**Reproduced:** scenario-owned owner, manager, viewer and trip; deleted manager through actual `deleteOwnAccount`; invoked writer using previously captured actor ID to change viewer to editor. Observed `actorExists: false`, `remainingMemberRole: "editor"`. This reproduces post-precheck service state, not browser scheduling. Deleted actor is never authorized for a new request; defect concerns request that passed checks earlier.

### F3. Self-service transfer can deadlock with invitation writer

**Lens:** edge-case-hunter. **Instance disposition:** fix now (A3). **Prevention:** include foreign-key lock requirements when deriving user-before-trip lock sets.

Self-service deletion locks only departing user then trips (`src/lib/account-deletion.ts:45–75`). Shared removal changes `trips.ownerId` to heir (`:178`), whose FK references `users.id` (`src/db/schema.ts:141–143`) and requires heir key-share lock. Invitation writer locks inviter and invitee by sorted ID before trip (`src/lib/membership-writes.ts:112`; `account-lifecycle-locks.ts:60–73`). With heir ID lower than departing ID, invitation holds heir waiting owner while deletion holds owner waiting heir. Admin deletion already widens affected-user lock set (`account-deletion.ts:294–310`); self-service path does not.

**Reproduced:** fixture chose owner/heir by UUID ordering; gated deletion after singleton+owner lock and invitation after heir lock; released both. Deletion succeeded; invitation failed with PostgreSQL `40P01`. Other deadlock victim choices are possible. No corrupt partial commit observed; caller receives avoidable transaction failure.

### F4. Deferred ledger still lists repaired defects

**Aggregate view:** spec/evidence reconciliation. **Instance disposition:** fix now, documentation only (A4). **Prevention:** close deferred-ledger rows alongside follow-up evidence.

`../deferred-work.md:8–9` still lists stale global-sign-out and device-removal races. Commit `eac1acec`, current `profile/security-actions.ts:185–200`, sweep plan's Auto Run Result and passing reset race scenarios prove both fixes landed. Likewise ledger's initial ongoing Activity browser-coverage item has implemented scenarios at `tests/e2e/features/app-activity.feature:260–276` and browser/DB assertions at `steps/app-activity.steps.ts:1105–1137`. Presence in ledger is stale tracking, not evidence these features remain broken.

### F5. Review metadata cannot reliably describe review execution

**Aggregate view:** pattern divergence; prior-retro follow-through. **Instance disposition:** defer to ticket/build maintainer (A5). **Prevention:** select review through supported configuration and reconcile metadata to actual execution.

4.1 plan has empty `review` and `lenses_ran` (`story-password-reset-tracer-plan.md:11–13`), but dated Code Review at `:104–122` records concrete patches, deferrals and verification. Do not label this ticket unreviewed. Prior request to verify first high-risk ticket's lenses cannot be established from frontmatter. 4.2–4.4 plans retain quick review; 4.5 explicitly records thorough lenses. Global default remains `review = "quick"` in `.agents/skills/bmad-build/customize.toml:97`; no evidence found that notes-only policy changed selector. Historical 3.6 risk mismatch also remains (plan high; onboarding `tickets.toml:72` medium).

### Aggregate views: checked scope and accepted choices

- **Architecture delta:** changed-module import inspection, not full dependency graph. Membership mutations moved from route actions to injected-DB `membership-writes.ts` (`c6b25aa7`); action wrappers retain auth/access checks. CLI owns dedicated connection lifecycle; issuance service uses injected DB/clock without Next request API/runtime singleton. No layering violation found within inspected modules. Full-repo cycle detection was not run.
- **Size growth:** pre-pass ranked non-merge churn; real file sizes inspected. `account-deletion.ts` grew 139→460 lines (393 added/72 deleted across non-merge commits), with distinct self/admin paths, shared removal and fingerprint helpers. New membership writer is 349 lines. Largest addition is generated 3,091-line schema snapshot; deletion test is 839 lines. No god-class defect established by size alone. F1–F3 concern boundaries inside these modules, not line count.
- **Duplication:** reset/recovery session modules are each 96 lines with parallel cookie/throttle/validation logic. 4.5 Code Map deliberately mirrors reset; 4.6 intent forbids extracting these modules. Accept as-is: no behavioral drift established; preserve purpose-specific tests. Repeated SQLSTATE traversal is a maintenance observation, not demonstrated defect.
- **Spec reconciliation:** CAP-5 deterministic admin successor order/ties, creator promotion and private keyed fingerprint map to `account-deletion.ts:211–270,294–428`; CAP-6 reset maps to shared authorization consumption and `password-reset.ts`; CAP-7 enrollment/completion maps to `admin-recovery-completion.ts:35–135`, CLI and migration `drizzle/0009_productive_pet_avengers.sql`. F1–F3 are unresolved interaction defects despite normal-flow coverage.
- **Accepted exception:** CAP-5's “admin stays signed in” applies to deleting another account. Self-target deletion signs out, explicitly approved in 4.3 frozen intent and implemented in admin action. No spec rewrite auto-applied.

## Behavior verification

Fresh run on 2026-10-30:

`node scripts/run-e2e.mjs --server=kill "--grep=@feat:(password-reset|admin-account-deletion|admin-recovery-issuance|admin-recovery-completion|integrated-recovery-and-deletion|deletion-concurrency)"`

**58 passed, exit 0.** This selected subset ran against E2E databases with actual app/browser and real Postgres. Observed reset preserving MFA and requiring fresh sign-in; recovery replacing credentials and showing codes once; private admin succession; stale preview refusal; sibling-link/device/live-session revocation; controlled password/global-sign-out/device-removal races. Cross-origin reset rejection emitted expected server-action rejection. No full suite launched; no new broad lint/coverage/build gate was claimed.

Passing tests did not replace direct runtime probes: F1–F3 were exercised separately with existing Object Mother fixture and real services, isolated schemas and deterministic gates. All three reproduced; schema cleanup completed. Probes used service boundary after authentication precheck, not a second full browser race replay.

Additional direct Chromium inspection outside suite: `/account-reset` and `/account-recovery` without context displayed generic unavailable headings, zero password inputs, `Referrer-Policy: no-referrer`; unauthenticated `/trips` reached `/sign-in`. Development responses reported `Cache-Control: no-cache, must-revalidate`, despite proxy setting `no-store` (`src/proxy.ts:44–45`). Production header behavior was not exercised; do not infer production cache safety from proxy unit tests or this development-only observation. Retain as open verification question.

Historical broad verification is available in 4.6 plan: lint, TypeScript, build, 5,571 unit tests, coverage 97.34% lines / 96.86% functions / 92.62% branches, and 495 affected E2E with successful exit. Later status audit records focused checks and a teardown warning. These supersede earlier incomplete gates as historical completion evidence, but neither invalidates fresh F1–F3.

## Previous-retro follow-through

Previous report: `../epic-account-onboarding/epic-account-onboarding-retrospective.md`. Each item checked against current tree; absence of evidence is distinguished from an observed remaining item.

- **A1, review 3.2 and mark built; owner user/developer:** landed. 3.2 plan records review and now status done; current ticket status confirms done.
- **A2, fix review-pin path and reconcile 3.6 risk; owner ticket/build maintainer:** no evidence found of selector fix; high/medium mismatch remains. F5/A5 carry it.
- **A3, check first epic-4 high-risk plan lenses; owner user:** no evidence of that check. 4.1 later review exists, but metadata empty; F5.
- **A4, shared password minimum; owner developer:** landed in shared policy, auth forms and profile actions. Complexity follow-up: no evidence of expanded complexity rules; policy still minimum eight plus confirmation. Later 3.5 notes resolve current minimum/bcrypt-cost decision; whether complexity proposal was superseded remains human policy question, not failed epic-4 criterion.
- **A4b, scoped setup cookie, dead helper removal, exact/subpath routing; owner developer:** landed (`account-setup-session.ts:23`, `proxy.ts:19–20`; removed helper absent). Previously deferred throttle-budget and absent-forwarded-IP items remain deferred; query token choice remains accepted. Not re-opened as new epic-4 defects.
- **A5, inherited server-only imports and Activity ledger closure; owners next Activity maintainer / maintainer:** imports remain absent in `activity-maintenance.ts` and `activity-retention.ts` (searched both). Carry as A6. Ongoing Activity coverage exists at feature `:260–276` and steps `:1105–1137`; ledger closure has no evidence and is A4.
- **A6, close onboarding tickets/epic; owner user:** landed. Current status: all ten done, epic done.
- **Inherited epic-2 A2, optional expired-row throttle/precheck; owner maintainer:** no completion evidence found in focused inspection; optional item remains deferred, no demonstrated load defect.
- **Inherited epic-2 A5, mark Activity tickets done; owner user:** landed, ten done in current status.

## Action items

Six proposed items; none applied or ticketed by retrospective. Owners describe responsible role, not assignment acceptance.

1. **A1 — Account-security developer:** pass originating session version into self-deletion; recheck under lifecycle locks before writes, reject stale context. Tests first in `src/lib/account-deletion.test.ts` and `src/app/(app)/profile/actions.test.ts`; extend `tests/e2e/features/password-reset.feature` and matching steps with queued self-deletion versus reset/recovery. Assert account/trips survive and revoked browser cannot report deletion success. Closes F1; required before acceptance.
2. **A2 — Trip-collaboration developer:** require current actor manager membership under trip lock in contributor writer. Expand `src/lib/membership-writes.test.ts`, route-action tests and deletion-concurrency feature/steps for removed, demoted and deleted actors. Assert no collaborator mutation. Closes F2; required before acceptance.
3. **A3 — Account-lifecycle developer:** lock departing account and selected successor accounts in sorted order before trips; revalidate choices under locks and handle changing lock set. Add controlled transfer-versus-invite case in deletion-concurrency feature/steps and colocated deletion/lock tests. Assert no `40P01` and valid serial outcomes. Closes F3; required before acceptance.
4. **A4 — Maintainer:** reconcile `../deferred-work.md` with `eac1acec` and existing ongoing Activity browser coverage; preserve genuinely open intermittency investigations separately. Documentation reconciliation only; F4.
5. **A5 — Ticket/build maintainer:** reconcile 4.1 review metadata to recorded execution, historical 3.6 risk mismatch, and supported selector for stronger review on high-risk lifecycle work. Prove resolved configuration reaches plan, rather than relying on entry prose. F5 and prior A2/A3.
6. **A6 — Next Activity maintainer:** resolve inherited server-only boundary item for `activity-maintenance.ts` / `activity-retention.ts` after checking import consumers; record disposition and validate any runtime change through normal development workflow. Prior epic-2 A3 / epic-3 A5; deferred, not acceptance blocker for this epic.

## Decision records

Two concrete records approved by user ("Write both ADRs") on 2026-10-30 and written to paths below. Retrospective's one-paragraph record format and approved repository destinations govern these records.

- **Keyed, stateless deletion outcome fingerprints.** Context: admin must reconfirm changed succession without learning trip or successor identity. Decision: HMAC canonical per-trip outcomes, bound to target/setup state, and recompute under locks; no persisted preview. Reason supplied by 4.3 Design Notes: prevent identifier guessing while avoiding persisted preview state. Sources: `story-admin-deletion-and-private-succession-plan.md:84–86`, commit `0f785921`, `account-deletion.ts:256–270`. Proposed destination: `docs/decisions/adr-admin-deletion-uses-keyed-stateless-outcome-fingerprints.md`. Meets trade-off/surprise/reversal test; no duplicate ADR found.
- **Replacement MFA secret belongs to recovery authorization until completion.** Context: abandoned recovery must leave active MFA unchanged while reload keeps same QR. Decision: encrypted pending secret on authorization; move into active credential and clear authorization copy only on atomic completion; recovery codes returned once. Sources: 4.5 frozen intent and Design Notes (`story-cli-recovery-completion-and-cutover-plan.md:103–105`), commits `724dc463`, `cfca8bb9`. Proposed destination: `docs/decisions/adr-recovery-mfa-enrollment-is-scoped-to-authorization.md`. Architecture AD-5 supplies intended boundary; no standalone ADR found.

Existing `docs/decisions/adr-self-service-deletion-locks-instance-singleton-for-members.md` already records singleton trade-off; no duplicate proposed. ADRs record design intent, not resolution of F1–F3.

## Acceptance verdict

**rejected**, criteria **declared**. All tickets finished; rejection is based on reproduced runtime defects, not metadata or historical failed runs. No human override received. Epic is not accepted.

1. **Succession/fingerprint and shared last-admin guard:** normal admin paths demonstrated by passing real-browser/DB coverage. Self-service lock integration remains defective (F2/F3), so criterion is not demonstrably safe across required concurrency boundary.
2. **Reset revokes sessions and sibling authorizations:** normal behavior passes; queued authenticated self-deletion survives reset revocation and destroys account (F1). Unresolved blocker.
3. **Atomic CLI recovery / old command removal:** normal completion, refusal and once-only-code scenarios pass. CLI packaging/docs cutover and old-command absence checked in diff, Docker configuration and completion feature; no new production-container execution claimed.
4. **Secret-free events:** integrated browser Activity/privacy assertions and issuance tests pass. No secret disclosure finding established. Production cache-header behavior remains unverified as described above.

Acceptance requires remediation and targeted regressions for F1–F3, followed by normal validator gate. Fixes, ticket status changes, epic closure and spec rewrites were not performed.

## Open questions

- Both proposed ADRs approved and written; no remaining decision-record question.
- Does later minimum-password policy supersede prior complexity follow-up, or should that separate proposal remain open?
- Does production serve reset/recovery documents and action responses with effective `no-store`? Development header observation cannot settle this; verify actual response boundary, not only proxy return value.
- Full affected-scope intermittency remains tracked in `../deferred-work.md`; passing targeted subset does not prove those historical timing failures solved.

Repository writes: this document and two approved ADRs listed above. Temporary diff/evidence staging and disposable E2E runtime/schema activity are verification artifacts; no source, plan, epic or ticket-state edits were made.


## Remediation appendix (2026-10-30)

Added after the original retrospective; findings and verdict above are preserved as observed. Plan: `../plan-epic-4-lifecycle-race-fixes.md`.

- **F1 fixed.** `deleteOwnAccount` takes the server session version, compares it under the lifecycle locks and returns `Unauthorized` with no writes on mismatch, missing version or departed account; the profile action redirects to sign-in before any success effect. Evidence: `src/lib/account-deletion.test.ts` (missing/revoked version), `src/app/(app)/profile/actions.test.ts` (redirect, no effects), and the `password-reset.feature` outline "Revocation prevents an already-authenticated queued self-deletion" (reset and recovery).
- **F2 fixed.** `saveContributorChangesWrite` requires the actor to hold a manager seat under the trip lock and refuses atomically otherwise. Evidence: `src/lib/membership-writes.test.ts`, `src/app/(app)/trips/actions.test.ts`, and `deletion-concurrency.feature` scenarios for a deleted, removed and demoted manager.
- **F3 fixed.** Choices are validated before SQL, explicit heirs are locked with the departing account in sorted order before sorted trips, heir membership is rechecked under locks, and a vanished trip or heir returns `Stale`. Evidence: `account-deletion.test.ts` (lock order, dedupe, vanished heir/trip) and two `deletion-concurrency.feature` scenarios with a lower-ID heir against an invitation in both lock orders; neither hits `40P01`.
- **F4 closed** by the deferred-ledger reconciliation committed with this change.
- **F5, A5 and A6 remain deferred** (ticket/build metadata; Activity server-only boundary). Not touched here.
- The production-cache-header open question is unchanged.

The acceptance verdict above is not rewritten; a resumed acceptance pass should rely on this appendix and the validator result recorded in the plan.
