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
  const PACKT_DIR = join(ROOT, "src", "components", "packt");

  const { matchesAnyGlob } = await import("./affected-e2e.mjs");
  const { FEATURE_MAP, SHARED_GLOBS } = await import("../tests/e2e/feature-map.mjs");

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

  it("no packt component is unmapped — each matches a feature glob or SHARED_GLOBS", () => {
    const allGlobs = [...SHARED_GLOBS, ...FEATURE_MAP.flatMap((feature) => feature.sourceGlobs)];
    const orphans = readdirSync(PACKT_DIR)
      .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name))
      .filter((name) => !matchesAnyGlob(`src/components/packt/${name}`, allGlobs));
    expect(
      orphans,
      `Unmapped packt components — add each to a feature entry or SHARED_GLOBS in tests/e2e/feature-map.mjs: ${orphans.join(", ")}`
    ).toEqual([]);
  });
});
