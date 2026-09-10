// Single source of truth linking source paths to E2E feature tags.
//
// `scripts/affected-e2e.mjs` classifies each changed file through ordered tiers (see that file's
// `mapChangedFilesToTags`):
//   1. IGNORE_GLOBS  → dropped (docs, unit tests, agent config — can't affect E2E behavior).
//   2. FEATURE_MAP   → union the `@feat:<stem>` tags whose globs match (checked before SHARED, so an
//                      explicitly-mapped file runs just its feature even if it also sits under a
//                      SHARED directory — e.g. `src/lib/spending.ts`).
//   3. SHARED_GLOBS  → FULL suite (cross-cutting runtime that can move any feature).
//   4. anything else → contributes nothing (unmapped runtime no longer forces FULL).
// If every changed file is ignored the run is skipped entirely; if the raw change set is empty
// (git unavailable) it falls back to FULL.
//
// SAFETY: unmapped runtime source now runs NOTHING in the inner loop rather than FULL, so the map
// must stay complete. `scripts/feature-map.test.mjs` enforces that every `src/components/packt/*`
// component and every `src/app/(app)/**` server action is mapped-or-shared — add new ones to a
// feature entry (or SHARED_GLOBS if genuinely cross-cutting). The full suite (`npm run test:e2e`)
// is the user-initiated backstop.
//
// When you add a feature file, tag it `@feat:<stem>` and add an entry here registering the source
// it exercises.

const featureFile = (stem) => `tests/e2e/features/${stem}.feature`;
const stepFile = (stem) => `tests/e2e/steps/${stem}.steps.ts`;

// Each entry's own feature + step file is always part of its globs (editing a scenario re-runs it).
const entry = (stem, sourceGlobs) => ({
  tag: `@feat:${stem}`,
  sourceGlobs: [featureFile(stem), stepFile(stem), ...sourceGlobs],
});

