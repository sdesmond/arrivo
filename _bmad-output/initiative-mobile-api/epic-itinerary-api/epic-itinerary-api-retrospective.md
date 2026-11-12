---
epic: epic-itinerary-api
date: 2026-11-11
verdict: rejected
criteria: declared
headless: false
---

# Retrospective: Notes and itinerary through the API

## Epic summary

Epic 2: notes and itinerary through the API. Code snapshot: `42f0b73221975832e06baa45a9385ecdcc31dce0`. User supplied no particular going-in concerns. Team discussion was not requested and was skipped.

User confirmed all ten tickets complete and requested status cleanup. `tickets.py mark` set 2.1–2.10 to done; subsequent status reports ten done, no built tickets and no pending tickets. Ticket 2.10 had no plan before cleanup; marking created frontmatter only. This records user acceptance, not an inferred verification run.

Status cleanup was a separately authorized board operation, committed as `45e85e74` on `chore/epic-2-retrospective`. The retrospective itself changes no statuses, epic, plan or story content.

### Tickets and ranges

Ranges follow recorded plan baselines in ancestor order, which matches ticket order. Each of the nine distinct ranges was measured once with `git_evidence.py`. Every range has exactly one merge, all nine merges measured, no binary revisions and no merge-only paths. Merge first-parent churn was inspected separately, never added to non-merge churn. Commit counts include merges.

| Ticket | Title | Status | Range | Commits |
| --- | --- | --- | --- | ---: |
| 2.1 | Edit one event through the API | done | `be321346..2a216e58` | 6 |
| 2.2 | Harden the API mutation client | done | `2a216e58..90a391e6` | 4 |
| 2.3 | Send draft-stable client IDs for checklist creates | done | `90a391e6..6a2c993e` | 4 |
| 2.4 | Extract shared timeline positioning and reorder days | done | `6a2c993e..4406beed` | 5 |
| 2.5 | Create and delete events through the API | done | `4406beed..396a8d2d` | 14 |
| 2.6 | Move day notes to the API | done | `396a8d2d..55eb6b00` | 5 |
| 2.7 | Move trip notes to the API | done | `55eb6b00..fe042cd2` | 5 |
| 2.8 | Edit days and change trip length through the API | done | `fe042cd2..eefdd92c` | 6 |
| 2.9 | Refactor sweep | done | `eefdd92c..42f0b732` | 4 |
| 2.10 | Verify itinerary API end to end | done | unavailable: no baseline | — |

Final range ends at the last epic implementation merge, inferred from history; metadata cleanup is excluded. Attribution comes from ranges, not empty story-ref arrays in commit subjects. Identical commits are counted once across aggregate views.

### Evidence inventory and scope

Available: epic Description, Outcome, Requirements I1–I10, declared Done when, Boundaries and Notes; initiative Requirements R2/R3/R7; all ten ticket lookup records; nine substantive plans with frozen intent, design notes and review triage; prior epic retrospective; `deferred-work.md`; repository source/tests, commits and nine measured ranges; existing API ADRs. Detailed architectural context: `docs/plans/mobile-api.md`; no separate initiative PRD/architecture directory exists.

Missing or narrowed:

- No pulled story files. Ticket entries and frozen plan blocks hold intent.
- No original execution artifact for 2.10. Its status-only plan was created by requested cleanup. Most plans 2.3–2.8 list expected verification commands and leave Implementation Notes empty; those are not observed passes. Plan 2.9 explicitly says E2E and validator were not yet run (`story-refactor-sweep-plan.md:64`). Current results below are new observations, not reconstructed history.
- Session logs were not supplied or examined. Conversation-based process/root-cause analysis is skipped. Process observations derive only from plans and commits.
- Prior epic's `validation-report.md` validates inception artifacts; it is not epic 2 runtime evidence.
- Aggregate derivation and three independent code lenses used subagents as required by the retrospective/review skills. Parent rechecked retained findings against source. Architecture graph scope and duplication inspection limits appear below.
- Transient raw git evidence and runtime logs are not durable repository artifacts. This document records ranges, commands, outcomes and reproductions needed to reassess findings.

