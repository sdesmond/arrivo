---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-07-12/prd.md
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-07-12/addendum.md
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-07-12/review-rubric.md
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-07-12/.decision-log.md
  - _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/EXPERIENCE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/review-accessibility.md
  - _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/review-rubric.md
  - _bmad-output/project-context.md
  - docs/drizzle-workflow.md
workflowType: "architecture"
lastStep: 8
status: "complete"
completedAt: "2026-07-13"
project_name: "packt"
user_name: "Spencer"
date: "2026-07-12"
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

16 FRs across 6 feature groups:

- Now Card Distance & Navigation (FR-1–3): live distance/time to Next Event, geolocation hint, one-tap open to External Maps.
- Optional Location Behavior (FR-4–5): Freeform Items stay first-class; no silent geocoding from title text.
- Transit Mode Defaults & Overrides (FR-6–9): trip-level "Getting Around" default (walk/drive/transit/smart), seeded deterministic default, data model must leave room for post-MVP account-level pref/distance-exception/per-hop override without those shipping now.
- Day Route Strip & Schedule Awareness (FR-10–12): route summary + thumbnail for days with ≥2 Located Items, schedule conflict detection (day + row level).
- Address Pill State-Flip (FR-13): filled Address's primary action becomes "open External Maps"; edit moves to a secondary affordance.
- Map Tab with Day Selector (FR-14–16): whole-trip and day-scoped map of Located Items, deep-link from Day Route Strip.

**Non-Functional Requirements:**

- **Performance:** Now Card distance/directions lookup must not block initial page render; architecture must set an explicit latency target. Planning views must avoid recomputing routes on every render.
- **Cost:** Directions/map usage bounded via on-demand lookup + caching; architecture must define a monthly request budget or equivalent guardrail; provider choice needs a technical spike (cost/rate limits unvalidated).
- **Reliability:** Any failure to calculate distance, time, tiles, or route degrades to today's itinerary behavior plus direct External Maps access wherever Coordinates exist — never blocks the surface.
- **Privacy:** Geolocation requested only for user-visible value, used transiently — no persistent storage of live device location.
- **Accessibility:** WCAG 2.2 AA floor; all new/resized interactive targets meet the existing 44×44px minimum on both axes; Schedule Conflict indicators always pair icon + text; live-updating content (distance ticking down, conflict badges) has defined `aria-live` behavior (polite for user-caused changes, none for passive ticking).
- **Security:** All new server actions/route handlers preserve existing `requireUser()` + `assertTripAccess()` pattern.

**Scale & Complexity:**

- Primary domain: full-stack web (Next.js App Router + Postgres/Drizzle backend + client-side browser geolocation).
- Complexity level: medium-high — no new tenancy/compliance dimensions, but real new-dependency risk (direction provider + interactive map library, neither committed yet) and a new async-computation domain (route/distance) threaded through 4 existing surfaces.
- Estimated architectural components: shared route/distance calculation service; Trip Transit Default data model + "Getting Around" UI; Now Card distance/geo-hint pill (2-zone row restructure); Address ButtonGroup restructure + `PlaceRowActionBar` 44px resize; Day Route Strip + Schedule Conflict detection; Map Tab (new interactive map dependency + day selector).

### Technical Constraints & Dependencies

- Coordinates already exist on Events/Reservations via `@mapbox/search-js-core` autocomplete — no new geocoding needed.
- Confirmed via `package.json` and codebase grep: only `@mapbox/search-js-core` (search/autocomplete) is installed. No interactive map SDK (`mapbox-gl`, `react-map-gl`, etc.) exists yet — Map Tab requires adding one. Given the app is already on Mapbox for geocoding, Mapbox GL JS is the natural default, but provider/library choice remains an open architecture decision (PRD §13.1 Q3).
- `src/app/api/mapbox/static/route.ts` — existing static-image proxy, currently unused; may or may not be reused for lightweight thumbnails (e.g. Day Route Strip) instead of a full interactive dependency there.
- Direction provider (likely Mapbox Directions API per brainstorming notes) needs cost/rate-limit validation before commitment — no current usage to benchmark against.
- Trip Transit Default needs a new schema field(s) in `src/db/schema.ts` (Drizzle) — must be shaped to extend toward account-level preference / per-hop override later without a breaking migration.
- Dead code to reconcile during implementation: `now-card.tsx` hardcoded distance placeholder (`now-card.tsx:196-197`), `RailPanel`/`mini-map-rail.tsx` family (not a layout constraint, safe to ignore or remove).

