---
title: "Create and list owned packing templates"
type: feature
ticket: 1
created: 2026-11-21
status: done
baseline_revision: "c4816de65c1b31f800cb32c96065a86f9bceb27f"
route: full
route_source: auto
risk: medium
review: "thorough"
review_source: "auto"
lenses_ran: ["blind-hunter", "edge-case-hunter", "verification-gap", "intent-alignment"]
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Creating a packing template relies on a server action, and API clients cannot list or create owned templates.

**Approach:** Add owner-scoped `GET` and idempotent `POST /api/v1/packing-templates`, move the web create caller to the endpoint with a draft-stable client UUID, and keep the page's direct server-rendered read.

## Boundaries & Constraints

**Always:** Story branch `story/6-1-create-list-templates-api` from the latest `feature/api-v1`; PR base `feature/api-v1`, verify before opening, switch back afterward. Test first. Reuse `normalizeTemplateName` limits. Ownership by `userId`; read rows through `dbTemplateToType`. No schema change.

**Never:** Migrate rename, delete, template items or `saveTripListAsTemplate`; change `page.tsx` reads; commit to the integration branch or target `main`.

## I/O & Edge-Case Matrix

| Scenario | Input / state | Expected behavior |
| --- | --- | --- |
| Create | `{id, name}` | Insert owned row, trim name, return `PackingTemplate`, revalidate `/packing` |
| List | Caller owns templates | `{templates}` ordered as `listTemplatesForUser`; other users' rows never appear |
| Same id retry | Same id and name | Return current row, no write, whatever key |
| Keyed replay | Same key and body | Stored response after rechecking auth; no second row |
| Id conflict | Same id, different name | 409 `conflict` |
| Foreign id | Id owned by another user | 404 `not_found`, no content exposed |
| Bad name | Blank or over limit | 422 `validation_failed`, no write |

</frozen-after-approval>

## Code Map

- `src/app/(app)/packing/actions.ts` — `createTemplateImpl`/`createTemplate` is the only create path; remove it, keep rename and delete. Tests in `actions.test.ts`.
- `src/app/(app)/packing/page-client.tsx` — `handleCreate` calls the action in a transition; switch to `useApiMutation` (`src/lib/api/use-api-mutation.ts`), mirroring the `draftId` ref pattern in `src/app/(app)/trips/use-trips-page-handlers.ts`: new `createRandomId()` only when the name changes, cleared on success. Close the dialog in `onSuccess`.
- `src/lib/services/trips.ts` `createTrip` — model for `db.transaction` + `withIdempotency` + `lockClientIds` + existing-row ownership 404 and `ConflictError`; `listTrips` for the GET shape.
- `src/lib/api/contract/packing.ts` — `defineEndpoint` conventions. New `src/lib/api/contract/packing-templates.ts`: `listPackingTemplates` (`GET`, strict empty body) and `createPackingTemplate` (`POST`, strict `{id: uuid, name}`; name trimmed, min 1, max `FIELD_LIMITS.templateName`).
- New `src/lib/services/packing-templates.ts`: `listPackingTemplates` via `listTemplatesForUser` (`src/lib/queries.ts`); `createPackingTemplate(actor, input, replay?)`.
- New `src/app/api/v1/packing-templates/route.ts` — `GET` and `POST` with `{ idempotent: {} }`; model on `src/app/api/v1/trips/route.ts`.
- `docs/api-v1.md` — add a `## Packing templates` section; `api-reference.test.ts` fails without it.
- `tests/e2e/feature-map.mjs` `templates` entry — add service, contract, route glob and `src/lib/api/contract/packing-templates.ts`; `scripts/feature-map.test.mjs` enforces it.
- `tests/e2e/features/templates.feature`, `steps/templates.steps.ts`, `api.feature`, `steps/api.steps.ts` (pull API fixtures near line 4415 show two-user and keyed-send helpers).

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/api/contract/packing-templates.test.ts`, `src/lib/services/packing-templates.test.ts`, `src/app/api/v1/packing-templates/route.test.ts` -- write first: strict body and name limits, list scoping, create, same-id retry, conflict, foreign 404, keyed replay, route wiring -- covers the matrix
- [ ] `src/app/(app)/packing/page-client.test.tsx`, `actions.test.ts` -- update for the endpoint call, stable id across a failed retry, new id after a name edit, error toast; drop create-action tests
- [ ] `tests/e2e/features/templates.feature` + steps, `api.feature` + steps -- await the create POST before reload; scenarios: create then reload, keyed replay yields one row, second user cannot list it, foreign id 404; scenario-owned fixtures only
- [ ] contract, service, route, `page-client.tsx`, `actions.ts` -- implement and remove the migrated action
- [ ] `docs/api-v1.md`, `tests/e2e/feature-map.mjs` -- document and register

**Acceptance Criteria:**

- Given a signed-in user, when they create a template in the web UI and reload, then it is listed once.
- Given a create retried with the same key or id, when it completes, then one row exists.
- Given another user's token, when they list, then they see none of the first user's templates.
- Given rename, delete, items and save-as-template, when exercised, then they behave as before.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| docs/api-v1.md invalid UTF-8 separators | false | rejected | File bytes are valid UTF-8 `·`, same as lines 226/236; diff-file artifact. |
| Page does not refresh list after create | false | rejected | `useApiMutation` calls `router.refresh()` after success. |
| Missing create error toast | false | rejected | `useApiMutation` toasts `error.message`. |
| Draft id keyed on raw name, not trimmed | low | patch (applied) | Contract trims, so padded retry minted a new id; keyed on `name.trim()`, test added. |
| Draft id survives dialog cancel | low | rejected | Same id + same name is idempotent; matches trips pattern. |
| Contract re-implements name rules vs `normalizeTemplateName` | low | rejected | Both use `FIELD_LIMITS.templateName`; drift is hypothetical. |
| `TripNotFoundError` reused for templates | low | rejected | Naming only; matches existing services. |
| No revalidate on same-id retry / keyed replay | false | rejected | Client refresh comes from the hook; no stale-cache path shown. |
| PK race across users | false | rejected | `lockClientIds` on `packing-template:<id>` serializes it. |
| No second-user-token list scenario | low | rejected | Scoping is by `actor.userId`; scenario proves foreign row absent. |
| No 422 / templates.feature reload scenario | false | rejected | 422 unit-covered; existing "keep it after reload" scenario drives the migrated path. |
| Plan file sections empty / blind-hunter test hygiene | low | rejected | Process notes; no user or developer harm named. |

## Verification

**Commands:**

- `npx vitest run src/lib/services/packing-templates.test.ts src/lib/api src/app/api/v1/packing-templates "src/app/(app)/packing"` -- expected: pass
- `npm run test:e2e:affected` -- expected: pass
- `build-validator` once after targeted checks pass.
