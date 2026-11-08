---
type: initiative
title: "One versioned API for web and mobile"
parent: none
covers: [R1, R2, R3, R4, R5, R6, R7, R8, R9]
after: []
assignee: ""
risk: high
---

# One versioned API for web and mobile

## Description

Move Arrivo's signed-in web mutations and client-side reads onto a versioned JSON API, then reuse that API for mobile. Preserve direct service/query reads in Server Components. Deliver the web migration first; start unified sessions and mobile prerequisites when phone development begins. The proposal in `docs/plans/mobile-api.md` owns the detailed contracts and architectural decisions.

## Outcome

Web and mobile clients use the same authorized domain operations and stable contracts, with existing web behavior preserved and regression checks proving access control, persistence, and optimistic updates.

## Requirements

- R1: Record the shared API decisions in ADRs: service boundaries, auth staging, status codes, CSRF, contracts, client refresh and ordering, and replacement of the overview-metrics server-action decision. Source: Phase 0.
- R2: Deliver the foundation and trip-checklist pilot through services, contracts, route wrappers, and client helpers. Prove optimistic state survives refresh and order-sensitive writes persist correctly. Source: Phase 1 and Architecture sections 1–8.
- R3: Migrate trip notes, itinerary, documents and covers, and sharing through services and `/api/v1`, preserving upload policy and existing web flows. Source: Phase 2 and Endpoint inventory.
- R4: Migrate trips, packing, packing templates, reservations, budget, locations, and routing. Include the trip snapshot with an ETag. Source: Phase 3 and Mobile-ready from day one.
- R5: Migrate profile, signed-in account-security operations, and admin, including per-metric GET reads and enrollment-only access where required. Verify route-handler cookie clearing for session-ending operations. Source: Phase 4 and Auth boundary, group C.
- R6: Remove migrated server actions, restrict the remaining auth-boundary actions, update repository conventions and feature-map enforcement, and retain server-action waits only for auth flows. Source: Phase 5.
- R7: Preserve regression coverage throughout migration: colocated service, route, client, and component tests; API-specific E2E checks; feature-specific UI coverage; scenario-owned fixtures; complete feature-map registration. Source: Testing and each slice's migration steps.
- R8: When phone development starts, deliver unified database-backed sessions, API-based auth and link flows, session management, and Auth.js retirement. Preserve the decided session lifetimes and revocation rules, obtain a dedicated security review, and document migrations and the one-time upgrade sign-out. Source: Phase 6a.
- R9: Deliver mobile prerequisites: app sessions, capability metadata, a longer idempotency window, runtime response schemas, and generated OpenAPI with drift checks. Introduce delta sync only if snapshot measurements justify it. Source: Phase 6b.

## Done when

1. Web mutations and client-side reads covered by R2–R5 run through `/api/v1`; Server Components continue reading services or queries directly.
2. The checklist pilot demonstrates persistent edits and rapid ordered writes without optimistic flicker; API tests prove the documented auth, role, validation, CSRF, idempotency, and client-generated-ID behavior.
3. The web migration preserves existing feature behavior, passes project validation with affected E2E coverage, and leaves only the temporary auth-boundary server actions allowed by R6.
4. Phases 1–5 require no new migrations, environment variables, or reverse-proxy configuration for self-hosters.
5. At the later session milestone, web and app clients share the database-backed session resolver, Auth.js and the remaining server actions are retired, the security review is complete, and upgrade instructions explain migrations and sign-out.
6. Mobile contracts have runtime response schemas and generated OpenAPI with drift checks; app sessions and metadata support the phone client.

## Boundaries

Includes service extraction, versioned API contracts and handlers, web client migration, API test tooling, and the later unified-session and mobile-contract work described in the source. The native phone UI is outside this initiative. Server Component reads stay direct; phase 6 retains its source-defined start condition.