## Findings

Each finding gives instance disposition and upstream prevention. Fix-now items are proposals for the normal development loop; no runtime fixes were applied.

### Aggregate views

**Architecture delta — accept as-is.** A deterministic parser resolved static import/export and string dynamic-import paths in tracked non-test TypeScript at baseline and code cut, then ran Tarjan cycle detection: 1,715→1,855 edges (+150/−10). Includes type-only edges; excludes external packages, unresolved paths and non-TypeScript files. The same two syntax cycles remain (storage adapters and share controller/actions); no new cycle in checked scope. New service→API edges reuse contracts and extracted replay integration (`services/{events,days,itinerary-notes,trip-notes}.ts`, `trip-write.ts`). Search found no production service `ApiError` imports; typed `ConflictError` maps in `api/errors.ts:25`. New maintenance→cleanup dependency is intentional but carries an unrecorded migration tradeoff (F-3). Upstream: retain transport-neutral service errors as later domains migrate.

**Duplication — accept as-is.** Scoped source comparison, not clone detection, found deliberate consolidation: `readDayTripId` copied in three services was moved into `trip-write.ts:15` during 2.9; positioning lives in `timeline-positions.ts:19,36,54`, adopted by checklists, events, day notes and day reorder. Pre-lock authorization and in-lock recheck remain intentionally repeated. Source: 2.9 Code Map/Implementation Notes; `services/{checklists,events,itinerary-notes,days}.ts` imports. Upstream: continue a bounded epic sweep rather than abstracting every authorization read.

**Size growth — accept as-is.** Non-merge churn across 131 source/test/script/decision paths: +12,668/−3,053, net +9,615 (excludes migration snapshots and planning docs). Highest runtime net growth: `services/days.ts` +269 (269 lines), `use-trip-notes-reorder.ts` +257 (257), `services/events.ts` +257 (257), `services/trip-notes.ts` +200 (200), `services/itinerary-notes.ts` +159 (159), detail handlers +117 (398). Counterweights: `actions.ts` 789→222, `trip-notes-sortable.tsx` 447→66. Current structures were inspected; churn alone does not establish a god module. Detail handlers now combine more mutation families, but no blocking size finding is justified. Upstream: retain shared position/reorder helpers and revisit handlers when another domain adds responsibility.

**Pattern divergence.** Checklist-item and trip-note services suppress same-value writes; event/day PATCH still marks nonempty same-value input changed (`services/events.ts:91–103`, `days.ts:112–119`). Accept as-is for this epic: I9 specifically requires no-op checklist-item behavior. Future harmonization is optional, not an unmet I9. Draft identity differs materially for checklist items (F-2).

### Spec-to-implementation reconciliation

| Requirement | Evidence and result |
| --- | --- |
| I1 shared mixed positioning | `timeline-positions.ts:19,36,54`; adopted by checklist/event/day-note services and day order. Implemented. |
| I2 events, partial PATCH, documents, day-less and linked IDs | `services/events.ts:64,150,217`; contract and UUID param validation; `api.feature:381–478,533–667`. Implemented server-side; rapid UI reversion fails (F-1). |
| I3 complete day order, 409, keyed client | `days.ts:55`, `timeline-positions.ts:54–80`, handler key at `use-trip-detail-handlers.ts:168`; `api.feature:481–531`, `day-planning.feature:57`. Implemented; navigation caveat F-D1. |
| I4 day notes | `services/itinerary-notes.ts:35,98,134`; `api.feature:670–828`, mixed persistence scenario `day-planning.feature:72`. Implemented. |
| I5 trip notes | `services/trip-notes.ts:34,95,135,166`; `api.feature:830–1088`, rapid reorder `trip-notes.feature:161`. Implemented; unmount caveat F-D1. |
| I6 day editing/length, cap, confirmation, cleanup | `services/days.ts:84,122,193,223–224,248,267`; `api.feature:1090–1300`, confirmation `day-planning.feature:139`. Implemented; cleanup introduces migration F-3. |
| I7 transport-neutral conflict | `services/conflict-error.ts`, `api/errors.ts:25`, checklist/idempotency throws; production services contain no `ApiError`. Met. |
| I8 stable draft IDs, picker guard, replay after shift | `use-day-draft.ts:67,101,124–152`, trip editor `:71,127–139`, packing guard `use-packing-handlers.ts:58,222–235`, checklist replay `checklists.ts:160`. Checklist-item retry lifetime does not match epic (F-2). |
| I9 client hardening | `client.ts:20,32–33`; keyed fields/postcommit callback handling in `use-api-mutation.ts:82–88`; no-op checklist PATCH `checklists.ts:344–375`, tests `:1290–1303`. Met within declared scope; timeout uncertainty remains deferred. |
| I10 tests, API waits, affected registration | Colocated tests/routes present; `feature-map.mjs:66–95,473–497,768–779` and action-file mappings inspected. Current validation and production results below; original final execution record missing (F-5). |

