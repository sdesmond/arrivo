// Single source of truth linking source paths to E2E feature tags.
//
// Each FEATURE_MAP entry maps a cluster of source globs to the `@feat:<stem>` tag carried by the
// matching `tests/e2e/features/<stem>.feature` file. `scripts/affected-e2e.mjs` reads a change set
// and unions the tags whose globs match, so the validator and `test:e2e:affected` run only the
// relevant scenarios.
//
// SAFETY: affected detection falls back to the FULL suite whenever a changed file matches
// SHARED_GLOBS or matches no feature glob at all. So under-mapping is safe (you just run more than
// needed); the only thing to avoid is mapping a cross-cutting file to a single feature. Keep
// feature globs to clearly-owned component clusters and feature-specific server actions; leave
// orchestration (page clients, shared dialogs, broad action files) in SHARED_GLOBS.
//
// When you add a feature file, tag it `@feat:<stem>` and add an entry here registering the source
// it exercises — otherwise edits to that source fall back to FULL.

const featureFile = (stem) => `tests/e2e/features/${stem}.feature`;
const stepFile = (stem) => `tests/e2e/steps/${stem}.steps.ts`;

// Each entry's own feature + step file is always part of its globs (editing a scenario re-runs it).
const entry = (stem, sourceGlobs) => ({
  tag: `@feat:${stem}`,
  sourceGlobs: [featureFile(stem), stepFile(stem), ...sourceGlobs],
});

export const FEATURE_MAP = [
  entry("auth", [
    "src/components/packt/auth-forms.tsx",
    "src/app/(auth)/sign-in/**",
    "src/app/(auth)/sign-up/**",
    "src/app/(auth)/actions.ts",
  ]),
  entry("create-trip", [
    "src/components/packt/new-trip-card.tsx",
    "src/components/packt/new-trip-dialog.tsx",
    "src/components/packt/trip-confetti.tsx",
    "src/app/(app)/trips/create-trip-days.ts",
  ]),
  entry("new-trip", ["src/components/packt/new-trip-dialog.tsx", "src/components/packt/new-trip-card.tsx"]),
  entry("day-planning", [
    "src/components/packt/day-card*.tsx",
    "src/components/packt/place-row*.tsx",
    "src/components/packt/note-item.tsx",
    "src/components/packt/checklist-item.tsx",
    "src/components/packt/gap-zone.tsx",
    "src/components/packt/itinerary-cta.tsx",
    "src/components/packt/delete-event-dialog.tsx",
    "src/components/packt/time-dialog.tsx",
    "src/components/packt/cost-dialog.tsx",
    "src/components/packt/location-dialog.tsx",
    "src/components/packt/location-lookup-input.tsx",
    "src/components/packt/use-location-autocomplete.ts",
    "src/components/packt/unscheduled-section.tsx",
    "src/components/packt/type-picker.tsx",
    "src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx",
    "src/app/(app)/trips/[tripId]/unscheduled-events-section.tsx",
    "src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts",
  ]),
  entry("documents", [
    "src/components/packt/add-doc-dialog.tsx",
    "src/components/packt/doc-row.tsx",
    "src/components/packt/doc-viewer.tsx",
    "src/components/packt/docs-block.tsx",
    "src/components/packt/docs-rail.tsx",
    "src/components/packt/doc-kind-badge.tsx",
    "src/components/packt/trip-docs-tab.tsx",
    "src/app/(app)/trips/[tripId]/document-upload-actions.ts",
  ]),
  entry("event-docs", ["src/components/packt/event-doc-row.tsx"]),
  entry("linked-events", ["src/components/packt/linked-event-badge.tsx", "src/components/packt/now-card.tsx"]),
  entry("packing-tab", [
    "src/components/packt/packing-*",
    "src/components/packt/droppable-packing-section.tsx",
    "src/components/packt/delete-packing-section-alert-dialog.tsx",
    "src/app/(app)/trips/[tripId]/use-packing-handlers.ts",
    "src/app/(app)/trips/packing-actions.ts",
  ]),
  entry("packing-lists", ["src/components/packt/packing-list*.tsx", "src/components/packt/packing-lists-view.tsx"]),
  entry("pull-templates", ["src/components/packt/template-pull-dialog.tsx"]),
  entry("preferences-cover-type", ["src/app/(app)/profile/preferences-section.tsx"]),
  entry("preferences-date-format", ["src/app/(app)/profile/preferences-section.tsx"]),
  entry("profile", [
    "src/app/(app)/profile/**",
    "src/components/packt/collaborators-rail.tsx",
    "src/components/packt/avatar-stack.tsx",
  ]),
  entry("reservations", [
    "src/components/packt/reservation*",
    "src/components/packt/add-reservation-doc-dialog.tsx",
    "src/components/packt/delete-reservation-alert-dialog.tsx",
    "src/app/(app)/trips/[tripId]/reservations/**",
  ]),
  entry("save-trip-as-template", ["src/components/packt/save-as-template-dialog.tsx"]),
  entry("template-items", [
    "src/components/packt/template-editor-view.tsx",
    "src/components/packt/delete-packing-section-alert-dialog.tsx",
    "src/app/(app)/packing/[templateId]/**",
  ]),
  entry("templates", [
    "src/components/packt/template-library.tsx",
    "src/components/packt/template-form-dialog.tsx",
    "src/components/packt/delete-template-alert-dialog.tsx",
    "src/app/(app)/packing/page-client.tsx",
    "src/app/(app)/packing/actions.ts",
    "src/app/(app)/packing/template-name.ts",
  ]),
  entry("travel-history", [
    "src/components/packt/travel-history-list.tsx",
    "src/components/packt/trips-past-list.tsx",
    "src/components/packt/mobile-past-tab.tsx",
    "src/app/(app)/travel-history/**",
  ]),
  entry("trip-cover-overflow", [
    "src/components/packt/cover-*.tsx",
    "src/components/packt/trip-cover.tsx",
    "src/app/(app)/trips/[tripId]/cover-upload-actions.ts",
    "src/app/(app)/trips/cover-image-search-actions.ts",
  ]),
  entry("trip-delete", ["src/components/packt/delete-trip-alert-dialog.tsx"]),
  entry("trip-tabs", [
    "src/components/packt/mobile-active-tab.tsx",
    "src/components/packt/mobile-unscheduled-tab.tsx",
    "src/components/packt/mobile-upcoming-tab.tsx",
  ]),
  entry("trips", [
    "src/components/packt/trip-card.tsx",
    "src/components/packt/trip-edit-*.tsx",
    "src/components/packt/trip-hero.tsx",
    "src/components/packt/trip-date-change-confirmation-dialog.tsx",
    "src/components/packt/trips-active-entry-panel.tsx",
    "src/components/packt/trips-section-head.tsx",
    "src/components/packt/trips-topbar.tsx",
    "src/components/packt/trip-detail-crumb.tsx",
    "src/app/(app)/trips/use-trips-page-handlers.ts",
    "src/app/(app)/trips/date-sync.ts",
  ]),
];