### Cross-Cutting Concerns Identified

- **Shared route/distance calculation module** — must serve Now Card, Day Route Strip, Schedule Conflict detection, and Map Tab without duplicated fetch/compute logic or redundant provider calls.
- **External provider selection** — direction/distance API and interactive map library, both currently unvalidated, both gated by cost/rate-limit spike before commitment.
- **Caching strategy** — needed across all 4 consuming surfaces to hit the performance NFR (no render-blocking) and cost NFR (bounded request volume).
- **Geolocation handling** — client-side only, user-initiated permission flow, transient use, no persistence.
- **Data model extensibility** — Trip Transit Default must not box out post-MVP account-level preference, distance-threshold exception, or Per-Hop Override.
- **Shared component ripple** — `PlaceRowActionBar`'s Address chip and every other chip (Time/Cost/Docs/Attach) resize to 44px in the same pass; Next Event row splits into two sibling DOM nodes. Both are structural changes to widely-shared components, not isolated additions.

## Starter Template Evaluation

**Not applicable.** This is a brownfield feature built onto an existing, already-established Next.js codebase (see project-context.md for the full stack: Next.js 16.2.4, React 19.2.4, TypeScript strict, Tailwind v4, `@base-ui/react` + shadcn, Drizzle + PostgreSQL, Auth.js v5). No starter template scaffolding applies.

The one foundational technology choice this feature does require — an interactive map library for the Map Tab — is an architectural dependency decision, not a starter-template decision, and is carried forward into the Architectural Decisions section (step 4).

## Core Architectural Decisions

### Decision Priority Analysis

**Already Decided (existing app-wide stack, not re-decided here):** Database = PostgreSQL + Drizzle ORM; Auth = Auth.js v5 with `requireUser()`/`assertTripAccess()`; API pattern = Next.js Server Actions; Frontend = Next.js App Router + React 19 + Tailwind v4 + Base UI/shadcn; Hosting = Vercel.

**Critical Decisions (Block Implementation):**

- Direction/distance provider — Mapbox Directions API
- Interactive map library — MapLibre GL JS
- Distance/route caching strategy — shared server-side cache table

**Important Decisions (Shape Architecture):**

- Now Card live-update cadence
- Trip Transit Default data model + seed value
- Schedule Conflict threshold model

### Location & Mapping Infrastructure

**Direction/distance provider: Mapbox Directions API.** Free tier covers 100k requests/month, then $2/1k (100k–500k) and $1.60/1k (500k–1M). Reuses the existing Mapbox account/token already in place for `@mapbox/search-js-core` address autocomplete — no new vendor relationship. Resolves PRD §13.1 open question #3 (provider choice) and gives the Cost NFR its concrete guardrail (monthly free-tier budget, with pay-as-you-go beyond it).

**Interactive map library: MapLibre GL JS** (MIT license), rendering Mapbox-hosted vector tiles/styles. MapLibre is a rendering layer only — it has no hosted directions or geocoding service of its own. The Directions API (above) and the existing `@mapbox/search-js-core` autocomplete remain Mapbox regardless of this choice; MapLibre only replaces the proprietary-TOS Mapbox GL JS renderer for Map Tab's pan/zoom/pin display, avoiding vendor lock-in on the one piece that has a license-free equivalent.

**Distance/route caching:** a shared server-side cache table keyed by (origin coordinates, destination coordinates, transit mode) → distance, duration, `fetched_at`, with a 24-hour TTL. Read through one shared calculation module consumed by all 4 surfaces that need route data (Now Card, Day Route Strip, Schedule Conflict, Map Tab) — no surface calls the Directions API directly. Satisfies the Performance NFR (no per-render recomputation) and Cost NFR (bounded request volume).

**Now Card live-update cadence:** distance/time to the Next Event refreshes every 60 seconds while the Now Card is visible and the tab has focus, paused when backgrounded. Each tick takes a single `getCurrentPosition()` reading (not `watchPosition()` streaming) to avoid battery drain. Matches the Accessibility Floor's existing commitment that passive distance/time updates are never wrapped in an assertive live region.

### Data Model: Transit Mode Preference

