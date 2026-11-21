---
epic: epic-trips-packing-api
date: 2026-11-20
verdict: accepted-with-open-items
criteria: declared
headless: false
---

# Retrospective: Trips and trip packing through the API (epic 5)

## Epic summary

Epic folder `_bmad-output/initiative-mobile-api/epic-trips-packing-api/`, covers R4, R7 (T1–T8). Twelve tickets, one lane, built in order 5.1 → 5.12; each merged to `feature/api-v1` as PRs #547, #549, #552–#561.

Ticket status per `tickets.py status` at retro start: 5.1–5.5, 5.7–5.11 `built` / state `review`; 5.6 `in-review` / `review`; 5.12 `planned` (status empty). `pending_tickets` = [5.6, 5.12].

The user stated 5.6 and 5.12 are finished but not marked. The evidence agrees:
- 5.6: PR #555 merged (`4f84ae59`). The plan frontmatter still says `status: in-review`.
- 5.12: PR #561 merged (`42c5cffb`, 2026-11-21T04:18Z, after the local tree was last fetched). Plan `story-verify-trips-and-packing-api-end-to-end-plan.md` has `status: built`. `tickets.toml` was never updated.

All twelve remain at `built`/`review`, not `done`; closing them is `bmad-ticket`'s job.

### Ranges (baseline → next baseline; last ends at the 5.12 merge)

| Ticket | Range | Non-merge commits |
| --- | --- | --- |
| 5.1 | 66d70173..e3cb0e91 | 2 |
| 5.2 | e3cb0e91..0653803e | 4 |
| 5.3 | 0653803e..80408db2 | 4 |
| 5.4 | 80408db2..b17424d3 | 5 |
| 5.5 | b17424d3..e5f34139 | 1 |
| 5.6 | e5f34139..f72a17f4 | 5 |
| 5.7 | f72a17f4..d263e78b | 4 |
| 5.8 | d263e78b..b1f46dcc | 3 |
| 5.9 | b1f46dcc..fe8c5e6c | 4 |
| 5.10 | fe8c5e6c..ed4728b6 | 3 |
| 5.11 | ed4728b6..26c4d7e6 | 2 |
| 5.12 | 26c4d7e6..42c5cffb | 1 |

Epic total `66d70173..42c5cffb`: 121 files, +11,299 / −4,558. Each range has one merge, and every merge was measured.

### Evidence inventory

- Available: epic file with declared Done when; T1–T8 in the epic's Requirements; all 12 plans; `tickets.toml`; `deferred-work.md`; previous retro `epic-sharing-api-retrospective.md`; git history and PR state.
- Missing: story files (none pulled; plans hold the intent). Session logs aren't available, so the process-lesson analysis relies on plan logs only.
- Plan records: 5.2 (`story-reorder-packing-items…`), 5.3, 5.5, 5.6 and 5.9 state no final build-validator result. Only 5.1, 5.10 and 5.12 record one.

## Findings

Sources: the aggregate views were derived inline (scripts plus reading). `bmad-review` ran the adversarial, edge-case-hunter and verification-gap lenses as parallel subagents over `git diff 66d70173 42c5cffb -- src tests scripts docs` (15,535 lines), weighted toward story boundaries. Every finding below was re-checked against current source on `feature/api-v1` @ `42c5cffb`; lens reports that couldn't be confirmed were dropped or marked _plausible_.

Each finding has two dispositions. **Instance** says what to do with this occurrence: fix now / defer / accept. **Prevent** says what would stop the next one.

### Aggregate views