// Changing anything that matches a SHARED_GLOB forces the full suite — these are cross-cutting and
// can affect any feature.
export const SHARED_GLOBS = [
  // Data + shared library + auth/runtime wiring
  "src/db/**",
  "src/lib/**",
  "src/middleware.ts",
  "src/auth*",
  // App shell + API + cross-cutting orchestration
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/globals.css",
  "src/app/(app)/layout.tsx",
  "src/app/(auth)/layout.tsx",
  "src/app/api/**",
  "src/app/(app)/trips/page-client.tsx",
  "src/app/(app)/trips/actions.ts",
  "src/app/(app)/trips/[tripId]/page-client.tsx",
  "src/app/(app)/trips/[tripId]/page.tsx",
  "src/app/(app)/trips/[tripId]/actions.ts",
  "src/app/(app)/trips/[tripId]/trip-detail-tab*",
  // Shared UI primitives + providers + cross-feature packt chrome
  "src/components/ui/**",
  "src/components/providers/**",
  "src/components/packt/sidebar-nav.tsx",
  "src/components/packt/bottom-tab-bar.tsx",
  "src/components/packt/nav-item.tsx",
  "src/components/packt/rail-panel.tsx",
  "src/components/packt/trip-rail.tsx",
  "src/components/packt/trips-desktop-layout.tsx",
  "src/components/packt/trips-mobile-layout.tsx",
  "src/components/packt/trips-mobile-tabs.tsx",
  "src/components/packt/world-map.tsx",
  "src/components/packt/mini-map-rail.tsx",
  "src/components/packt/theme-*",
  "src/components/packt/font-size-select.tsx",
  "src/components/packt/dev-date-picker.tsx",
  "src/components/packt/icon.tsx",
  "src/components/packt/form-section.tsx",
  "src/components/packt/section-heading.tsx",
  "src/components/packt/pending-sync-badge.tsx",
  // Shared E2E harness — any change can move every scenario
  "tests/e2e/fixtures.ts",
  "tests/e2e/scenario-fixture*",
  "tests/e2e/global-setup.ts",
  "tests/e2e/e2e-seed-data.ts",
  "tests/e2e/auth.setup.ts",
  "tests/e2e/steps/common.steps.ts",
  "tests/e2e/feature-map.mjs",
  // Root config + the segmentation tooling itself
  "package.json",
  "package-lock.json",
  "playwright.config.ts",
  "vitest.config.mts",
  "vitest.setup.mts",
  "tsconfig.json",
  "next.config.*",
  "drizzle*",
  "eslint.config.mjs",
  "scripts/run-e2e.mjs",
  "scripts/affected-e2e.mjs",
];
