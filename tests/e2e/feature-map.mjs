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
// must stay complete. `scripts/feature-map.test.mjs` enforces that every `src/components/arrivo/*`
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
  entry("instance-users", [
    "src/components/arrivo/instance-users-list.tsx",
    "src/components/arrivo/change-role-dialog.tsx",
    "src/lib/instance-users.ts",
    "src/app/(app)/admin/users/**",
  ]),
  entry("instance-activity", [
    "src/components/arrivo/instance-activity.tsx",
    "src/components/ui/table.tsx",
    "src/lib/activity.ts",
    "src/lib/activity-queries.ts",
    "src/lib/authorize-credentials.ts",
    "src/app/(app)/admin/activity/**",
    "tests/e2e/steps/mfa.steps.ts",
    "tests/e2e/steps/account-menu.steps.ts",
  ]),
  entry("account-menu", [
    "src/components/arrivo/account-menu.tsx",
    "src/components/arrivo/admin-section-nav.tsx",
    "src/components/arrivo/bottom-tab-bar.tsx",
    "src/app/api/users/me/instance-role/route.ts",
    "src/app/(app)/admin/**",
    "src/lib/instance-roles.ts",
  ]),
  entry("day-route-strip", [
    "src/components/arrivo/day-route-strip.tsx",
    "src/components/arrivo/day-card.tsx",
    "src/components/arrivo/day-card-body.tsx",
    "src/components/arrivo/use-day-route-summary.ts",
    "src/app/(app)/trips/[tripId]/route-actions.ts",
    "src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx",
    "src/lib/route.ts",
  ]),
  entry("auth", [
    "src/components/arrivo/auth-forms.tsx",
    "src/components/arrivo/auth-submit-button.tsx",
    "src/components/arrivo/mfa-code-form.tsx",
    "src/app/(auth)/sign-in/**",
    "src/app/(auth)/sign-up/**",
    "src/app/(auth)/actions.ts",
    "src/lib/authorize-credentials.ts",
  ]),
  entry("instance-bootstrap", [
    "src/components/arrivo/auth-forms.tsx",
    "src/app/(auth)/sign-up/**",
    "src/app/(auth)/actions.ts",
    "src/lib/instance-bootstrap.ts",
    "tests/e2e/instance-state.ts",
  ]),
  entry("instance-role-service", [
    "src/lib/account-role-changes.ts",
    "src/lib/account-lifecycle-locks.ts",
    "src/lib/account-deletion.ts",
    "tests/e2e/role-service-fixture.ts",
  ]),
  entry("mfa", [
    "src/components/arrivo/auth-forms.tsx",
    "src/components/arrivo/auth-submit-button.tsx",
    "src/components/arrivo/mfa-code-form.tsx",
    "src/app/(auth)/actions.ts",
    "src/app/(auth)/sign-in/**",
    "src/lib/authorize-credentials.ts",
    "src/app/(app)/profile/security-*",
    "src/app/(app)/profile/mfa-enrollment.tsx",
    "src/app/(app)/profile/recovery-codes-dialog.tsx",
    "src/app/(app)/profile/trusted-devices-list.tsx",
    // mfa.feature reuses the Security-tab and sign-in-notice steps defined there.
    "tests/e2e/steps/profile.steps.ts",
  ]),
  entry("create-trip", [
    "src/components/arrivo/new-trip-card.tsx",
    "src/components/arrivo/new-trip-dialog.tsx",
    "src/components/arrivo/trip-confetti.tsx",
    "src/app/(app)/trips/create-trip-days.ts",
  ]),
  entry("new-trip", ["src/components/arrivo/new-trip-dialog.tsx", "src/components/arrivo/new-trip-card.tsx"]),
  // Deliberately maps no source: `src/lib/use-dashboard-live-refresh.ts` and `use-live-refresh.ts`
  // must stay on the `src/lib/**` full-suite tier, same reasoning as use-bfcache-refresh below.
  // The dashboard hook is mounted in the trips page-client and every scenario lands on `/trips`, so
  // it can move any feature — naming it here would demote it to these two scenarios. The entry
  // itself still has to exist (scripts/feature-map.test.mjs pairs every .feature with one) and
  // `entry()` covers its own feature/step files, so editing a scenario still re-runs it.
  entry("dashboard-live-sync", []),
  entry("day-planning", [
    "src/components/arrivo/day-card*.tsx",
    "src/components/arrivo/place-row*.tsx",
    "src/components/arrivo/note-item.tsx",
    "src/components/arrivo/checklist-item.tsx",
    "src/components/arrivo/checklist-item-row.tsx",
    "src/components/arrivo/gap-zone.tsx",
    "src/components/arrivo/itinerary-cta.tsx",
    "src/components/arrivo/delete-event-dialog.tsx",
    "src/components/arrivo/time-dialog.tsx",
    "src/components/arrivo/cost-dialog.tsx",
    "src/components/arrivo/location-dialog.tsx",
    "src/components/arrivo/location-lookup-input.tsx",
    "src/components/arrivo/use-location-autocomplete.ts",
    "src/components/arrivo/use-day-draft.ts",
    "src/components/arrivo/unscheduled-section.tsx",
    "src/components/arrivo/type-picker.tsx",
    "src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx",
    "src/app/(app)/trips/[tripId]/remove-last-day-dialog.tsx",
    "src/app/(app)/trips/[tripId]/unscheduled-events-section.tsx",
    "src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts",
  ]),
  entry("documents", [
    "src/components/arrivo/add-doc-dialog.tsx",
    "src/components/arrivo/doc-row.tsx",
    "src/components/arrivo/doc-viewer.tsx",
    "src/components/arrivo/docs-block.tsx",
    "src/components/arrivo/docs-rail.tsx",
    "src/components/arrivo/doc-kind-badge.tsx",
    "src/components/arrivo/trip-docs-tab.tsx",
    "src/app/(app)/trips/[tripId]/document-upload-actions.ts",
  ]),
  entry("event-docs", ["src/components/arrivo/event-doc-row.tsx"]),
  entry("linked-events", [
    "src/components/arrivo/active-trip-summary-events.ts",
    "src/components/arrivo/active-trip-summary-time.ts",
    "src/components/arrivo/linked-event-badge.tsx",
    "src/components/arrivo/now-card.tsx",
    "src/components/arrivo/now-card-event-row.tsx",
    "src/components/arrivo/distance-time-pill.tsx",
    "src/components/arrivo/use-route-for-event.ts",
    "src/app/(app)/trips/[tripId]/route-actions.ts",
    "src/lib/route.ts",
    "src/lib/linked-events.ts",
    "src/lib/open-external-maps.ts",
    "src/app/(app)/trips/actions.ts",
    "src/app/(app)/trips/date-sync.ts",
    "src/components/arrivo/trip-date-change-confirmation-dialog.tsx",
  ]),
  entry("map-tab", [
    "src/components/arrivo/map-tab.tsx",
    "src/lib/map-helpers.ts",
    "src/components/arrivo/day-route-strip.tsx",
    "src/components/arrivo/day-card.tsx",
    "src/components/arrivo/day-card-body.tsx",
    "src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx",
  ]),
  entry("packing-tab", [
    "src/components/arrivo/packing-*",
    "src/components/arrivo/droppable-packing-section.tsx",
    "src/components/arrivo/delete-packing-section-alert-dialog.tsx",
    "src/app/(app)/trips/[tripId]/use-packing-handlers.ts",
    "src/app/(app)/trips/packing-actions.ts",
  ]),
  entry("packing-lists", ["src/components/arrivo/packing-list*.tsx", "src/components/arrivo/packing-lists-view.tsx"]),
  entry("pending-invitations", [
    "src/components/arrivo/pending-invitations-list.tsx",
    "src/components/arrivo/invitation-live-refresh.tsx",
    "src/lib/invitations.ts",
  ]),
  entry("pull-templates", ["src/components/arrivo/template-pull-dialog.tsx"]),
  entry("preferences-cover-type", ["src/app/(app)/profile/preferences-section.tsx"]),
  entry("preferences-date-format", ["src/app/(app)/profile/preferences-section.tsx"]),
  entry("profile", ["src/app/(app)/profile/**", "src/components/arrivo/avatar-stack.tsx"]),
  // `src/lib/revocation-ticket.ts` and `src/lib/use-bfcache-refresh.ts` are deliberately NOT listed:
  // FEATURE_MAP is checked before SHARED_GLOBS, so naming them here would demote them out of
  // `src/lib/**` (full suite) down to this one feature — and use-bfcache-refresh is mounted in
  // page-client.tsx, so it can move every trip-detail feature. use-live-sync.ts stays mapped to its
  // own features but is listed here too: the shared-channel registry exists for this modal.
  entry("revocation-modal", ["src/components/arrivo/contributor-revocation-modal.tsx", "src/lib/use-live-sync.ts"]),
  entry("reservations", [
    "src/components/arrivo/reservation*",
    "src/components/arrivo/add-reservation-doc-dialog.tsx",
    "src/components/arrivo/delete-reservation-alert-dialog.tsx",
    "src/app/(app)/trips/[tripId]/reservations/**",
  ]),
  entry("save-trip-as-template", ["src/components/arrivo/save-as-template-dialog.tsx"]),
  entry("schedule-conflict", [
    "src/components/arrivo/day-card-body.tsx",
    "src/components/arrivo/use-schedule-conflicts.ts",
    "src/components/arrivo/schedule-conflict-badge.tsx",
    "src/components/arrivo/day-card-dnd.tsx",
    "src/components/arrivo/place-row.tsx",
    "src/components/arrivo/place-row-action-bar.tsx",
    "src/lib/route.ts",
    "src/app/(app)/trips/[tripId]/route-actions.ts",
  ]),
  entry("sync-status", [
    "src/components/arrivo/sync-status-indicator.tsx",
    "src/lib/live-sync-constants.ts",
    "src/lib/use-live-sync.ts",
    "src/app/api/users/me/events/route.ts",
  ]),
  entry("spending", [
    "src/components/arrivo/spending-view.tsx",
    "src/components/arrivo/spending-date-filter.tsx",
    "src/components/arrivo/spending-headline-figures.tsx",
    "src/components/ui/chart-card.tsx",
    "src/components/arrivo/donut-chart.tsx",
    "src/components/arrivo/category-breakdown-donut.tsx",
    "src/components/arrivo/destination-breakdown-donut.tsx",
    "src/components/arrivo/budget-adherence-donut.tsx",
    "src/app/(app)/travel-history/page-client.tsx",
    "src/app/(app)/travel-history/page.tsx",
    "src/lib/spending.ts",
  ]),
  entry("template-items", [
    "src/components/arrivo/template-editor-view.tsx",
    "src/components/arrivo/delete-packing-section-alert-dialog.tsx",
    "src/app/(app)/packing/[templateId]/**",
  ]),
  entry("templates", [
    "src/components/arrivo/template-library.tsx",
    "src/components/arrivo/template-form-dialog.tsx",
    "src/components/arrivo/delete-template-alert-dialog.tsx",
    "src/app/(app)/packing/page-client.tsx",
    "src/app/(app)/packing/actions.ts",
    "src/app/(app)/packing/template-name.ts",
  ]),
  entry("travel-history", [
    "src/components/arrivo/travel-history-list.tsx",
    "src/components/arrivo/trips-past-list.tsx",
    "src/components/arrivo/mobile-past-tab.tsx",
    "src/app/(app)/travel-history/**",
  ]),
  entry("trip-cover-overflow", [
    "src/components/arrivo/cover-*.tsx",
    "src/components/arrivo/trip-cover.tsx",
    "src/app/(app)/trips/[tripId]/cover-upload-actions.ts",
    "src/app/(app)/trips/cover-image-search-actions.ts",
  ]),
  entry("trip-delete", ["src/components/arrivo/delete-trip-alert-dialog.tsx"]),
  entry("leave-trip", [
    "src/components/arrivo/leave-trip-alert-dialog.tsx",
    "src/app/(app)/trips/[tripId]/use-leave-trip.ts",
    "src/app/(app)/trips/[tripId]/trip-detail-dialogs.tsx",
    "src/app/(app)/trips/[tripId]/trip-detail-hero.tsx",
  ]),
  entry("trip-live-refresh", [
    "src/lib/live-sync-constants.ts",
    "src/lib/use-live-sync.ts",
    "src/lib/use-trip-live-refresh.ts",
    "src/app/api/trips/[tripId]/events/route.ts",
    "src/lib/trip-events.ts",
  ]),
  entry("trip-notes", ["src/components/arrivo/trip-notes-*.tsx", "src/lib/note-preview.ts"]),
  entry("trip-tabs", [
    "src/components/arrivo/active-trip-summary-events.ts",
    "src/components/arrivo/active-trip-summary-time.ts",
    "src/components/arrivo/mobile-active-tab.tsx",
    "src/components/arrivo/mobile-unscheduled-tab.tsx",
    "src/components/arrivo/mobile-upcoming-tab.tsx",
  ]),
  entry("trip-sharing", [
    "src/components/arrivo/trip-share-dialog.tsx",
    "src/components/arrivo/trip-share-*.tsx",
    "src/components/arrivo/use-trip-share-dialog-controller.ts",
    "src/components/arrivo/use-share-invitation-actions.ts",
    "src/components/arrivo/use-trip-share-invite-form.ts",
    "src/app/(app)/trips/[tripId]/trip-detail-hero.tsx",
  ]),
  entry("trips", [
    "src/components/arrivo/currency-picker.tsx",
    "src/components/arrivo/trip-budget-tab.tsx",
    "src/components/arrivo/trip-add-expense-modal.tsx",
    "src/components/arrivo/expense-table.tsx",
    "src/components/arrivo/budget-progress-bar.tsx",
    "src/components/arrivo/status-badge.tsx",
    "src/components/arrivo/tab-status-icon.tsx",
    "src/app/(app)/trips/[tripId]/budget/actions.ts",
    "src/components/arrivo/trip-card.tsx",
    "src/components/arrivo/trip-edit-*.tsx",
    "src/components/arrivo/getting-around-section.tsx",
    "src/app/(app)/trips/[tripId]/transit-actions.ts",
    "src/components/arrivo/trip-hero.tsx",
    "src/components/arrivo/trip-date-change-confirmation-dialog.tsx",
    "src/components/arrivo/trip-currency-change-dialog.tsx",
    "src/components/arrivo/trips-active-entry-panel.tsx",
    "src/components/arrivo/trips-section-head.tsx",
    "src/components/arrivo/trips-topbar.tsx",
    "src/components/arrivo/trip-detail-crumb.tsx",
    "src/app/(app)/trips/use-trips-page-handlers.ts",
    "src/app/(app)/trips/date-sync.ts",
  ]),
  entry("viewer-trip-access", [
    "src/app/(app)/trips/[tripId]/trip-detail-hero.tsx",
    "src/components/arrivo/trip-edit-access.tsx",
    "src/components/arrivo/place-row*.tsx",
    "src/components/arrivo/day-card-header.tsx",
    "src/components/arrivo/day-card-sortables.tsx",
    "src/components/arrivo/day-card-bottom-add.tsx",
    "src/components/arrivo/gap-zone.tsx",
    "src/components/arrivo/note-item.tsx",
    "src/components/arrivo/checklist-item*.tsx",
    "src/components/arrivo/docs-block.tsx",
    "src/components/arrivo/event-doc-row.tsx",
    "src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx",
  ]),
  entry("editor-trip-access", [
    "src/app/(app)/trips/[tripId]/trip-detail-hero.tsx",
    "src/components/arrivo/trip-edit-sheet.tsx",
  ]),
];

