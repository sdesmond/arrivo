---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/prds/prd-packt-2026-06-12/prd.md
  - _bmad-output/ux-designs/ux-packt-2026-06-13/DESIGN.md
  - _bmad-output/ux-designs/ux-packt-2026-06-13/EXPERIENCE.md
  - _bmad-output/project-context.md
workflowType: "architecture"
project_name: "Packt"
user_name: "Spencer"
date: "2026-06-13"
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

13 FRs across 3 features, all from `_bmad-output/prds/prd-packt-2026-06-12/prd.md` (status: final):

- **Reservations Tab (FR-1–FR-6)**: CRUD for a new `Reservation` entity (type, startTime, endTime?, provider, confirmationCode?, notes?), grouped-by-type accordion UI, document attachments via `Document.scope = "reservation"`, empty state.
- **Itinerary Integration (FR-7–FR-11)**: Reservations project 1–2 computed "Linked Events" onto the Itinerary (Check-in/Check-out, Pickup/Return, Departure/Arrival/Return per type); Reservations can extend the trip's date range and trigger Day re-numbering (FR-8); Now Card surfaces Linked Events (FR-10); tapping a Linked Event redirects to the Reservations tab (FR-11, no inline edit).
- **Cover Overflow Menu (FR-12–FR-13)**: new "⋯" menu on `trip-hero.tsx` (Edit Cover / Remove Cover / Info, conditional on `CoverType`), reusing `now-card.tsx`'s overflow pattern; cover controls removed from `trip-edit-sheet.tsx` / `trip-edit-cover.tsx`.

**Non-Functional Requirements:**

- WCAG AA accessibility floor (inherited Packt standard, extended with specific aria patterns in `EXPERIENCE.md`'s Accessibility Floor — accordion accessible names, click-to-edit keyboard support, paired date/time fieldsets, Linked Event row labeling).
- Existing coverage thresholds (≥95% lines/functions, ≥90% branches on `src/lib/**` and `src/components/packt/**`) and existing testing pyramid (Vitest unit + Playwright-BDD E2E) apply unchanged.
- No new performance, offline, or real-time requirements — Reservations/Linked Events are server-rendered/revalidated like existing trip data, no live sync needed.

**Scale & Complexity:**

- Primary domain: full-stack web (Next.js App Router, Postgres/Drizzle, Auth.js v5), responsive (mobile tab bar / desktop top tabs — no new shell).
- Complexity level: medium — additive to an established, convention-heavy codebase; the architectural novelty is concentrated in Linked Event derivation and date-range extension, not in stack selection.
- Estimated architectural components: 1 new DB table (`reservations`) + 1 schema extension (`documents.scope`), 1 derivation module (Linked Events), ~6–8 new/modified UI components (Reservations tab, accordion, Reservation row, Add/Edit drawer, Linked Event row, FR-9 CTA row, Cover Overflow Menu), and the corresponding server actions/mappers/tests for each.

### Technical Constraints & Dependencies

- All domain types added to `src/data/types.ts`; enums as const-object + union type per existing convention.
- New Drizzle table follows existing schema conventions (`uuid().primaryKey().default(sql\`gen_random_uuid()\`)`, FK to `trips`).
- `dbReservationToType()` mapper added to `src/lib/db-mappers.ts`; `documents` mapper updated for the new scope.
- Server actions live alongside their route (likely `src/app/(app)/trips/[tripId]/actions.ts` or a new reservations-scoped actions file), each calling `requireUser()` → `assertTripAccess()` → `revalidatePath()`.
- Vercel Blob `del()`-before-cascade rule applies to Reservation deletion cascading to its Documents (FR-5).
- UI built entirely from existing shadcn/Base UI primitives and Packt design tokens — DESIGN.md confirms zero new tokens/components needed.
- `getNow()`/`useNow()` conventions apply to any "next-upcoming" / "happening now" computations involving Linked Events.

### Cross-Cutting Concerns Identified

- **Document scope extension** — `"reservation"` scope touches schema, mappers, upload/delete actions, and cascade-delete across Reservation deletion.
- **Linked Event derivation** — a single shared computation (Reservation → 1–2 virtual Itinerary entries) must be consumed consistently by the Itinerary day rendering, the Now Card, and the Reservations-tab redirect target (FR-7, FR-10, FR-11) — needs one architectural home, not three reimplementations.
- **Itinerary date-range extension & Day renumbering (FR-8)** — must integrate with however Days/dates are currently derived from `trip.startDate`/`endDate`, without breaking `getTripStatus()`'s date-driven status computation.
- **New tab integration** — `TripDetailTab` gains a Reservations tab following the existing Itinerary/Map/Documents/Packing/Notes tab-shell pattern, no new navigation primitive.
- **Cover Overflow Menu** — net-new but low-risk; directly reuses `now-card.tsx`'s `MoreHorizontal`/`DropdownMenu` pattern and existing `CoverImagePicker`/attribution dialogs.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web (Next.js App Router) — not applicable for a fresh starter evaluation.

### Starter Options Considered

N/A. Packt is an existing, established codebase with its full stack, conventions, and tooling already in place (Next.js 16.2.4, React 19.2.4, TypeScript strict, Tailwind v4, @base-ui/react + shadcn, Drizzle ORM + PostgreSQL, Auth.js v5, Vitest, Playwright-BDD — see `_bmad-output/project-context.md`). The Reservations & Trip Logistics feature is additive: new schema, mappers, server actions, and components built within this existing architecture.

### Selected Starter: None — extending existing project

**Rationale for Selection:**

No starter template applies. All architectural decisions in this document build on Packt's current structure (`src/db/schema.ts`, `src/lib/db-mappers.ts`, `src/lib/queries.ts`, `src/app/(app)/trips/[tripId]/`, `src/components/packt/`, `src/components/ui/`) and conventions (enums as const objects, `requireUser()`/`assertTripAccess()`/`revalidatePath()` server-action pattern, colocated tests, etc.).

**Note:** No project initialization story is needed. The first implementation story is the schema/mapper work for the new `Reservation` entity and `Document.scope` extension.
