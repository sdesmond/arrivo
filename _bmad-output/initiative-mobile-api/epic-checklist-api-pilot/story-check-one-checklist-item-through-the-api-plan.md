---
title: "Check one checklist item through the API"
type: feature
ticket: 1
created: "2026-11-07"
status: done
baseline_revision: "574163414ec12f5eeec5edf3b4b0a1d34b16889a"
route: full
route_source: auto
risk: high
review: thorough
review_source: auto
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [docs/plans/mobile-api.md, _bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent">

## Intent

Replace checklist checked-state toggling with one authenticated absolute-state API path, proving persistence through existing UI. Record phase 0 decisions for subsequent migration stories.

## Boundaries & Constraints

Branch: `story/1-1-checklist-api`; PR base: `feature/api-v1`. Preserve other actions, direct page reads, privacy, canonical mappers, activity and live sync. No migrations, env changes, other CRUD, generalized replay (entry 2), rapid-write ordering/optimistic continuity (entry 3), metadata/enforcement sweep (entry 4), or unrelated UI refactors. Existing checklist renders server state; retain that behavior while adding explicit refresh.

## I/O & Edge-Case Matrix

| State/input | Expected |
| --- | --- |
| Editor PATCH `/api/v1/checklist-items/:itemId`, `{isChecked:true}` or false | 200 mapped ChecklistItem; repeated value stays absolute; persists after reload |
| Missing/revoked session; pending enrollment | 401 unauthenticated; 403 mfa_enrollment_required |
| Viewer; stranger/missing item | 403 forbidden with requiredRole editor; 404 not_found |
| Malformed JSON/non-object; invalid fields/UUID | 400 bad_request; 422 validation_failed with fields |
| Missing web header, unsupported content type, cross-origin/site | 403 forbidden before write; no CORS |
| Exhausted budget; unexpected failure | 429 with Retry-After; sanitized 500 |

Every wrapper response uses JSON error envelope when failing and Cache-Control no-store. CSRF requires X-Arrivo-Client web and JSON/multipart, same-origin Fetch Metadata or matching Origin only when metadata absent, respecting forwarded origin and ports.

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/[tripId]/actions.ts`: toggle at 855 uses SQL NOT; other exports stay. Item ancestry helpers currently throw generic errors.
- `src/lib/auth-helpers.ts`: collaborator ranks and concealed page errors; `auth()` already checks revocation. `request-origin.ts` browserUrl reuses configured/forwarded origin unchanged.
- `src/lib/db-mappers.ts`: export existing private item mapper. `server-action-locks.ts` supplies transaction type/trip lock; current toggle has no lock.
- `src/components/arrivo/checklist-item-row.tsx`: callback traverses checklist/day cards/itinerary/tab body. ChecklistItem has 207 JSX lines; itinerary110, page133, all below250. Completion derives from server props.
- E2E mothers already seed checklists; use scenario-owned fixtures. `vitest.config.mts` explicitly includes helper tests.

## Tasks & Acceptance

Paths below are repository-relative; brace lists name individual files. Every runtime module below receives its matching colocated `.test.ts` or `.test.tsx`, updated first.

- [x] `docs/decisions/adr-api-{service-boundaries,staged-auth,access-statuses,cookie-csrf,contracts,client-mutations,overview-metrics}.md`: record seven phase0 decisions from source, including later session milestone, keyed ordering and metrics ADR supersession; mark existing metrics ADR superseded without changing metrics runtime.
- [x] `src/data/types.ts`: Actor. `src/lib/services/{trip-access,trip-write-effects,checklists}.ts`: typed access, success-only effects, validated absolute update and mapped result. Establish transaction ownership and lock/recheck ancestry/access before write, effects after commit. `src/lib/auth-helpers.ts` delegates access and conceals typed denials; test existing page behavior. Export/test item mapper in `src/lib/db-mappers.ts`.
- [x] `src/lib/api/{endpoint,errors,auth,csrf,route}.ts` and `contract/checklists.ts`: client-safe typed contract, wrapper gates, session enrollment restriction, validation/status matrix and no-store. `src/app/api/v1/checklist-items/[itemId]/route.ts` plus `route.test.ts`: thin PATCH adapter. `src/lib/rate-limit.ts` adds generous API budget; `src/proxy.ts` exposes only versioned path boundary. Update both matching tests.
- [x] `src/lib/api/client.ts` and `use-api-mutation.ts`: typed fetch, credentials/header/body, field errors, network failures, auth/enrollment navigation, successful router refresh. Tests assert no refresh on failure. Do not implement unused replay/ordering machinery.
- [x] `src/app/(app)/trips/[tripId]/{use-trip-detail-handlers,trip-itinerary-view,trip-detail-tab-body,page-client}` and `src/components/arrivo/{checklist-item-row,checklist-item,day-card-dnd,day-card-body,day-card}`: carry intended boolean; handler uses mutation helper. Update each matching test for true/false forwarding and API errors/refresh. Preserve old toggle action until removal story, cover coexistence in `actions.test.ts`. Associate touched inputs with labels; preserve focus, completion/collapse and viewer behavior; touched controls minimum44x44, titles, CSS tokens, Lucide1.5, explicit Props and use-client.
- [x] Before persistence scenarios, create/test `tests/e2e/api-response.ts` exact method/path matching, timeout and failed responses; include `api-response.test.ts` in `vitest.config.mts`. Update `tests/e2e/features/day-planning.feature` and `steps/day-planning.steps.ts`: arm PATCH wait before click, await then reload and assert completion. Add `features/api.feature` with `@feat:api` and `steps/api.steps.ts`: editor true/false persistence, viewer403, stranger404, unauthenticated401 and bad-input/CSRF cases. Use existing scenario-owned mothers; if fixture changes needed, update `tests/e2e/scenario-fixture.spec.ts` first.
- [x] `tests/e2e/feature-map.mjs` and `scripts/feature-map.test.mjs`: classify every new module immediately. API infrastructure in shared globs; explicit current-consumer mappings take precedence during tracer rollout. Day-planning/api reach checked-state modules; preserve other feature mappings.

**Acceptance Criteria:**

- Given signed-in editor and existing item, when checked and reloaded, then chosen state and completion display persist through PATCH.
- Given viewer or stranger, when PATCH attempted, then denial leaves item unchanged.
- Given unmigrated checklist operations, when existing lifecycle runs, then creation/edit/delete and page concealment retain behavior.
- Given failed mutation, when client handles response, then error is visible and no success refresh occurs.

## Implementation Notes

Pre-implementation plan-reviewer: scope, architecture, component, accessibility, and test checks passed; no blocking findings. Existing callback chain depth is a warning; retain it for this scoped migration and test intended boolean forwarding throughout.

Tests first: `src/lib/services/{trip-access,trip-write-effects,checklists}.test.ts`, `src/lib/api/{endpoint,errors,auth,csrf,route,client}.test.ts`, `src/lib/api/use-api-mutation.test.tsx`, `src/lib/api/contract/checklists.test.ts`, `src/app/api/v1/checklist-items/[itemId]/route.test.ts`, `src/lib/{auth-helpers,db-mappers,rate-limit}.test.ts`, `src/proxy.test.ts`, `src/app/(app)/trips/[tripId]/actions.test.ts`, `src/app/(app)/trips/[tripId]/{use-trip-detail-handlers,trip-itinerary-view,trip-detail-tab-body,page-client}.test.tsx`, `src/components/arrivo/{checklist-item-row,checklist-item,day-card-dnd,day-card-body,day-card}.test.tsx`, `tests/e2e/api-response.test.ts`, and `scripts/feature-map.test.mjs`. E2E: day-planning checklist completion persists after PATCH and reload; API editor true/false persistence, viewer/stranger/anonymous denial, and bad-input/CSRF rejection.

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Evidence and route |
| --- | --- | --- |
| Blind 1: unauthorized trip lock | medium | Viewer/stranger requests currently reach exclusive trip lock before membership denial. Patch: precheck editor access and retain transactional recheck. |
| Blind 2: multipart parsing | false | Current endpoint contract accepts JSON checked state; multipart is accepted by CSRF policy for future upload adapters, not promised as checked-state representation. No multipart endpoint exists in this slice. |
| Blind 3: drag target | medium | Listener-bearing inner span remains icon-sized; enclosing 44px wrapper does not enlarge hit area. Patch actual checklist handle target. |
| Blind 4: null error envelope | medium | JSON null dereferences failure.error and loses normalized API error. Patch decoded envelope guard and tests. |
| Blind 5: unexpected-error logging | low | Sanitized errors lack server diagnostics; no runtime logger contract exists for this path. Direct diagnostic correction with sanitized error name only; patch. |
| Blind 6: effects throw after commit | false | Activity catches scheduling/lookup failures, publication guards subscribers; valid trip path revalidation follows existing supported server context. Reviewer did not demonstrate reachable effect throw; no unsaved outcome established. |
| Blind 7: real revoked/enrollment endpoint coverage | low | Existing auth/session suites prove revocation and API resolver tests prove missing/enrollment mapping; mocked tests compose correctly. Add real revoked-session API regression as direct verification improvement; enrollment remains explicitly covered at resolver/wrapper boundary. |
| Blind 8: commit ordering unproven | medium | Immediate transaction mock cannot detect effects before commit or after rejected commit. Patch deferred/rejected commit tests. |
| Blind 9: optional requiredRole assertion | low | Viewer scenario can pass without requiredRole. Patch unconditional viewer-role assertion. |
| Blind 10: request size guard | low | Oversized authenticated payload can consume memory, but not encountered in normal boolean writes; reject additional streaming/size policy complexity in this slice. |
| Edge 1: drag target | medium | Independently confirms Blind 3; same patch group. |
| Gap 1: live-sync consumer coverage | medium | Publication test omits event type and existing browser scenario only covers old action. Patch exact event assertion and checklist PATCH second-tab live-refresh scenario. |
| Intent 1: exclusive write removal | false | Story explicitly requires legacy action coexistence during staged migration; current UI uses API exclusively. |
| Intent 2: uncheck proof split | low | False forwarding is tested across component chain and false API writes persist in browser. Add UI-originated uncheck/reload assertion as direct coverage improvement. |
| Intent 3: denied UI interaction | false | Viewers cannot invoke disabled controls; API denial is correctly exercised at request boundary. Enrollment/navigation has resolver/wrapper/hook tests. |
| Intent 4: rapid interaction continuity | false | Subsequent story owns ordering/optimism, per authoritative epic sequencing; absolute-state semantics are verified here. |
| Intent 5: recorded future migrations | false | Intent requests recording phase 0 decisions, not implementing later migrations; seven ADRs provide that record. |

## Verification

Run matching Vitest files first, including API wait helper, proxy, mapper, rate-limit, adapters and feature-map tests. Run practical day-planning/api Playwright subset. Final `build-validator` owns lint/types/build, then standalone coverage, then affected E2E sequentially; do not separately invoke full E2E. No commit/push authorization implied.



Final validation: ESLint passed (13 existing warnings, no errors); TypeScript passed after rerunning following generated-type/build race; production build passed with 18 static pages and the checklist PATCH route. Coverage: 406 files / 6694 tests passed; lines 97.63%, functions 97.16%, branches 93.26%. Affected detector selected full scope: 576 Playwright scenarios passed. Four review lenses completed; accepted fixes verified with 59 focused unit tests and 21 API/live-refresh browser scenarios. No findings deferred. No migration or environment changes required.