> **SCOPE AMENDMENT — reverses a PRD-finalized decision. [RATIFIED 2026-07-13]** PRD §4.3/§13 originally deferred account-level Transit Mode preference and the distance-threshold "walk if close" exception to post-MVP, with a PM-confirmed resolution: *"Transit Mode MVP is trip-level only. Account-level preference, distance-threshold exception, and Per-Hop Override remain post-MVP product questions."* This decision pulls both forward into MVP and drops the "smart" mode option from FR-6's mode list (in MVP, "smart" was scoped as a no-op placeholder per FR-7 — it always fell back to the deterministic default — so this replaces an undefined stub with concrete behavior rather than removing working functionality). **PM ratified this amendment on 2026-07-13** — `prd.md` §4.3/FR-6/FR-8/§6.2/§12/§13.2 now state this scope directly; downstream artifacts (DESIGN.md, EXPERIENCE.md, epics.md) are reconciled to match. See `prd.md`'s `.decision-log.md` for the ratification entry.

Mirrors the existing currency preference pattern exactly (verified against `schema.ts` and `trips/actions.ts`): a nullable global default on `users`, resolved-and-copied into a trip's own stored value at creation, edited independently thereafter — not a live fallback join.

**Global preference — `users` table (new columns):**

- `transitMode`: text, nullable — `walk | drive | transit` (no "smart"). Global default mode.
- `walkThresholdMeters`: integer, nullable — when set, any individual hop shorter than this distance uses `walk` for that hop specifically, overriding whichever mode is otherwise in effect. Stored in meters internally regardless of the user's existing `distanceUnit` display preference (km/mi), converted only for display.

**Trip preference — `trips` table (new column):**

- `transitMode`: text, nullable — its own stored value. Seeded once at trip creation: `input.transitMode ?? user.transitMode ?? "drive"` (same resolution shape as `budgetCurrency ?? preferredCurrency ?? detectPreferredCurrency(...)`). After creation, edited independently via the trip's "Getting Around" section with no ongoing reference back to the global value — exactly like `trips.budgetCurrency` vs. `users.currency`.

**Per-hop resolution** (used by the shared calculation module from Decision 1c): for each hop, `effectiveMode = (user.walkThresholdMeters is set AND hopDistance < walkThresholdMeters) ? "walk" : trip.transitMode`. The threshold check always reads the user's global setting live, per hop — it is not itself seeded onto the trip. `trip.transitMode` is the fallback whenever a hop doesn't qualify for the walk exception.

**Flagged UX/PRD follow-up — [RESOLVED 2026-07-13]:** DESIGN.md's Getting Around segmented control now specs 3 segments (walk/drive/transit); the walk-threshold has its own input surface on the profile page (`src/app/(app)/profile/page.tsx`) alongside `distanceUnit`/`currency`, as recommended here — see DESIGN.md's `transit-preference-fields` token and EXPERIENCE.md's matching Component Patterns/State Patterns rows.

### Schedule Conflict Threshold Model

Resolves PRD §13.1 open question #4 (strict vs. buffered threshold).

- **Strict** (`travel_time > scheduled_gap`) rejected — noisy false positives on a 1-minute overage against an inherently imprecise estimate.
- **Buffer model — selected.** Flag a conflict only when `travel_time + 10 minutes > scheduled_gap`. A fixed 10-minute buffer applied uniformly regardless of transit mode for MVP; absorbs Directions API estimate variance and matches the PRD's own noise-mitigation intent ("use two-tier non-modal indicators"). Per-mode buffer tuning is a reasonable post-MVP refinement if the flat buffer proves miscalibrated in practice, not required for launch.

### Authentication & Security

No new pattern — every new server action (saving trip-level "Getting Around" mode, saving global profile preferences) follows the existing `requireUser()` + `assertTripAccess("editor")` convention. New requirement specific to this feature: **Directions API calls happen server-side only** (Server Action or route handler), never client-side — reusing the existing Mapbox token already used by the static-image proxy rather than provisioning a second one.

### API & Communication Patterns

No new pattern beyond Server Actions. The directions/distance lookup is a Server Action, not a public route handler, so no new rate-limiting middleware is needed — request volume is bounded by the Decision 1c cache table, not by gatekeeping a public endpoint.

### Frontend Architecture

