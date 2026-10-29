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

  const { matchesAnyGlob } = await import("./affected-e2e.mjs");
  const { FEATURE_MAP, SHARED_GLOBS, IGNORE_GLOBS } = await import("../tests/e2e/feature-map.mjs");
  const featureGlobs = FEATURE_MAP.flatMap((feature) => feature.sourceGlobs);
  const mappedOrSharedGlobs = [...SHARED_GLOBS, ...featureGlobs];

  const featureStems = readdirSync(FEATURES_DIR)
    .filter((name) => name.endsWith(".feature"))
    .map((name) => name.replace(/\.feature$/, ""));
  const mappedTags = new Set(FEATURE_MAP.map((feature) => feature.tag));

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
