import { describe, expect, it } from "vitest";

describe("affected-e2e helpers", async () => {
  const { globToRegExp, matchesAnyGlob, mapChangedFilesToTags, formatScope } = await import("./affected-e2e.mjs");

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