export const FEATURE_MAP = [
  entry("day-route-strip", [
    "src/components/packt/day-route-strip.tsx",
    "src/components/packt/day-card.tsx",
    "src/components/packt/day-card-body.tsx",
    "src/components/packt/use-day-route-summary.ts",
    "src/app/(app)/trips/[tripId]/route-actions.ts",
    "src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx",
    "src/lib/route.ts",
  ]),
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
  // Deliberately maps no source: `src/lib/use-dashboard-live-refresh.ts` and `use-live-refresh.ts`
  // must stay on the `src/lib/**` full-suite tier, same reasoning as use-bfcache-refresh below.
  // The dashboard hook is mounted in the trips page-client and every scenario lands on `/trips`, so
  // it can move any feature — naming it here would demote it to these two scenarios. The entry
  // itself still has to exist (scripts/feature-map.test.mjs pairs every .feature with one) and
  // `entry()` covers its own feature/step files, so editing a scenario still re-runs it.
  entry("dashboard-live-sync", []),
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
    "src/components/packt/use-day-draft.ts",
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
  entry("linked-events", [
    "src/components/packt/active-trip-summary-events.ts",
    "src/components/packt/active-trip-summary-time.ts",
    "src/components/packt/linked-event-badge.tsx",
    "src/components/packt/now-card.tsx",
    "src/components/packt/now-card-event-row.tsx",
    "src/components/packt/distance-time-pill.tsx",
    "src/components/packt/use-route-for-event.ts",
    "src/app/(app)/trips/[tripId]/route-actions.ts",
    "src/lib/route.ts",
    "src/lib/linked-events.ts",
    "src/lib/open-external-maps.ts",
  ]),
  entry("map-tab", [
    "src/components/packt/map-tab.tsx",
    "src/lib/map-helpers.ts",
    "src/components/packt/day-route-strip.tsx",
    "src/components/packt/day-card.tsx",
    "src/components/packt/day-card-body.tsx",
    "src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx",
  ]),
  entry("packing-tab", [
    "src/components/packt/packing-*",
    "src/components/packt/droppable-packing-section.tsx",
    "src/components/packt/delete-packing-section-alert-dialog.tsx",
    "src/app/(app)/trips/[tripId]/use-packing-handlers.ts",
    "src/app/(app)/trips/packing-actions.ts",
  ]),
  entry("packing-lists", ["src/components/packt/packing-list*.tsx", "src/components/packt/packing-lists-view.tsx"]),
  entry("pending-invitations", ["src/components/packt/pending-invitations-list.tsx", "src/lib/invitations.ts"]),
  entry("pull-templates", ["src/components/packt/template-pull-dialog.tsx"]),
  entry("preferences-cover-type", ["src/app/(app)/profile/preferences-section.tsx"]),
  entry("preferences-date-format", ["src/app/(app)/profile/preferences-section.tsx"]),
  entry("profile", ["src/app/(app)/profile/**", "src/components/packt/avatar-stack.tsx"]),
  // `src/lib/revocation-ticket.ts` and `src/lib/use-bfcache-refresh.ts` are deliberately NOT listed:
  // FEATURE_MAP is checked before SHARED_GLOBS, so naming them here would demote them out of
  // `src/lib/**` (full suite) down to this one feature — and use-bfcache-refresh is mounted in
  // page-client.tsx, so it can move every trip-detail feature. use-live-sync.ts stays mapped to its
  // own features but is listed here too: the shared-channel registry exists for this modal.
  entry("revocation-modal", ["src/components/packt/contributor-revocation-modal.tsx", "src/lib/use-live-sync.ts"]),
  entry("reservations", [
    "src/components/packt/reservation*",
    "src/components/packt/add-reservation-doc-dialog.tsx",
    "src/components/packt/delete-reservation-alert-dialog.tsx",
    "src/app/(app)/trips/[tripId]/reservations/**",
  ]),
  entry("save-trip-as-template", ["src/components/packt/save-as-template-dialog.tsx"]),
  entry("schedule-conflict", [
    "src/components/packt/day-card-body.tsx",
    "src/components/packt/use-schedule-conflicts.ts",
    "src/components/packt/schedule-conflict-badge.tsx",
    "src/components/packt/day-card-dnd.tsx",
    "src/components/packt/place-row.tsx",
    "src/components/packt/place-row-action-bar.tsx",
    "src/lib/route.ts",
    "src/app/(app)/trips/[tripId]/route-actions.ts",
  ]),
  entry("sync-status", [
    "src/components/packt/sync-status-indicator.tsx",
    "src/lib/live-sync-constants.ts",
    "src/lib/use-live-sync.ts",
    "src/app/api/users/me/events/route.ts",
  ]),
  entry("spending", [
    "src/components/packt/spending-view.tsx",
    "src/components/packt/spending-date-filter.tsx",
    "src/components/packt/spending-headline-figures.tsx",
    "src/components/ui/chart-card.tsx",
    "src/components/packt/donut-chart.tsx",
    "src/components/packt/category-breakdown-donut.tsx",
    "src/components/packt/destination-breakdown-donut.tsx",
    "src/components/packt/budget-adherence-donut.tsx",
    "src/app/(app)/travel-history/page-client.tsx",
    "src/app/(app)/travel-history/page.tsx",
    "src/lib/spending.ts",
  ]),
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
  entry("trip-live-refresh", [
    "src/lib/live-sync-constants.ts",
    "src/lib/use-live-sync.ts",
    "src/lib/use-trip-live-refresh.ts",
    "src/app/api/trips/[tripId]/events/route.ts",
    "src/lib/trip-events.ts",
  ]),
  entry("trip-notes", ["src/components/packt/trip-notes-*.tsx", "src/lib/note-preview.ts"]),
  entry("trip-tabs", [
    "src/components/packt/active-trip-summary-events.ts",
    "src/components/packt/active-trip-summary-time.ts",
    "src/components/packt/mobile-active-tab.tsx",
    "src/components/packt/mobile-unscheduled-tab.tsx",
    "src/components/packt/mobile-upcoming-tab.tsx",
  ]),
  entry("trip-sharing", [
    "src/components/packt/trip-share-dialog.tsx",
    "src/components/packt/trip-share-*.tsx",
    "src/components/packt/use-trip-share-dialog-controller.ts",
    "src/components/packt/use-trip-share-invite-form.ts",
    "src/app/(app)/trips/[tripId]/trip-detail-hero.tsx",
  ]),
  entry("trips", [
    "src/components/packt/currency-picker.tsx",
    "src/components/packt/trip-budget-tab.tsx",
    "src/components/packt/trip-add-expense-modal.tsx",
    "src/components/packt/expense-table.tsx",
    "src/components/packt/budget-progress-bar.tsx",
    "src/components/packt/status-badge.tsx",
    "src/components/packt/tab-status-icon.tsx",
    "src/app/(app)/trips/[tripId]/budget/actions.ts",
    "src/components/packt/trip-card.tsx",
    "src/components/packt/trip-edit-*.tsx",
    "src/components/packt/getting-around-section.tsx",
    "src/app/(app)/trips/[tripId]/transit-actions.ts",
    "src/components/packt/trip-hero.tsx",
    "src/components/packt/trip-date-change-confirmation-dialog.tsx",
    "src/components/packt/trip-currency-change-dialog.tsx",
    "src/components/packt/trips-active-entry-panel.tsx",
    "src/components/packt/trips-section-head.tsx",
    "src/components/packt/trips-topbar.tsx",
    "src/components/packt/trip-detail-crumb.tsx",
    "src/app/(app)/trips/use-trips-page-handlers.ts",
    "src/app/(app)/trips/date-sync.ts",
  ]),
  entry("viewer-trip-access", ["src/app/(app)/trips/[tripId]/trip-detail-hero.tsx"]),
  entry("editor-trip-access", [
    "src/app/(app)/trips/[tripId]/trip-detail-hero.tsx",
    "src/components/packt/trip-edit-sheet.tsx",
  ]),
];