- **AV1 — Layering inversion (architecture delta).** The epic introduced the first `src/lib` → `src/app` imports: `src/lib/services/trips.ts:27` imports `@/app/(app)/trips/create-trip-days`, and `src/lib/services/trip-date-change.ts:8,13` imports `create-trip-days` and `date-sync`. The baseline `66d70173` had zero such imports (checked over every non-test file under `src/lib`). The services are the API boundary (adr-api-service-boundaries), so they now depend on route-folder code. _Instance:_ defer (move both modules under `src/lib/`). _Prevent:_ an ESLint `no-restricted-imports` rule banning `@/app/**` from `src/lib/**`.
- **AV2 — Test-step god file (size growth).** `tests/e2e/steps/api.steps.ts` is 4,644 lines, +817 net this epic (largest code churn in `git_evidence` `files`). Story-specific step files already exist (`api-trip-dates.steps.ts`, `api-create-trip.steps.ts`, `api-trip-delete.steps.ts`), but packing API steps still went into the shared file. _Instance:_ defer (split packing/trip steps out). _Prevent:_ a convention that each migrated domain gets its own `api-<domain>.steps.ts`.
- **AV3 — Pattern divergence: post-commit file removal.** `updateTrip` awaits `removeQueuedFiles(queued)` in the response path (`trips.ts:125`), while sibling `deleteTrip` defers it with `after()` (`trips.ts:345`). The adversarial and edge-case lenses flagged it independently. A date change that deletes many files blocks the PATCH on storage I/O. _Instance:_ fix now (use `after()`). _Prevent:_ none beyond the fix.
- **AV4 — Duplication.** No cross-ticket reimplementation found: every packing write goes through `runTripWrite` (`packing.ts`, 9 call sites), and trip writes use `runTripWrite`/`withIdempotency` consistently with earlier epics. Checked and clean.
- **AV5 — Spec reconciliation.** Done when 1–3 and T1–T8 were audited by 5.12 (`story-verify-trips-and-packing-api-end-to-end-plan.md` Results): retired actions have no callers, `trips/actions.ts` keeps only `saveTripListAsTemplate` plus location search. I re-checked T8 "no schema or environment changes" (`git diff --stat 66d70173 42c5cffb -- drizzle src/db .env.example` is empty) and T5 file removal through the cleanup queue (`trips.ts:89,326`). One divergence: T6 promises a payload-derived ETag, but its value depends on query order (F1), so it doesn't reliably meet the requirement's intent.

### Diff-scope review (bmad-review lenses)

Boundary-weighted findings come first.

