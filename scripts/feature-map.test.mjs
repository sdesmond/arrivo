import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Guards that tests/e2e/feature-map.mjs stays in sync with the real tree, so E2E segmentation keeps
// targeting the right scenarios as components and features are added. Runs in the validator's
// coverage worker — drift turns the build red instead of silently degrading to the full suite.
describe("feature-map consistency", async () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const FEATURES_DIR = join(ROOT, "tests", "e2e", "features");
  const ARRIVO_DIR = join(ROOT, "src", "components", "arrivo");
  const APP_DIR = join(ROOT, "src", "app", "(app)");

  const { matchesAnyGlob, mapChangedFilesToTags } = await import("./affected-e2e.mjs");
  const { FEATURE_MAP, SHARED_GLOBS, IGNORE_GLOBS } = await import("../tests/e2e/feature-map.mjs");
  const featureGlobs = FEATURE_MAP.flatMap((feature) => feature.sourceGlobs);
  const mappedOrSharedGlobs = [...SHARED_GLOBS, ...featureGlobs];

  const featureStems = readdirSync(FEATURES_DIR)
    .filter((name) => name.endsWith(".feature"))
    .map((name) => name.replace(/\.feature$/, ""));
  const mappedTags = new Set(FEATURE_MAP.map((feature) => feature.tag));

  it("maps optimistic checklist handlers to day planning", () => {
    const feature = FEATURE_MAP.find((candidate) => candidate.tag === "@feat:day-planning");
    expect(matchesAnyGlob("src/app/(app)/trips/[tripId]/use-checklist-handlers.ts", feature.sourceGlobs)).toBe(true);
  });
  it("keeps checklist API consumers explicitly scoped during rollout", () => {
    for (const path of [
      "src/lib/api/route.ts",
      "src/lib/services/checklists.ts",
      "src/app/api/v1/checklist-items/[itemId]/route.ts",
      "src/app/api/v1/trips/[tripId]/checklists/route.ts",
      "src/app/api/v1/checklists/[checklistId]/route.ts",
    ]) {
      const tags = FEATURE_MAP.filter((feature) => matchesAnyGlob(path, feature.sourceGlobs)).map(
        (feature) => feature.tag
      );
      expect(tags).toContain("@feat:api");
      expect(tags).toContain("@feat:day-planning");
      expect(tags).toContain("@feat:trip-live-refresh");
    }
  });
  it("owns checklist item lifecycle runtime through the API, day-planning and live-refresh features", () => {
    for (const path of [
      "src/app/api/v1/checklists/[checklistId]/items/route.ts",
      "src/app/api/v1/checklist-items/[itemId]/route.ts",
      "src/lib/api/contract/checklists.ts",
      "src/lib/services/checklists.ts",
    ]) {
      const tags = FEATURE_MAP.filter((feature) => matchesAnyGlob(path, feature.sourceGlobs)).map(
        (feature) => feature.tag
      );
      expect(tags).toEqual(expect.arrayContaining(["@feat:api", "@feat:day-planning", "@feat:trip-live-refresh"]));
    }
    const dayPlanning = FEATURE_MAP.find((candidate) => candidate.tag === "@feat:day-planning");
    for (const path of [
      "src/app/(app)/trips/[tripId]/use-checklist-handlers.ts",
      "src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts",
      "src/components/arrivo/checklist-item.tsx",
      "src/components/arrivo/checklist-item-row.tsx",
    ])
      expect(matchesAnyGlob(path, dayPlanning.sourceGlobs)).toBe(true);
  });
  it("classifies the trip actions module under app-activity and SHARED_GLOBS", () => {
    const path = "src/app/(app)/trips/[tripId]/actions.ts";
    // An explicit FEATURE_MAP match wins over SHARED_GLOBS, so the effective scope is the mapped tag(s).
    expect(mapChangedFilesToTags([path], { FEATURE_MAP, SHARED_GLOBS, IGNORE_GLOBS })).toEqual({
      mode: "tags",
      tags: expect.arrayContaining(["@feat:app-activity"]),
    });
    expect(SHARED_GLOBS.some((glob) => matchesAnyGlob(path, [glob]))).toBe(true);
  });
  it("includes lifecycle routes among packing-list consumers", () => {
    const feature = FEATURE_MAP.find((candidate) => candidate.tag === "@feat:packing-lists");
    for (const path of [
      "src/lib/services/checklists.ts",
      "src/lib/api/contract/checklists.ts",
      "src/app/api/v1/checklists/[checklistId]/route.ts",
      "src/app/api/v1/trips/[tripId]/checklists/route.ts",
      "src/app/(app)/trips/[tripId]/use-packing-handlers.ts",
    ])
      expect(matchesAnyGlob(path, feature.sourceGlobs)).toBe(true);
  });
  it("keeps the packing handler in the packing tab while it also runs the packing-list scenarios", () => {
    const tagsFor = (path) =>
      FEATURE_MAP.filter((feature) => matchesAnyGlob(path, feature.sourceGlobs)).map((feature) => feature.tag);
    expect(tagsFor("src/app/(app)/trips/[tripId]/use-packing-handlers.ts")).toEqual(
      expect.arrayContaining(["@feat:packing-tab", "@feat:packing-lists"])
    );
    expect(tagsFor("src/app/(app)/trips/[tripId]/use-packing-handlers.test.tsx")).toEqual([]);
  });

  it("scopes the public API metadata route and its contract to the api feature only", () => {
    const tagsFor = (path) =>
      FEATURE_MAP.filter((feature) => matchesAnyGlob(path, feature.sourceGlobs)).map((feature) => feature.tag);
    expect(tagsFor("src/app/api/v1/meta/route.ts")).toEqual(["@feat:api"]);
    expect(tagsFor("src/lib/api/contract/meta.ts")).toContain("@feat:api");
    expect(SHARED_GLOBS.some((glob) => matchesAnyGlob("src/app/api/v1/meta/route.ts", [glob]))).toBe(false);
  });

  it("scopes shared replay storage to API, checklist and packing consumers without a full-suite run", () => {
    const tagsFor = (path) =>
      FEATURE_MAP.filter((feature) => matchesAnyGlob(path, feature.sourceGlobs)).map((feature) => feature.tag);
    expect(tagsFor("src/lib/api/idempotency.ts")).toEqual(
      expect.arrayContaining(["@feat:api", "@feat:day-planning", "@feat:trip-live-refresh", "@feat:packing-tab"])
    );
    expect(tagsFor("src/lib/api/idempotency.test.ts")).not.toContain("@feat:packing-tab");
    expect(tagsFor("src/app/(app)/trips/packing-actions.ts")).toContain("@feat:packing-tab");
  });

  it("every feature file carries its own @feat:<stem> tag", () => {
    const untagged = featureStems.filter(
      (stem) => !readFileSync(join(FEATURES_DIR, `${stem}.feature`), "utf8").includes(`@feat:${stem}`)
    );
    expect(untagged, `Feature files missing their @feat:<stem> tag: ${untagged.join(", ")}`).toEqual([]);
  });

  it("every feature file has a FEATURE_MAP entry and vice versa", () => {
    const expectedTags = featureStems.map((stem) => `@feat:${stem}`).sort();
    expect([...mappedTags].sort()).toEqual(expectedTags);
  });

  it("every concrete (non-glob) source path in the map still exists", () => {
    const missing = FEATURE_MAP.flatMap((feature) => feature.sourceGlobs)
      .filter((glob) => !glob.includes("*"))
      .filter((path) => !existsSync(join(ROOT, path)));
    expect(missing, `Map references files that no longer exist: ${missing.join(", ")}`).toEqual([]);
  });

  it.each([
    // The constants only shape heartbeat/watchdog timing, which is what these two features assert.
    ["src/lib/live-sync-constants.ts", ["@feat:sync-status", "@feat:trip-live-refresh"]],
    // The hook additionally owns the ref-counted shared-channel registry that lets the revocation
    // modal share the personal channel with the sync indicator, so it must run that feature too.
    ["src/lib/use-live-sync.ts", ["@feat:revocation-modal", "@feat:sync-status", "@feat:trip-live-refresh"]],
  ])("runs the live-sync feature coverage when %s changes", (path, expectedTags) => {
    const tags = FEATURE_MAP.filter((feature) => matchesAnyGlob(path, feature.sourceGlobs))
      .map((feature) => feature.tag)
      .sort();

    expect(tags).toEqual(expectedTags);
  });

  it("runs password reset coverage for shared credential authorization changes", () => {
    const tags = FEATURE_MAP.filter((feature) =>
      matchesAnyGlob("src/lib/credential-authorizations.ts", feature.sourceGlobs)
    ).map((feature) => feature.tag);
    expect(tags).toContain("@feat:password-reset");
  });

  it("no arrivo component is unmapped — each matches a feature glob or SHARED_GLOBS", () => {
    const orphans = readdirSync(ARRIVO_DIR)
      .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name))
      .filter((name) => !matchesAnyGlob(`src/components/arrivo/${name}`, mappedOrSharedGlobs));
    expect(
      orphans,
      `Unmapped arrivo components — add each to a feature entry or SHARED_GLOBS in tests/e2e/feature-map.mjs: ${orphans.join(", ")}`
    ).toEqual([]);
  });

  // Unmapped runtime source now runs NO E2E (not the full suite), so server actions — the runtime
  // files most likely to be added unmapped — must be classified. Every `(-)actions.ts` under the app
  // routes must match a feature glob or SHARED_GLOBS.
  it("no app server action is unmapped — each matches a feature glob or SHARED_GLOBS", () => {
    const orphans = readdirSync(APP_DIR, { recursive: true })
      .map((name) => String(name).replace(/\\/g, "/"))
      .filter((name) => /actions\.ts$/.test(name) && !/\.test\.ts$/.test(name))
      .map((name) => `src/app/(app)/${name}`)
      .filter((path) => !matchesAnyGlob(path, mappedOrSharedGlobs));
    expect(
      orphans,
      `Unmapped app server actions — add each to a feature entry or SHARED_GLOBS in tests/e2e/feature-map.mjs: ${orphans.join(", ")}`
    ).toEqual([]);
  });

  // `src/lib/**` and `src/app/api/**` used to be blanket full-suite globs. Now each file is
  // classified on its own (a feature, the explicit SHARED list, or IGNORE when no E2E can observe
  // it), so a new lib module or route can't silently run nothing.
  it.each([
    ["src/lib", join(ROOT, "src", "lib")],
    ["src/app/api", join(ROOT, "src", "app", "api")],
  ])("no %s runtime file is unclassified — each is mapped, shared, or ignored", (prefix, dir) => {
    const orphans = readdirSync(dir, { recursive: true })
      .map((name) => `${prefix}/${String(name).replace(/\\/g, "/")}`)
      .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path))
      .filter((path) => !matchesAnyGlob(path, [...mappedOrSharedGlobs, ...IGNORE_GLOBS]));
    expect(
      orphans,
      `Unclassified files — add each to a feature entry, SHARED_GLOBS, or IGNORE_GLOBS in tests/e2e/feature-map.mjs: ${orphans.join(", ")}`
    ).toEqual([]);
  });

  it("scopes storage changes to the features that upload, serve, delete, or report on files", () => {
    const tags = FEATURE_MAP.filter((feature) =>
      matchesAnyGlob("src/lib/storage/storage-adapter.ts", feature.sourceGlobs)
    )
      .map((feature) => feature.tag)
      .sort();

    expect(tags).toEqual([
      "@feat:admin-account-deletion",
      "@feat:admin-overview",
      "@feat:api",
      "@feat:documents",
      "@feat:event-docs",
      "@feat:integrated-recovery-and-deletion",
      "@feat:profile",
      "@feat:reservations",
      "@feat:trip-cover-overflow",
      "@feat:trip-delete",
      "@feat:unfinished-account-deletion",
    ]);
  });

  it("runs the activity-write features when the shared timeout helper changes", () => {
    const tags = FEATURE_MAP.filter((feature) => matchesAnyGlob("src/lib/with-timeout.ts", feature.sourceGlobs))
      .map((feature) => feature.tag)
      .sort();

    expect(tags).toEqual([
      "@feat:activity-batching",
      "@feat:admin-recovery-issuance",
      "@feat:app-activity",
      "@feat:trip-sharing",
    ]);
  });

  // Footgun guard: IGNORE_GLOBS must only swallow non-runtime files (docs, unit tests). If an ignore
  // pattern ever matched a real mapped component, that component's edits would silently skip E2E.
  it("IGNORE_GLOBS never swallows a mapped (non-test) arrivo component", () => {
    const swallowed = readdirSync(ARRIVO_DIR)
      .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name))
      .filter((name) => matchesAnyGlob(`src/components/arrivo/${name}`, IGNORE_GLOBS));
    expect(swallowed, `IGNORE_GLOBS matches runtime components (they would skip E2E): ${swallowed.join(", ")}`).toEqual(
      []
    );
  });
});