No new pattern beyond the existing `page.tsx`/`page-client.tsx` split. MapLibre GL JS mounts inside a client component. Map Tab's day-scope state uses the existing `?tab=map` URL search-param convention (already Packt's pattern, per PRD assumption) rather than introducing new global state.

### Infrastructure & Deployment

No new pattern. Cost-guardrail monitoring for the Directions API budget relies on Mapbox's own account-level usage dashboard/alerts rather than building custom in-app metering — the simplest sufficient option for an MVP guardrail.

### Decision Impact Analysis

**Implementation sequence note:** the transit-mode schema changes should land in the first PR regardless of the PRD's UI-facing build order (§10), because Now Card (build step 1) already needs to read `trip.transitMode` through the per-hop resolver before the "Getting Around" UI (build step 3) exists to edit it. Schema isn't sequenced by feature-visibility order — it's a prerequisite for step 1.

**Cross-component dependencies:**

- The shared calculation module (Decision 1c) must exist before Day Route Strip, Schedule Conflict, or Map Tab can be built, but Now Card can ship against a minimal slice of it (single origin→destination lookup) ahead of the full day/multi-hop iteration logic.
- Trip Transit Default's per-hop resolver is a hard dependency of both Day Route Strip and Schedule Conflict detection — neither can compute correctly without it.
- MapLibre GL JS (Decision 1b) is only a Map Tab dependency — it doesn't block Now Card, Address Pill, Getting Around, or Day Route Strip (whose thumbnail can ship as a static asset before the full interactive map exists, per the PRD's own note that the strip may ship before Map Tab).

## Implementation Patterns & Consistency Rules

Most naming/structure/format conventions are already fixed app-wide (see project-context.md: const-object enums, `ComponentNameProps`, colocated tests, `cn()`, CSS custom properties, Server Actions, `db-mappers.ts`). This section covers only the new conflict points this feature introduces.

### Naming Patterns