Explicit symbol search of `src/app/(app)/trips/[tripId]/actions.ts` found none of the 15 retired itinerary/note mutation exports. Document and cover actions remain for later epics. Epic Notes explicitly define “move” as within-day reorder; cross-day move is outside scope.

### Diff-scope review: bmad-review

Independent adversarial, edge-case-hunter and verification-gap lenses read the cumulative staged diff `be321346..42f0b732`, emphasizing cross-ticket boundaries. Findings below consolidate overlaps while preserving lens attribution. Previously triaged design choices are distinguished from new defects.

**F-1 — Pending event reversion is dropped.** Lenses: adversarial, edge-case-hunter, verification-gap (`regression-gap`). Consumer: `place-row.tsx:344–365` time/location save callbacks. `eventPatchBody` compares against stale server props (`use-trip-detail-handlers.ts:105–110`); the handler drops an empty delta (`:147`). Change a field A→B→A before first refresh: second intent is skipped, B persists. Production reproduction below confirms it. Verification checked: handler tests `:974–1031` cover disjoint edits, no-op without predecessor and rapid names on an event absent from props; none exercises pending return to baseline. `day-planning.feature:12–37` tests ordinary edit/reload. **Instance: fix now; blocking Done when 2.** Guard: pass explicit changed fields or reconcile pending per-field intent. Upstream: rapid-write tests must include reversal to original value, not only two different new values. Action A-1.

**F-2 — Checklist-item IDs are per invocation, not retained across retry.** Lenses: adversarial, verification-gap (`missing-adoption-gap`). Consumer: existing-checklist item input, `checklist-item.tsx:89–94`, which invokes a void callback and immediately clears input. Handler `use-checklist-handlers.ts:179–187` calls `createRandomId()` each time. Epic I8 requires draft-stable item IDs reused on retry; story 2.3 frozen boundary instead says “Item adds mint one ID per gesture” (`story-send-draft-stable-client-ids-for-checklist-creates-plan.md:28`) and triage rejects stability (`:97`). A committed-but-lost response followed by re-entry creates another item. Tests `use-checklist-handlers.test.tsx:436–449` assert unique IDs on different adds; `checklist-item.test.tsx:336–345` asserts immediate clearing. API replay scenario `api.feature:190–196` supplies a stable ID directly, bypassing UI lifetime. Symbol/import and retry-term searches across source/tests found no consumer test for ambiguous item-create retry. **Instance: fix now or obtain explicit epic-scope reconciliation; blocking I8 as written.** Guard: retain input draft content/UUID through ambiguous failure, assert identical request ID and one stored item. Upstream: compare frozen story boundaries against each covers requirement during handoff. Action A-2.

**F-3 — Durable cleanup changes upgrade contract without reconciled source artifacts.** Aggregate spec reconciliation, confirmed in commit `3b2f9f4d`. Initiative Done when 4 (`initiative-mobile-api.md:38`) says phases 1–5 require no new migrations; `:57` reserves them for unified sessions; `docs/plans/mobile-api.md:451` agrees. Story 2.5 frozen Never forbids migrations (`story-create-and-delete-events-through-the-api-plan.md:30`), while its Design Notes still describe an in-memory closure (`:119–121`) and Plan Change Log is empty. Commit adds `drizzle/0014_ambiguous_dracula.sql:1–7`, queue table and document URL index; runtime inserts/queries it in `file-cleanup.ts:19–24,48–54`. Commit message gives concrete rationale: avoid orphaned files when a process dies after DB commit. **Instance: fix now through scope/upgrade reconciliation; no inference about authorization in unavailable conversations.** Guard: approve documented migration exception and update upgrade guidance, or choose an implementation honoring no-migration boundary. Upstream: a late hardening commit must reconcile frozen constraints and self-hosting impact before acceptance. Action A-3.

