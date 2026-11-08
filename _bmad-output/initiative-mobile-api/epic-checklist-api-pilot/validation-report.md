# Checklist pilot planning validation

Date: 2026-11-07.

Original request: Turn docs/plans/mobile-api.md into a sprint, create the initiative, then split it into epics and plan the checklist-pilot sprint. Implementation has not been requested.

Artifacts: epic-checklist-api-pilot.md and tickets.toml in this folder; initiative-mobile-api.md, the initiative tickets.toml, and all epic envelopes in the parent tree.

## BMad ticket checks

Independent Tree/Dependencies and Ticket/Set/Dependencies checks passed after corrections.

- Assigned transit-actions.ts/updateTripTransitMode to trips-packing and saveTripListAsTemplate to packing-templates.
- Included the ninth checklist action, addChecklistFromPackingSource, in the pilot.
- Moved the tested API response wait and initial feature registration into the first usable slice.
- Recorded implementation questions as owned objectives rather than hidden readiness blockers.
- Explained prerequisite edges and shared-file collisions; each future epic pins provider story IDs when incepted.
- Confirmed R1–R9 ownership, P1–P9 story coverage, a first runnable tracer, bounded refactor sweep, integrated verification, and the deferred mobile start.

## PLAN REVIEW

SCOPE          PASS
ARCHITECTURE   PASS
COMPONENT      PASS
ACCESSIBILITY  PASS
TEST COVERAGE  PASS

### Scope

No blocking issues found. The pilot implements source phases 0–1; other epics remain envelopes. The shared API abstractions and security controls are explicitly required by the source. Cleanup is restricted to pilot-created duplication and obsolete checklist adapters. No native UI, session rewrite, calendar estimate, or unrelated feature work is added.

### Architecture

No issues found. Domain types remain in src/data/types.ts; contracts and clients stay free of server-only imports; actor-explicit services preserve canonical mapping, shared locks, mixed timeline positions, and write effects. Pages keep direct reads. Auth, CSRF, typed failures, fresh authorization before replay, and atomic replay recording are explicit. Schema migration is excluded from this sprint.

### Components

No blocking issues found. Existing checklist presentation and route-level client components are reused; no duplicate widget is planned. Explicit Props interfaces and use-client declarations are retained. Inspected main render blocks in checklist-item.tsx (127–333), trip-itinerary-view.tsx (159–268), page-client.tsx (253–385), day-card-body.tsx (195–250), and day-card-dnd.tsx (136–257) are each below 250 JSX lines despite some larger total files. Any touched region that grows beyond the limit must be split with colocated tests. The plan covers the existing day-card callback chain if signatures change and permits local mutation ownership to avoid extending it.

### Accessibility

No issues found. Existing keyboard behavior, focus, form labels, completion indicators, and announcements are preserved. Touched controls retain 44-by-44 targets and icon titles; styles use existing tokens and font fallbacks. No new dialog or interaction pattern is introduced.

### Test coverage

No blocking issues found. Named colocated tests cover service, access, side effects, contract, auth, wrapper, CSRF, replay, client, mutation hook, route handlers, proxy, rate limits, helpers, and affected component/callback files. E2E files and steps are explicit for checklist lifecycle, packing-source insertion, API status/access/CSRF/replay, delayed refresh, rapid writes, and persistence. Each new runtime file is mapped in its own entry; fixtures remain scenario-owned. Tests precede runtime changes, targeted checks precede the project-owned final validator, and full E2E is not launched automatically.

TOTAL: 0 BLOCKING | 1 WARNING

Branch-policy follow-up: Reviewed the requested documentation-only change across scope, architecture, components, accessibility, and test intent. All 14 epic envelopes and all 10 existing story entries explicitly use feature/api-v1 as their story-branch starting point and PR base. Initiative-scoped AGENTS.md requires future entries, pulled story files, and build plans to retain this policy; tickets.py copies entry notes and references when pulling. No runtime behavior, story scope, or dependency edges changed; no new blocking findings.

Warning: Sprint duration and capacity are unspecified. Ten planned implementation slices establish scope and build order, not a commitment to finish within a fixed calendar sprint. Entry 1 is broad because it crosses every layer; the builder must keep it to the one usable checked-state path and defer only the already assigned replay/concurrency/metadata capabilities to entries 2–4.