// Changing anything that matches a SHARED_GLOB forces the full suite — these are cross-cutting and
// can affect any feature.
export const SHARED_GLOBS = [
  // Data + shared library + auth/runtime wiring
  "src/db/**",
  "src/data/**",
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
  "src/components/packt/theme-*",
  "src/components/packt/font-size-select.tsx",
  "src/components/packt/dev-date-picker.tsx",
  "src/components/packt/icon.tsx",
  "src/components/packt/form-section.tsx",
  "src/components/packt/section-heading.tsx",
  "src/components/packt/category-picker.tsx",
  "src/components/packt/currency-amount-field.tsx",
  // Shared E2E harness — any change can move every scenario
  "tests/e2e/fixtures.ts",
  "tests/e2e/scenario-fixture*",
  "tests/e2e/global-setup.ts",
  "tests/e2e/e2e-seed-data.ts",
  "tests/e2e/auth.setup.ts",
  "tests/e2e/steps/common.steps.ts",
  "tests/e2e/server-action.ts",
  "tests/e2e/live-sync.ts",
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

// Files that can never change E2E-observable app behavior. Matched first and dropped from the
// change set, so a docs-only or unit-test-only change runs NO E2E (rather than the full suite).
// Note: `**/*.test.ts(x)` are colocated UNIT tests; the E2E `.feature`/`.steps.ts` files are NOT
// here — they belong to their feature entry so editing a scenario re-runs it. Root-level names are
// listed both bare and under `**/` because the glob matcher treats `**/` as requiring a slash.
export const IGNORE_GLOBS = [
  // Docs / planning / agent + tooling config
  "*.md",
  "**/*.md",
  "*.mdx",
  "**/*.mdx",
  "_bmad-output/**",
  "docs/**",
  ".agents/**",
  ".claude/**",
  ".github/**",
  ".vscode/**",
  ".gitignore",
  "LICENSE",
  // Colocated unit tests (Vitest) — editing a unit test can't change runtime behavior
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.test.mjs",
  // Dev-only seed data (`npm run db:seed`) — E2E seeds itself via tests/e2e/global-setup.ts and never
  // runs db:seed, so this can't move E2E behavior even though it lives under src/db/** (a SHARED_GLOB).
  "src/db/seed.ts",
  "src/db/seed-runner.ts",
  "src/db/seed-inserts-accounts.ts",
  "src/db/seed-inserts-trip.ts",
  "src/db/seed-data/**",
];