- **F1 — The ETag isn't deterministic** _(adversarial + edge-case, confirmed)_. `src/lib/api/route.ts:121-122` hashes `JSON.stringify(result)`. `getTripDetail` orders events and packing items by `position` only, with no tiebreaker, and positions repeat per day and per list (`src/lib/queries.ts:418,432`). Reservations and expenses have no ORDER BY at all (`queries.ts:441-442`). Identical state can hash differently, so 304s may rarely fire. Unit and E2E tests use tiny fixtures and can't see this. _Instance:_ **fix now** (id tiebreakers everywhere). _Prevent:_ an ETag test that seeds tied positions and unordered rows.
- **F2 — The snapshot behind the ETag isn't atomic** _(adversarial + edge-case, plausible)_. `getTripDetail` runs about a dozen separate autocommit reads (`queries.ts:409-498`), and the 5.7 date-change and 5.2 reorder writes can commit between them. A torn payload then gets a valid ETag. _Instance:_ fix now, alongside F1 (read-only REPEATABLE READ transaction on the API path). _Prevent:_ —
- **F3 — No deletion records for trips, packing items or packing lists** _(adversarial, confirmed)_. `DeletionRecordResource` (`src/lib/services/deletion-records.ts:16-17`) has no `trip`, `packing-item` or `packing-list`, and none of `packing.ts` or `trips.ts` calls `recordDeletions`. All three accept client UUIDs (T2, T5), so an unkeyed or expired retry recreates a deleted row. This extends the 5.3 deferred tombstone question (`deferred-work.md`) to trips and lists. _Instance:_ **fix now** (or resolve the deferred investigation first). _Prevent:_ make "client-id resource ⇒ deletion record" a checklist item in API story plans.
- **F4 — Date-change cascades leave no records for child resources** _(adversarial, plausible)_. `trip-date-change.ts:292,304` records only `event` and `day`. Notes, checklists, checklist items and event documents cascade with the days and get no record, although those resource types exist in the union. _Instance:_ fix with F3. _Prevent:_ same as F3.
- **F5 — The confirmation hides reservation file deletion** _(adversarial, confirmed)_. Under `delete-events`, reservation documents are queued for deletion (`trip-date-change.ts:180,295`), but the confirmation reports only event document counts. The user confirms without being told uploaded reservation files will be destroyed. _Instance:_ **fix now**. _Prevent:_ —
- **F6 — A reversed date range is silently swapped** _(edge-case, confirmed)_. `buildDayRows` swaps `end < start` (`src/app/(app)/trips/create-trip-days.ts:17-21`), so a PATCH whose endDate falls before the start (or before the stored start) moves the trip instead of returning 422, while create rejects the same input. _Instance:_ **fix now**. _Prevent:_ —
- **F7 — A keyed retry after a delete returns 404 instead of the stored replay** _(adversarial, confirmed)_. `updatePackingItem` reads the item and checks the role before `runTripWrite` reaches the idempotency lookup (`packing.ts:43-46`); the other packing writes use the same shape (`:91, :163, :189, …`). A keyed PATCH retried after the item was deleted fails instead of replaying. _Instance:_ **accept**. Re-checked during planning: `withIdempotency` runs `authorize` before it reads any stored result by contract (`src/lib/api/idempotency.ts:111`), so a 404 reflects the current state. That matches the precedent in `adr-authorize-invitation-replay-by-trip`. _Prevent:_ —
- **F8 — The trip-create replay compares fields that can be edited** _(adversarial, confirmed)_. `isSameTrip` (`trips.ts:158-173`) compares name, dates, tags and similar fields. If a collaborator edits the trip before the creator's retry, the retry gets 409 and the outbox may mint a duplicate. The packing create replay has the same shape for name (`packing.ts:204-213`, plausible). _Instance:_ **defer**. A fix needs a stored creation fingerprint, because the existing scenario "Reusing a trip UUID for another name conflicts" relies on the field comparison, and no mobile outbox exists yet. _Prevent:_ compare only immutable creation facts.
- **F9 — No-op or mis-combined date fields** _(edge-case + adversarial, confirmed by reading `trips.ts:57-90`)_. If the date fields equal the stored dates, every day is still renumbered and `updatedAt`, the live event and the ETag all change. `resolution`/`confirmation` sent without a date change is silently ignored. _Instance:_ defer. _Prevent:_ —
- **F10 — A failed packing-list create loses the typed name** _(edge-case, confirmed)_. `src/components/arrivo/packing-list-overview.tsx:65-67` clears the name and closes the form before checking `newId`, contradicting `use-packing-handlers.ts:263` ("the overview stays open because no id comes back"). _Instance:_ **fix now** (small). _Prevent:_ a component test for the failure path.
- **F11 — The dateless-overflow confirmation is never round-tripped through the contract** _(verification-gap, confirmed: `removedDayLabels` appears in `contract/trips.ts:11` but not in `contract/trips.test.ts`)_. The service test passes the object directly (`trip-date-change.test.ts:283-321`), `trips.test.ts` mocks `./trip-date-change`, and every E2E date scenario uses dated trips. _Instance:_ **fix now** (contract round-trip test or an `api.feature` scenario). _Prevent:_ —
- **F12 — Cover generation is awaited in the create response with no timeout, orphans the tile, and is skipped by trip delete** _(adversarial; mostly pre-existing)_. See `trips.ts:241-258`, `trip-cover-generation.ts:56-62` and `trips.ts:311-329`. Already deferred in `deferred-work.md` (5.9, 5.10). _Instance:_ defer (tracked).
- **F13 — Pull-templates is unbounded** _(adversarial + edge-case, confirmed `contract/packing.ts:98`)_. `templateIds` has no max, there are per-item inserts under the trip lock, and templates the user doesn't own are skipped silently. Lists can also grow past the reorder cap of 1000 (`contract/packing.ts:33-35`). _Instance:_ defer. _Prevent:_ a contract-review rule that every array has a `.max()` matching downstream caps.
- **F14 — Pull-templates conflates section and item names** _(adversarial + edge-case, plausible; `packing.ts:472-510`)_. A template section whose name matches an existing plain item is skipped and its children land ungrouped. _Instance:_ defer.
- **F15 — An FX lookup runs inside the trip lock** _(adversarial, plausible; `trips.ts:92-111`)_. `convertCurrency` calls `recalculateAll` under the lock, and `convertCurrency` without `budgetCurrency` is silently ignored. _Instance:_ defer.
- **F16 — Reorder and delete use separate client queues** _(adversarial, plausible; `use-packing-handlers.ts:168-184` vs `209-232`)_. A reorder can race a just-sent delete and produce a spurious 409 rollback. _Instance:_ defer.
- **F17 — The ETag is cache-only and undocumented** _(adversarial)_. PATCH and DELETE ignore `If-Match`. _Instance:_ defer (document in `docs/api-v1.md` that it's cache-only, last write wins).
- **F18 — DELETE of a missing trip returns 204 while a hidden trip returns 404** _(edge-case)_. _Instance:_ **accept**. It's specified by T5 and `adr-api-access-statuses`, and the ids are random UUIDs.
- **F19 — Minor items.** A stale comment at `src/lib/api/idempotency.ts:13` still describes `packing-actions.ts` key storage. The `deleted` flag isn't reset at the start of `authorize` (`trips.ts:276`; theoretical, since authorize runs once). The refresh queue can stall on a never-settling transition (`src/lib/refresh-coordinator.ts`; already deferred under 5.1). _Instance:_ defer.

### Process (plan logs only; no session logs)

- **P1 — The final validator result is missing from 5 of 12 plans** (5.2, 5.3, 5.5, 5.6, 5.9 list only the planned command). The epic-4 retro lesson "record the final validator result in the plan" landed only partly.
- **P2 — Ticket and plan status drifted after merge.** 5.6's plan says `in-review` although PR #555 merged. 5.12 is `planned` in `tickets.toml` although its plan says `built` and PR #561 merged. The status check therefore reported unfinished work that was in fact delivered.
- **P3 — 5.12 ran with `review: none`.** It found no gaps, yet the review lenses here found boundary defects (F1, F3, F7) that a verification-story audit focused on test existence didn't surface. The audit mapped requirements to tests; it didn't test cross-story invariants.

## Behavior verification

Not run separately here. Evidence relied on: 5.12's production-build Playwright run (`.next-e2e`, `next start`) over 11 features, 735/736 pass, with one packing-tab flake deferred as unreproduced (`deferred-work.md`). 5.12's build-validator: lint, TSC, build and coverage pass (98.03% lines / 93.96% branches). That run exercises the changed flows in a real browser against a real server, but it can't reveal F1 (ETag churn under tied positions) or the F7 and F8 replay windows. Those are untested, not verified clean.

## Previous-retro follow-through

Previous retro: `epic-sharing-api/epic-sharing-api-retrospective.md`. Its five original proposals were already applied there. One open action:

- "Developer: investigate whether a real non-cooperating invitation writer can trigger F3; reproduce the conflict before choosing a conflict-safe insert or savepoint." **Not landed.** `src/lib/membership-writes.ts:172-190` still catches `isUniqueViolation` inside the transaction, and `deferred-work.md:189-191` still tracks it as open.
- Process lesson "record the final validator result in the plan": partly landed. See P1.

## Action items

Proposed remediation, not applied: `../plan-epic-5-retrospective-remediation.md`. It passed plan-reviewer after fixes and holds one branch and PR into `feature/api-v1`.

1. **Developer: fix the ETag snapshot (F1, F2).** Stable ordering and a read-only REPEATABLE READ API read.
2. **Developer: add deletion records (F3, F4).** Cover trips, packing items, sections and lists, plus the children a date change cascades.
3. **Developer: fix the date-change confirmation and range (F5, F6, F11).** Count reservation files in the confirmation, reject reversed ranges, and test the dateless-overflow round trip.
4. **Developer: defer post-commit file removal in `updateTrip` (AV3).**
5. **Developer: keep the packing-list form on a failed create (F10).** Includes splitting out the 370-line overview component.
6. **Developer: log the deferred findings in `deferred-work.md`.** These are F8, F9, F12–F17, F19, AV1 and AV2.
7. **Process owner (ticket hygiene): update ticket and plan status at merge.** 5.6's plan frontmatter and 5.12's `tickets.toml` row need updating, and the step should be part of the story PR checklist (P2).
8. **Process owner: make the validator result a required field in plan Verification (P1).** This is a repeat of an epic-4 lesson.
9. **Process owner: add a cross-story invariant pass to future verify stories (P3).** Check ETag determinism, deletion records for every client-id resource, and replay windows, beyond mapping requirements to tests.
10. **Developer (carried over from epic 4): reproduce the invitation F3 conflict.** Still open in `deferred-work.md`.

## Decision records

- `docs/decisions/adr-packing-order-is-a-full-list-put-with-section.md`: packing order is a full-list PUT of `{ id, labelId }` rows, 409 on an id-set mismatch (story 5.2, PR #549).
- `docs/decisions/adr-trip-date-change-confirms-through-409-echo.md`: date changes that remove content answer 409 `confirmation_required` and apply on an echoed `confirmation`, recomputed under the lock (story 5.7, PR #556).
- Considered and not recorded: the snapshot ETag as a sha256 of the payload read in one REPEATABLE READ transaction (story 5.8). The user chose the two above.

## Acceptance verdict

**Accepted with open items** (user decision, 2026-11-21). All 12 stories merged (PRs #547-#561; 5.6 and 5.12 were merged but mis-marked). The fix-now findings (F1-F6, F10, F11, AV3) are fixed on `fix/epic-5-retrospective`, PR into `feature/api-v1`, per `../plan-epic-5-retrospective-remediation.md`. F7 is accepted. Open items: the deferred findings now in `deferred-work.md` (F8, F9, F12-F17, F19, AV1, AV2), the process actions 7-9, and the carried-over invitation F3 (action 10).

## Open questions

- Ticket hygiene (action 7): 5.6's plan frontmatter and 5.12's `tickets.toml` row still need their status corrected.
- Whether F8 (trip-create replay fingerprint) must land before the mobile outbox ships.
