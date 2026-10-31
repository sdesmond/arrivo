import { describe, expect, it } from "vitest";

describe("affected-e2e helpers", async () => {
  const {
    globToRegExp,
    matchesAnyGlob,
    mapChangedFilesToTags,
    formatScope,
    isTypeOnlyChange,
    scopeFeatureMapChange,
    FEATURE_MAP_PATH,
  } = await import("./affected-e2e.mjs");

  const FEATURE_MAP = [
    {
      tag: "@feat:packing-tab",
      sourceGlobs: ["src/components/arrivo/packing-*", "tests/e2e/features/packing-tab.feature"],
    },
    { tag: "@feat:packing-lists", sourceGlobs: ["src/components/arrivo/packing-list*.tsx"] },
    { tag: "@feat:reservations", sourceGlobs: ["src/app/(app)/trips/[tripId]/reservations/**"] },
    { tag: "@feat:trips", sourceGlobs: ["src/components/arrivo/trip-card.tsx"] },
    // Feature-owned file that also lives under a SHARED directory — exercises feature-first precedence.
    { tag: "@feat:spending", sourceGlobs: ["src/lib/spending.ts"] },
  ];
  const SHARED_GLOBS = ["src/db/**", "src/lib/**", "src/components/ui/**", "package.json"];
  const IGNORE_GLOBS = ["*.md", "**/*.md", "_bmad-output/**", "**/*.test.ts", "**/*.test.tsx"];
  const maps = { FEATURE_MAP, SHARED_GLOBS, IGNORE_GLOBS };

  describe("globToRegExp", () => {
    it("matches a single segment with * but not across slashes", () => {
      expect(globToRegExp("src/components/arrivo/packing-*").test("src/components/arrivo/packing-item.tsx")).toBe(true);
      expect(globToRegExp("src/components/arrivo/packing-*").test("src/components/arrivo/sub/x.tsx")).toBe(false);
    });

    it("matches across segments with ** and escapes route-group parens", () => {
      expect(
        globToRegExp("src/app/(app)/trips/[tripId]/reservations/**").test(
          "src/app/(app)/trips/[tripId]/reservations/actions.ts"
        )
      ).toBe(true);
      expect(globToRegExp("src/app/(app)/**").test("src/app/(other)/x.ts")).toBe(false);
    });
  });

  it("matchesAnyGlob normalizes backslashes before testing", () => {
    expect(matchesAnyGlob("src\\db\\schema.ts", SHARED_GLOBS)).toBe(true);
  });

  describe("mapChangedFilesToTags", () => {
    it("returns full when the raw change set is empty (git unavailable / nothing to scope)", () => {
      expect(mapChangedFilesToTags([], maps)).toEqual({ mode: "full" });
    });

    it("returns none when every changed file is ignored (docs + unit tests only)", () => {
      expect(
        mapChangedFilesToTags(
          ["_bmad-output/story-2-1.md", "AGENTS.md", "src/components/arrivo/trip-card.test.tsx"],
          maps
        )
      ).toEqual({ mode: "none" });
    });

    it("drops ignored files but still scopes the mapped source alongside them", () => {
      expect(mapChangedFilesToTags(["_bmad-output/story.md", "src/components/arrivo/trip-card.tsx"], maps)).toEqual({
        mode: "tags",
        tags: ["@feat:trips"],
      });
    });

    it("returns full when any changed runtime file is shared", () => {
      expect(mapChangedFilesToTags(["src/components/arrivo/trip-card.tsx", "src/lib/utils.ts"], maps)).toEqual({
        mode: "full",
      });
    });

    it("returns none — not full — when a runtime file maps to no feature (new/unmapped source)", () => {
      expect(mapChangedFilesToTags(["src/app/(app)/whats-new/page.tsx"], maps)).toEqual({ mode: "none" });
    });

    it("scopes only the mapped file when an unmapped runtime file changes alongside it", () => {
      expect(
        mapChangedFilesToTags(["src/app/(app)/whats-new/page.tsx", "src/components/arrivo/trip-card.tsx"], maps)
      ).toEqual({ mode: "tags", tags: ["@feat:trips"] });
    });

    it("lets a feature mapping win over SHARED (un-shadows src/lib/spending.ts)", () => {
      expect(mapChangedFilesToTags(["src/lib/spending.ts"], maps)).toEqual({
        mode: "tags",
        tags: ["@feat:spending"],
      });
    });

    it("still forces full when a shared file changes next to a feature-mapped one", () => {
      expect(mapChangedFilesToTags(["src/lib/spending.ts", "src/lib/utils.ts"], maps)).toEqual({ mode: "full" });
    });

    it("unions tags across feature-only changes, sorted and deduped", () => {
      expect(
        mapChangedFilesToTags(
          ["src/components/arrivo/packing-list-row.tsx", "src/components/arrivo/trip-card.tsx"],
          maps
        )
      ).toEqual({ mode: "tags", tags: ["@feat:packing-lists", "@feat:packing-tab", "@feat:trips"] });
    });

    it("a file matching several feature globs yields all their tags", () => {
      expect(mapChangedFilesToTags(["src/components/arrivo/packing-list-row.tsx"], maps)).toEqual({
        mode: "tags",
        tags: ["@feat:packing-lists", "@feat:packing-tab"],
      });
    });

    describe("feature-map edits", () => {
      const withMap = { ...maps, SHARED_GLOBS: [...SHARED_GLOBS, FEATURE_MAP_PATH] };
      const previousMaps = { ...withMap, FEATURE_MAP: FEATURE_MAP.filter((entry) => entry.tag !== "@feat:trips") };

      it("runs only the entries the edit added or changed", () => {
        expect(mapChangedFilesToTags([FEATURE_MAP_PATH], withMap, { previousMaps })).toEqual({
          mode: "tags",
          tags: ["@feat:trips"],
        });
      });

      it("unions the map-edit tags with the tags of other changed files", () => {
        expect(mapChangedFilesToTags([FEATURE_MAP_PATH, "src/lib/spending.ts"], withMap, { previousMaps })).toEqual({
          mode: "tags",
          tags: ["@feat:spending", "@feat:trips"],
        });
      });

      it("falls back to full when the previous map could not be loaded", () => {
        expect(mapChangedFilesToTags([FEATURE_MAP_PATH], withMap, { previousMaps: null })).toEqual({ mode: "full" });
        expect(mapChangedFilesToTags([FEATURE_MAP_PATH], withMap)).toEqual({ mode: "full" });
      });
    });
  });

  describe("scopeFeatureMapChange", () => {
    const previous = { FEATURE_MAP, SHARED_GLOBS, IGNORE_GLOBS };

    it("returns no tags when nothing in the map changed", () => {
      expect(scopeFeatureMapChange(previous, previous)).toEqual({ mode: "tags", tags: [] });
    });

    it("tags a newly added entry", () => {
      const current = { ...previous, FEATURE_MAP: [...FEATURE_MAP, { tag: "@feat:new", sourceGlobs: ["src/x.ts"] }] };
      expect(scopeFeatureMapChange(previous, current)).toEqual({ mode: "tags", tags: ["@feat:new"] });
    });

    it("tags an entry whose globs changed, regardless of glob order", () => {
      const current = {
        ...previous,
        FEATURE_MAP: FEATURE_MAP.map((entry) =>
          entry.tag === "@feat:packing-tab" ? { ...entry, sourceGlobs: [...entry.sourceGlobs].reverse() } : entry
        ).map((entry) =>
          entry.tag === "@feat:trips" ? { ...entry, sourceGlobs: [...entry.sourceGlobs, "src/y.ts"] } : entry
        ),
      };
      expect(scopeFeatureMapChange(previous, current)).toEqual({ mode: "tags", tags: ["@feat:trips"] });
    });

    it("runs nothing for a removed entry", () => {
      const current = { ...previous, FEATURE_MAP: FEATURE_MAP.filter((entry) => entry.tag !== "@feat:trips") };
      expect(scopeFeatureMapChange(previous, current)).toEqual({ mode: "tags", tags: [] });
    });

    it("returns full when SHARED_GLOBS or IGNORE_GLOBS changed", () => {
      expect(scopeFeatureMapChange(previous, { ...previous, SHARED_GLOBS: ["src/db/**"] })).toEqual({ mode: "full" });
      expect(scopeFeatureMapChange(previous, { ...previous, IGNORE_GLOBS: [...IGNORE_GLOBS, "src/**"] })).toEqual({
        mode: "full",
      });
    });
  });

  describe("isTypeOnlyChange", () => {
    const before = `export interface Trip { id: string }\nexport const TripStatus = { Active: "active" } as const;\n`;

    it("is true when only type declarations changed", async () => {
      const after = `export interface Trip { id: string; name?: string }\nexport type Id = string;\nexport const TripStatus = { Active: "active" } as const;\n`;
      expect(await isTypeOnlyChange("src/data/types.ts", before, after)).toBe(true);
    });

    it("is true for a comment-only change", async () => {
      expect(await isTypeOnlyChange("src/data/types.ts", before, `// trips\n${before}`)).toBe(true);
    });

    it("is true when an import becomes a type-only import of a name used only as a type", async () => {
      const valueImport = `import { Trip } from "./types";\nexport const id = (trip: Trip) => trip.id;\n`;
      const typeImport = `import type { Trip } from "./types";\nexport const id = (trip: Trip) => trip.id;\n`;
      expect(await isTypeOnlyChange("src/lib/x.ts", valueImport, typeImport)).toBe(true);
    });

    it("is false when emitted runtime code changed", async () => {
      const after = before.replace(`"active"`, `"ongoing"`);
      expect(await isTypeOnlyChange("src/data/types.ts", before, after)).toBe(false);
    });

    it("handles TSX", async () => {
      const component = (props) =>
        `interface Props { ${props} }\nexport function Badge({ label }: Props) { return <span>{label}</span>; }\n`;
      expect(
        await isTypeOnlyChange("src/x.tsx", component("label: string"), component("label: string; id?: string"))
      ).toBe(true);
      expect(
        await isTypeOnlyChange(
          "src/x.tsx",
          component("label: string"),
          component("label: string").replace("span", "em")
        )
      ).toBe(false);
    });

    it("is false for added, deleted, or non-TypeScript files", async () => {
      expect(await isTypeOnlyChange("src/data/types.ts", null, before)).toBe(false);
      expect(await isTypeOnlyChange("src/data/types.ts", before, null)).toBe(false);
      expect(await isTypeOnlyChange("src/app/globals.css", "a{}", "a{}\n")).toBe(false);
    });
  });

  describe("formatScope", () => {
    it("renders full as FULL for grep and full for scope", () => {
      expect(formatScope({ mode: "full" }, "grep")).toBe("FULL");
      expect(formatScope({ mode: "full" }, "scope")).toBe("full");
    });

    it("renders none as NONE for grep and none for scope", () => {
      expect(formatScope({ mode: "none" }, "grep")).toBe("NONE");
      expect(formatScope({ mode: "none" }, "scope")).toBe("none");
    });

    it("joins tags with | for grep and , for scope", () => {
      const result = { mode: "tags", tags: ["@feat:a", "@feat:b"] };
      expect(formatScope(result, "grep")).toBe("@feat:a|@feat:b");
      expect(formatScope(result, "scope")).toBe("@feat:a,@feat:b");
    });
  });
});