**F-4 — Failed oldest cleanup batch starves newer queued files.** Lens: adversarial. `file-cleanup.ts:46–54` selects oldest 200; failed deletions retain their original row (`:27–35`). If those 200 persistently fail, every maintenance pass retries the same set and never reaches newer crash leftovers. `file-cleanup.test.ts:113–120` asserts bounded oldest batch; failure test covers two files only (`:77–88`), not backlog fairness. This is conditional maintenance behavior, not an observed production failure. **Instance: defer as tracked remediation; not a blocker to ordinary flows.** Guard: retry eligibility/backoff or rotation allowing later rows progress; test over 200 rows with oldest batch failing. Upstream: bounded retry queues need fairness/failure-isolation cases. Action A-4.

**F-5 — Final verification history is incomplete.** Ticket 2.10's plan did not exist before status cleanup and now contains only frontmatter; 2.9 says validator/E2E not run yet (`story-refactor-sweep-plan.md:64`). User completion confirmation is recorded, but does not prove historical commands. **Instance: accept missing history as a limitation; current checks close only their stated scope.** Upstream: record observed commands/results, code revision and production-server mode in verification artifacts before marking a verification story complete. Action A-5. Do not backfill invented results into old plans.

**F-6 — Production keyboard note reorder does not reach verified persistence.** Behavior-check finding. Scenario `trip-notes.feature:170` (“Keyboard-reordering a note moves it down one position and persists after reload”) failed both in selected production run and isolated one-worker recheck. Step `trip-notes.steps.ts:298–314` focuses handle, presses Space/ArrowDown, arms PUT wait, then presses Enter; `api-response.ts:18` times out after 5,000 ms waiting for response. **Instance: fix now; blocks declared Done when 3's passing affected E2E condition.** Observed failure is reproducible; whether cause is drag interaction, application persistence or test synchronization remains unresolved. Guard: trace keyboard drag/drop and request lifecycle, then fix demonstrated cause while preserving actual post-reload order assertions. Upstream: retain keyboard interaction in production verification alongside pointer drags. Action A-7.

### Carried deferred findings and excluded scope

**F-D1 — Lifetime and ambiguous-write risks remain deferred.** Sources: `deferred-work.md:35–36,51–52,59–70` and corresponding story triage; lens adversarial independently reidentified them. Timed-out requests can still commit after client queue releases (`client.ts:32–45`); queued day reorders can be skipped on hook unmount (`use-api-mutation.ts:78–85`); old draft completion can alter a newer draft's refs (`use-day-draft.ts:117–158`); trip-note unmount saves suppress settled callbacks/feedback (`trip-notes-editor.tsx:88–107,127–158`). **Instance: defer under existing records, not newly claimed failures.** Upstream: fault-inject timeout/navigation at consumer boundary when these records are scheduled. This retro neither expands their scope nor silently calls them fixed.

Reviewer also raised pre-existing refresh-wait hangs and throwing `onSettled` cleanup (`use-api-mutation.ts:93–107,136–140`). Excluded from new epic-defect count: they predate this range and were not introduced by the changed `onSuccess` handling. Same-value event/day PATCH divergence is accepted above. These exclusions prevent ten adversarial candidates being mistaken for ten new regressions.

## Behavior verification

Production behavior exercised against code cut under `next start` from `.next-validate`, using isolated E2E database and scenario-owned user/trip data from existing mother/materializer helpers. Fixtures were cleaned up and temporary production server stopped. F-1 was confirmed independently of automated suite.