- **Canonical component name:** `DistanceTimePill` / `distance-time-pill.tsx` — resolves the UX pair review's flagged inconsistency ("Next Event distance pill" vs. "Distance/Time pill"). Matches EXPERIENCE.md's Component Patterns table and the PRD glossary's "Distance/Time Line."
- **`TransitMode` type:** const object + union per project convention — `TransitMode = { Walk: "walk", Drive: "drive", Transit: "transit" } as const`. No "smart" value.
- **Cache table:** `route_cache` — columns `origin_lat`, `origin_lng`, `destination_lat`, `destination_lng`, `transit_mode`, `distance_meters`, `duration_seconds`, `fetched_at`, snake_case per existing schema convention.
- **Shared calculation module:** `src/lib/route.ts` — mirrors the existing domain-logic-in-`lib` pattern (`src/lib/currency.ts`'s `recalculateAll`), not `utils.ts` (too generic for this much domain logic).

### Structure Patterns

- **New server actions:** trip-level Getting Around mutations go in a new colocated file `src/app/(app)/trips/[tripId]/transit-actions.ts` (existing `actions.ts` in that route is already large); the global preference mutation (`transitMode`, `walkThresholdMeters`) reuses the existing profile actions file.
- **Map Tab component:** `src/components/packt/map-tab.tsx` — standard domain-component convention, no exception.

### Format Patterns

- **Distance/duration storage:** plain integer columns (`distance_meters`, `duration_seconds`) — explicitly **not** the existing numeric-string currency convention (`numeric().toString()` + `db-mappers.ts` parsing), which exists specifically for decimal-precision money values. Distance/duration are whole-unit measurements with no comparable precision requirement.
- **Route calculation result shape:** one discriminated union consumed by all 4 surfaces (Now Card, Day Route Strip, Schedule Conflict, Map Tab): `RouteResult = { status: "loading" } | { status: "ready"; distanceMeters: number; durationSeconds: number } | { status: "unavailable" }`. This is what makes the skeleton-fill / resolved / graceful-degradation states in EXPERIENCE.md's State Patterns table implementable consistently instead of each surface inventing its own loading-boolean shape.

### Process Patterns

- **Directions API failure handling:** any failure (timeout, rate limit, provider error) resolves to `{ status: "unavailable" }`, never a thrown error — directly implements the Reliability NFR ("degrade to existing itinerary behavior plus direct External Maps access").

### Enforcement Guidelines

**All implementing agents MUST:**

- Use `RouteResult`'s discriminated union for every surface consuming route/distance data — no surface invents its own loading-boolean shape.
- Store distance/duration as plain integers, never route them through the currency numeric-string/`db-mappers.ts` pattern.
- Resolve transit mode per hop through the shared resolver (`effectiveMode` logic from Category 2), never read `trip.transitMode` directly in a UI component.
- Call all Directions API requests server-side only (Server Action or route handler) — never expose the Mapbox token to the client.

## Project Structure & Boundaries

Packt already has a full established tree (see `AGENTS.md`'s Directory Structure section) — not regenerated here. Verified against the actual codebase; this is the delta this feature adds or touches.

### New & Modified Files

```
src/
├── db/
│   └── schema.ts                              [MODIFY] + users.transitMode, users.walkThresholdMeters,
│                                                          trips.transitMode, new route_cache table
├── lib/
│   ├── route.ts                                [NEW] shared calc module: Directions API call,
│   │                                                   route_cache read/write, per-hop resolver,
│   │                                                   RouteResult discriminated union
│   └── route.test.ts                           [NEW]
├── components/packt/
│   ├── distance-time-pill.tsx                  [NEW] single component, internal state switch
│   │                                                   (geo-hint ↔ distance/time) — one stable DOM
│   │                                                   node per Accessibility Floor's focus-continuity rule
│   ├── distance-time-pill.test.tsx             [NEW]
│   ├── now-card.tsx                            [MODIFY] Next Event row → two sibling zones;
│   │                                                      remove now-card.tsx:196-197 placeholder
│   ├── now-card.test.tsx                       [MODIFY]
│   ├── place-row-action-bar.tsx                [MODIFY] Address chip → shadcn ButtonGroup (2 segments);
│   │                                                      all chips resized to 44×44px
│   ├── place-row-action-bar.test.tsx           [MODIFY]
│   ├── place-row.tsx                           [MODIFY] Schedule Conflict row icon (aria-hidden +
│   │                                                      sr-only span, mirrors tab-status-icon.tsx)
│   ├── place-row.test.tsx                      [MODIFY]
│   ├── getting-around-section.tsx              [NEW] trip-edit segmented control, 3 segments
│   ├── getting-around-section.test.tsx         [NEW]
│   ├── day-route-strip.tsx                     [NEW]
│   ├── day-route-strip.test.tsx                [NEW]
│   ├── map-tab.tsx                             [MODIFY] replaces existing placeholder
│   ├── map-tab.test.tsx                        [MODIFY/NEW]
│   ├── mini-map-rail.tsx                       [REMOVE] dead code (RailPanel family, addendum-confirmed)
│   └── mini-map-rail.test.tsx                  [REMOVE]
├── app/(app)/
│   ├── trips/[tripId]/
│   │   ├── transit-actions.ts                  [NEW] Getting Around trip-level mutation
│   │   │                                              (requireUser + assertTripAccess("editor"))
│   │   ├── transit-actions.test.ts             [NEW]
│   │   ├── trip-detail-tab-body.tsx            [MODIFY] wires Day Route Strip + Map Tab
│   │   └── trip-detail-tab-body.test.tsx       [MODIFY]
│   └── profile/
│       ├── preferences-section.tsx             [MODIFY] add global transitMode + walkThresholdMeters
│       │                                              inputs, alongside existing currency/distanceUnit
│       ├── preferences-section.test.tsx        [MODIFY]
│       └── actions.ts                          [MODIFY] global preference mutation
└── data/
    └── types.ts                                [MODIFY] TransitMode, RouteResult types
```

**Open, not decided here:** whether `src/app/api/mapbox/static/route.ts` (existing, unused) gets reused for the Day Route Strip thumbnail or stays dead — doesn't block any other structural decision, can be resolved at story-creation time.

### Architectural Boundaries

- **Data boundary:** all route/distance reads go through `src/lib/route.ts` — no component or action queries `route_cache` or calls the Directions API directly.
- **Component boundary:** `DistanceTimePill` and the Address `ButtonGroup` segments are DOM siblings, never nested inside `now-card.tsx`'s/`place-row-action-bar.tsx`'s existing interactive elements (Next Event `Link`, Address button) — per the accessibility review's nesting-hazard findings.
- **Server/client boundary:** `transit-actions.ts` and `route.ts` are server-only; geolocation (`getCurrentPosition()`) is client-only, confined to wherever `DistanceTimePill`/Now Card's client component lives.

## Architecture Validation Results

### Coherence Validation ✅

All technology choices are compatible (Mapbox Directions API + MapLibre GL JS both consume the same Mapbox-hosted data; MapLibre's license independence doesn't affect the Directions API relationship). Patterns align with decisions (naming, structure, and process patterns all derive directly from Category 1/2 decisions, no contradictions found). Structure supports the architecture (every new file maps to a specific decision; no orphaned decisions without a file, no files without a decision backing them).

### Requirements Coverage Validation ✅

All 16 FRs trace to an architectural decision: FR-1–3 (Now Card) → Decisions 1a/1c/1d + `DistanceTimePill`; FR-4–5 (Freeform preservation) → correctly no new logic added; FR-6–9 (Transit Mode) → Category 2 data model; FR-10–12 (Day Route Strip/Schedule Conflict) → shared calc module + buffer model; FR-13 (Address Pill) → `ButtonGroup` restructure; FR-14–16 (Map Tab) → MapLibre + `map-tab.tsx`. All 6 Cross-Cutting NFRs (Accessibility, Privacy, Performance, Reliability, Cost, Security) have concrete architectural backing after the resolutions below.

### Gap Analysis Results

**Resolved during validation:**

- **Cost guardrail on the Now Card 60s cadence.** Initial validation flagged this as Critical, assuming SaaS-scale concurrent usage against a shared Mapbox account. Corrected: Packt is self-hosted, each instance serving a small user base and (presumably) its own independent Mapbox account/token — a flat 60-second cadence with no additional throttling is nowhere near the 100k/month free tier at that per-instance scale. A movement-gate optimization was considered and rejected: it would introduce a real correctness gap for drive-mode duration (real-time traffic can shift driving time even when the device hasn't moved, which a pure movement gate would miss), to solve a cost problem that doesn't exist at Packt's actual deployment scale. **Decision 1d stands unmodified: flat 60-second cadence, no movement gate.**
- **Explicit latency target (PRD-mandated, was missing).** Directions API calls time out at **3 seconds**; on timeout, `RouteResult` resolves to `{ status: "unavailable" }` — the same path as any other provider failure, never blocking the Now Card render.

**Important, not blocking (deferred to story-creation time):**

- Day Route Strip thumbnail rendering approach (reuse the existing unused `src/app/api/mapbox/static/route.ts` proxy vs. a new approach) — doesn't block any other structural decision.

**Nice-to-have, deferred to implementation time:**

- Request deduplication for overlapping hop calculations when multiple components on the same page render request the same hop simultaneously (e.g., Day Route Strip + Schedule Conflict). Reasonable to resolve with React's `cache()` at implementation time rather than architecture.

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — every FR and Cross-Cutting NFR traces to a concrete decision; the one Critical gap found during validation was resolved by correcting a scale assumption (SaaS vs. self-hosted) rather than by adding new complexity.

**Key Strengths:**

- Transit Mode data model mirrors an already-proven in-app pattern (currency), reducing implementation risk.
- Shared `route.ts` calculation module gives all 4 consuming surfaces one code path, one cache, one failure-handling contract (`RouteResult`).
- Explicit scope amendment (Transit Mode account-level preference + distance-threshold exception pulled forward from post-MVP) is documented with rationale, not silently absorbed — flagged for PRD follow-up.

**Areas for Future Enhancement:**

- Day Route Strip thumbnail rendering technique (resolve at story-creation time).
- Request deduplication across simultaneous same-hop lookups (resolve at implementation time).
- Per-Hop Override (FR-9) and account-level distance-threshold refinement remain intentionally post-MVP; no architecture defined for them yet.

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions exactly as documented above.
- Use implementation patterns (naming, `RouteResult` shape, integer distance/duration storage) consistently across every component touching route/transit data.
- Respect project structure and boundaries — route/distance access always through `src/lib/route.ts`, never direct.
- Refer to this document for all architectural questions during story creation and implementation.

**First Implementation Priority:** Schema changes (`users.transitMode`, `users.walkThresholdMeters`, `trips.transitMode`, `route_cache` table) — must land before Now Card (PRD build step 1) since it already depends on the per-hop resolver.