Shared constraints: use domain types from `src/data/types.ts`, existing validation schemas and DB mappers, existing storage adapters, and existing locking and write side effects. API v1 changes remain additive. Mutations support client-generated IDs, partial PATCH, absolute values, idempotent deletes, complete ordered ID lists, and idempotency keys as specified in the source.

First demonstrable path: a signed-in user changes a trip checklist through the component, API client, authenticated handler, service, and database, then reloads and sees the persisted result.

Epic ownership and build order live in tickets.toml beside this file. Sprint 1 is epic-checklist-api-pilot; its tickets.toml holds the planned implementation slices. Planning does not authorize implementation or assign calendar dates or capacity.

R3 is partitioned between itinerary (notes/events/days), documents-covers (files, attachment, promotion, covers/search), and sharing (membership/invitations). R4 is partitioned between trips-packing (trip lifecycle, packing, snapshot ETag), packing-templates, reservations-budget, and locations-routing. R5 is partitioned between profile, account-security (group C), and admin. R7 is shared: each epic owns regression coverage of its changes, pilot owns shared transport/test infrastructure, and cleanup owns final enforcement.

Trips-packing explicitly owns trip metadata including transit-actions.ts/updateTripTransitMode. Packing-templates owns saveTripListAsTemplate and its caller; trips-packing consumes it while migrating other list operations.

- Touch point: existing Auth.js session resolution and proxy — pilot consumes sessions and configures the public API boundary; unified-sessions later replaces the session system.
- Touch point: schema, DB singleton, mappers, and locking — each domain epic consumes existing infrastructure; pilot owns shared transaction/replay integration; only unified-sessions generates migrations.
- Touch point: storage adapter and upload policy — documents-covers owns document/cover integration; profile owns avatar integration.
- Touch point: activity and live sync — pilot owns the shared trip-write effects; each domain migration preserves its existing events.
- Touch point: feature map, test fixtures, and validation tooling — pilot establishes API ownership/waits, each domain updates its mappings and fixtures, cleanup enforces final route coverage.
- Touch point: repository API conventions and lint — web-api-cleanup owns temporary auth exceptions; unified-sessions removes them.

Shared decisions have one input home in docs/plans/mobile-api.md, Architecture; pilot entry 1.1 records phase 0 ADRs that downstream epics must cite. Later envelopes remain un-incepted. Their prerequisite declarations name required outputs; exact provider story IDs are pinned at inception. Current ordering conservatively serializes migrations that edit shared action modules, callback chains, fixtures, and feature-map configuration; no concurrent lanes are promised.

## References

- source — `docs/plans/mobile-api.md`, Direction, Scope, Architecture, Endpoint inventory, Phases, Testing, and Self-hosting.
- constraint — `AGENTS.md`, repository privacy, testing-first gate, plan-reviewer gate, and validation workflow.
- existing decision — `docs/decisions/adr-setup-token-lives-in-a-scoped-cookie-and-is-revalidated-per-request.md`; API-path cookie scoping supersedes it in phase 6a while preserving credential isolation.
- existing decision — `docs/decisions/adr-overview-metrics-refresh-through-per-metric-server-actions-without-persistence.md`; API metric GETs supersede it during migration.

## Notes

- Decision: 2026-11-07 — Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main.
- Story inheritance: Every epic, new story entry, pulled story file, and build plan in this initiative must carry the branch workflow. See AGENTS.md in this initiative folder.

- Decision: 2026-11-07 — User requested creation of this initiative from `docs/plans/mobile-api.md`.
- Decision: 2026-11-07 — User authorized splitting the initiative into epics and planning the checklist-pilot sprint; phase 0–1 is the first delivery scope.
- Deferred start: R8 and R9 begin when phone development starts, as required by the source; they remain part of the initiative's eventual completion criteria.
- Unknown: Auth.js cookie clearing from route handlers must be proven before migrating session-ending group C operations.
- Unknown: The pilot must establish how optimistic state spans refresh and how keyed mutation ordering handles rapid writes before other domains adopt the client pattern.
- Open question: Sprint duration and available capacity have not been supplied; no dates or estimates are assigned.