Observed browser reproduction: render an untimed event; intercept first event PATCH; select 09:00 and save; before releasing request, reopen Time dialog, confirm blank initial field and Save without time; release first request, await 200, reload. Observed exactly one PATCH and a stored non-null time. Expected latest blank-time intent to persist. The first custom smoke run also created a day note, submitted mixed event/note order (both 200) and verified note visible after reload. It then stopped at a harness locator error (`Notes` is a button, not a tab); this is not an application defect. Fixture cleanup completed.

Corrected custom smoke completed successfully as an observation script: reproduced F-1 again; day-note create and mixed event/note reorder returned 200 and note remained visible after reload; trip-note create/PATCH returned 200 and rendered in Notes; day append/delete returned 200/204; day-note and event deletes returned 204. This script records the lost-intent result instead of asserting it correct; its zero exit status does not mean F-1 passed.

Current validator: lint PASS (13 warnings, no errors); TypeScript PASS; production build PASS (19 static pages; dynamic API/trip routes generated; Next 16.2.4 emits route table without bundle-size figures); coverage PASS, 444 files/7,512 tests, lines 97.90%, functions 97.52%, branches 93.75%. `npm run test:e2e:affected` correctly skipped metadata-only work. Production feature subset is a separate epic check, not represented by that skip. Initial sandbox filesystem failures were rerun with approved access; no TLS checks or project code were changed.

Separate production E2E subset: `api`, `day-planning`, `linked-events`, `event-docs`, `trip-notes`, `app-activity`, `trip-live-refresh`. Commands: `npx bddgen`, then `npx playwright test --grep '@feat:api|@feat:day-planning|@feat:linked-events|@feat:event-docs|@feat:trip-notes|@feat:app-activity|@feat:trip-live-refresh'` with production server reuse and matching port. Existing migrated E2E databases were used; configured global setup reset baseline state. Wrapper refused temporary launcher because its process command did not match managed-server signature; direct Playwright invocation retained normal project config/global setup. This was selected-feature verification, not a full-suite run.

Result: **387 passed, 2 failed** out of 389 checks (includes auth setup). Failures: forged second-factor activity expected one row, received zero; keyboard note reorder timed out awaiting PUT. Isolated recheck of these two with one worker: **2 passed, 1 failed**, including auth setup. Forged-ticket scenario passed on recheck; no stable defect/root cause established, so record initial failure without calling it clean or inventing a cause. Keyboard reorder failed identically (F-6). Full production subset therefore remains failed; no blanket E2E pass claimed.

## Previous-retro follow-through

Sources: prior `epic-checklist-api-pilot-retrospective.md:111–116`; all previous action items accounted for.

- **Previous A-1**, owner developer: “reuse itemContent for firstItem.content … with contract, service and API E2E blank-content cases first.” Code and unit coverage landed in `4a14fc13`, `contract/checklists.ts:9,26`, contract tests `:104–118`, service test `services/checklists.test.ts:568`. Requested API E2E blank-first-item case: no evidence found after lifecycle-case and firstItem searches. Partial follow-through; include remaining case in A-5.
- **Previous A-2**, owner `bmad-ticket` user: “attach the 1.5 UI half to ticket 1.5 or record it as a ticket entry so tickets.py stops reporting it.” Landed `3158c8c3`, entry 1.11; `story-complete-checklist-lifecycle-ui-migration-plan.md:4,6` records ticket 11/done. Previous retro already records resolution.
- **Previous A-3**, owner developer: “file one hardening story … timeout, draft re-arm … per-key field errors, no-op item PATCH.” Delivered across 2.2/2.3: `client.ts:20–33`, mutation hook `:82–83`, `checklists.ts:344–375`, `use-day-draft.ts:72–86`. Split across two stories explicitly, not lost.
- **Previous A-4**, owner user: “run the full E2E suite … before merging feature/api-v1 toward main; agents do not launch it.” No evidence found of that user-run full pass in epic artifacts. Remains integration prerequisite A-6; this retrospective ran only selected features.
- **Previous A-5**, owner unspecified in prior item: “carry F-D1 and F-D2 into the itinerary epic's first story.” Rescheduled explicitly to 2.3 in epic Notes (`epic-itinerary-api.md:60`); checklist IDs/picker guard landed, checklist-item retry stability remains F-2. Partial follow-through, not fully met by generating per-call IDs.
- **Previous A-6**, owner epic author: “put the production-server E2E run in the first verification story, not the last.” Landed: 2.1 Implementation Notes (`story-edit-one-event-through-the-api-plan.md:90–92`) record first production pass 159 pass/3 fail and subsequent live-refresh 6/6; production-only SSE registry fix is in commit subject “fix: share live-sync topic registries across production bundles.” Early production exercise found a real integration issue before later migrations.