// Changing anything that matches a SHARED_GLOB forces the full suite — these are cross-cutting and
// can affect any feature.
export const SHARED_GLOBS = [
  // Data + shared library + auth/runtime wiring
  "src/db/**",
  "src/data/**",
  "src/lib/**",
  "src/proxy.ts",
  "src/instrumentation.ts",
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
  // Shared UI primitives + providers + cross-feature arrivo chrome
  "src/components/ui/**",
  "src/components/providers/**",
  "src/components/arrivo/sidebar-nav.tsx",
  "src/components/arrivo/arrivo-brand.tsx",
  "src/assets/**",
  "src/app/icon.svg",
  "src/components/arrivo/bottom-tab-bar.tsx",
  "src/components/arrivo/nav-item.tsx",
  "src/components/arrivo/rail-panel.tsx",
  "src/components/arrivo/trip-rail.tsx",
  "src/components/arrivo/trips-desktop-layout.tsx",
  "src/components/arrivo/trips-mobile-layout.tsx",
  "src/components/arrivo/trips-mobile-tabs.tsx",
  "src/components/arrivo/world-map.tsx",
  "src/components/arrivo/theme-*",
  "src/components/arrivo/font-size-select.tsx",
  "src/components/arrivo/dev-date-picker.tsx",
  "src/components/arrivo/icon.tsx",
  "src/components/arrivo/form-section.tsx",
  "src/components/arrivo/section-heading.tsx",
  "src/components/arrivo/category-picker.tsx",
  "src/components/arrivo/currency-amount-field.tsx",
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