## Action items

### Practical severity reassessment

After user challenged likelihood, reassessed practical impact separately from strict declared acceptance. This assessment supersedes earlier urgency labels; evidence and formal requirement mismatches remain as recorded. No runtime changes or new runtime verification occurred during reassessment.

- **F-1 / A-1: medium, confirmed, timing-dependent.** A user must submit another edit returning a field to its rendered original value before the first save/refresh arrives. Ordinary edits after refresh are unaffected. Delaying the first PATCH demonstrated the loss twice, but does not establish its frequency on normal connections. Silent loss of latest intent merits a targeted fix; evidence does not support treating this as a broad or critical data-loss defect.
- **F-6 / A-7: medium investigation priority, application severity unconfirmed.** Repeated production-mode keyboard scenario failure is strong evidence of a verification problem. Missing response alone does not distinguish application keyboard failure from automation timing. If keyboard reordering is broken, impact is loss of that operation for keyboard users, including users who cannot use pointer dragging; existing note contents are not shown to be lost. Diagnose before claiming a confirmed persistence defect or selecting a fix.
- **F-2 / A-2: low practical severity, explicit contract gap.** Duplicate creation requires a write to commit, its response to be lost, and a user to re-enter the same item before recognizing the stored item. No automatic retry loop was identified. A duplicate checklist item is visible and removable. Retained draft identity would meet I8, but this is resilience work or an explicit scope adjustment, not evidence of a common failure.
- **F-3 / A-3: low documentation/scope severity on the supported container path.** Rechecked `docker/entrypoint.sh`: migration runs before server startup; `docs/releasing.md` already documents automatic migrations. Migration 0014 creates a queue table and index without dropping existing data. No upgrade failure was demonstrated. Reconcile stale no-migration constraints and mention schema impact through normal release work; no special manual container upgrade action or design rollback is established. Source-run deployments still require their normal migration procedure.
- **F-4 / A-4: low, optional resilience work.** Requires at least 200 persistently failing queue entries plus newer queued work. Temporary storage outages can clear once storage recovers. No observed incident; not a release blocker.
- **F-5 / A-5: process limitation, not a runtime defect.** Current verification supplies new evidence; missing historical records need no reconstruction. The missing blank-first-item API test is a narrow coverage follow-up, not proof of broken validation.
- **ADR proposal: optional documentation.** Writing it does not change application behavior or mitigate an observed defect. It need not hold up development or release.

Practical recommendation: prioritize the confirmed event-intent fix and diagnosis of keyboard reordering. Defer checklist retry hardening and cleanup fairness unless stronger reliability guarantees are required. Resolve migration wording as documentation upkeep. No critical or high-severity application defect is established by this evidence. Formal declared acceptance remains rejected because those criteria require behavior and passing checks not yet demonstrated; that mechanical verdict should not be read as a severity rating.

Seven items; proposed unless explicitly described as existing user prerequisite. No remediation or spec edits applied.

1. **A-1 / F-1 — Preserve rapid event reversions. Owner: developer.** Change handler/editor intent representation; add original→changed→original pending tests in `use-trip-detail-handlers.test.tsx`, plus time/location consumer E2E in `day-planning.feature`/steps with delayed first PATCH and reload persistence. Fix now.
2. **A-2 / F-2 — Resolve checklist-item draft retry contract. Owner: developer; product owner approves any scope narrowing.** Retain item input UUID/content across ambiguous failure and retry; cover handler/component and committed-response-loss E2E. Alternatively explicitly reconcile I8 to weaker per-gesture semantics and accept duplicate risk. Fix now; no silent story-level narrowing.
3. **A-3 / F-3 — Reconcile durable-cleanup migration. Owner: epic author and release maintainer.** Decide migration exception versus no-migration design; align initiative/source contract and story change record, and document migration 0014/update requirement for self-hosters. Existing commit rationale supports crash safety; it does not amend the source contract. Fix now.
4. **A-4 / F-4 — Ensure cleanup backlog progress. Owner: developer.** Schedule retry fairness/backoff or rotation with >200-row permanent-failure coverage in `file-cleanup.test.ts`; preserve postcommit deletion and transactional rollback behavior. Deferred remediation, fully described here.
5. **A-5 / F-5 and prior A-1 — Keep verification evidence complete. Owner: verification-story author.** Capture observed command, revision, runtime mode, scope and result when verifying; retain this retro's current evidence rather than fabricate 2.10 history. Add missing blank-first-item API case to `api.feature`/steps when verification work resumes. Process lesson plus remaining test proposal.
6. **A-6 / prior A-4 — Run full regression before integration into main. Owner: user.** Run `npm run test:e2e` before merging `feature/api-v1` toward `main`, as prior retrospective required. Not run automatically; selected production features are not a substitute for this prerequisite.
7. **A-7 / F-6 — Resolve production keyboard note reorder failure. Owner: developer.** Trace existing `trip-notes.feature` keyboard-reorder scenario and `trip-notes.steps.ts:298–314` through `use-trip-notes-reorder.ts` and API request. Reproduce with production build, fix proven application or synchronization cause, and show keyboard order persists after reload. Preserve existing API wait; do not hide failure with serial tags or increased timeout alone. Fix now.

## Decision records

Proposed `docs/decisions/adr-file-deletions-survive-transaction-commit.md`: queue file URLs in deleting transaction, delete after commit, retry during maintenance. Sources: 2.5 Design Notes (original closure design), commit `3b2f9f4d` (crash-safety rationale), 2.8 frozen constraints (adopts durable queue). Tradeoff is schema/operational state and migration 0014. No existing ADR records it. Asked user for approval; no approval received at finalization, so proposal only and **no decision record written**. Recording decision would not itself reconcile F-3.

Client UUID lock ordering and position-excluded equality already have `docs/decisions/adr-client-uuids-are-locked-before-the-trip-lock.md`; API contracts/client boundaries also have ADRs. No duplicate proposed. Timeout duration and helper extraction are easy to reverse, so fail ADR test. DELETE trip context is already a consistent contract pattern with rationale in plans; no separate record proposed in this run.

## Acceptance verdict

Machine verdict: **rejected**, criteria **declared**. Ticket completeness passes: all ten done, no pending tickets. This verdict concerns delivered behavior/contract, not a status reversal.

1. Services and `/api/v1` production outcome: routes/contracts/services present; production custom CRUD and selected E2E exercised, with scope and failures recorded above.
2. Web flows persist and preserve mixed timeline intent: ordinary coverage exists, but production reproduction F-1 loses latest event-time intent after reload. Criterion fails.
3. Partial PATCH, authorization, affected checks: substantial contract/access coverage and current validator pass, but production subset fails and keyboard note reorder repeats its failure (F-6). Passing-check criterion is not met. I8 checklist-item retry requirement still diverges (F-2); source no-migration constraint also remains unreconciled (F-3). Deferred maintenance risk F-4 is independently tracked.

No human override of machine acceptance verdict has been given. User instruction that tickets are done was applied as board completion; it was not treated as blanket acceptance of newly discovered defects. Epic is not accepted on available evidence. No epic container status was changed.

## Open questions

No particular going-in concerns supplied. Would product owner accept weaker checklist-item retry guarantee, or require I8 as written? Is durable-cleanup migration an approved exception to no-migration boundary? ADR proposal remains unapproved. What causes production keyboard reorder to miss its API response, and why did forged-ticket activity fail only in larger run? These unresolved answers change remediation; F-1 and reproducible production-check failure still prevent machine acceptance.
