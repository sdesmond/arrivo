import { describe, expect, it } from "vitest";

describe("affected-e2e helpers", async () => {
  const { globToRegExp, matchesAnyGlob, mapChangedFilesToTags, formatScope } = await import("./affected-e2e.mjs");

  const FEATURE_MAP = [
    {
      tag: "@feat:packing-tab",
      sourceGlobs: ["src/components/packt/packing-*", "tests/e2e/features/packing-tab.feature"],
    },
    { tag: "@feat:packing-lists", sourceGlobs: ["src/components/packt/packing-list*.tsx"] },
    { tag: "@feat:reservations", sourceGlobs: ["src/app/(app)/trips/[tripId]/reservations/**"] },
    { tag: "@feat:trips", sourceGlobs: ["src/components/packt/trip-card.tsx"] },
  ];
  const SHARED_GLOBS = ["src/db/**", "src/lib/**", "src/components/ui/**", "package.json"];
  const maps = { FEATURE_MAP, SHARED_GLOBS };

  describe("globToRegExp", () => {
    it("matches a single segment with * but not across slashes", () => {
      expect(globToRegExp("src/components/packt/packing-*").test("src/components/packt/packing-item.tsx")).toBe(true);
      expect(globToRegExp("src/components/packt/packing-*").test("src/components/packt/sub/x.tsx")).toBe(false);
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
    it("returns full when there are no changed files", () => {
      expect(mapChangedFilesToTags([], maps)).toEqual({ mode: "full" });
    });

    it("returns full when any changed file is shared", () => {
      expect(mapChangedFilesToTags(["src/components/packt/trip-card.tsx", "src/lib/utils.ts"], maps)).toEqual({
        mode: "full",
      });
    });

    it("returns full when any changed file maps to no feature", () => {
      expect(mapChangedFilesToTags(["src/components/packt/unmapped-thing.tsx"], maps)).toEqual({ mode: "full" });
    });

    it("unions tags across feature-only changes, sorted and deduped", () => {
      expect(
        mapChangedFilesToTags(["src/components/packt/packing-list-row.tsx", "src/components/packt/trip-card.tsx"], maps)
      ).toEqual({ mode: "tags", tags: ["@feat:packing-lists", "@feat:packing-tab", "@feat:trips"] });
    });

    it("a file matching several feature globs yields all their tags", () => {
      expect(mapChangedFilesToTags(["src/components/packt/packing-list-row.tsx"], maps)).toEqual({
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

    it("joins tags with | for grep and , for scope", () => {
      const result = { mode: "tags", tags: ["@feat:a", "@feat:b"] };
      expect(formatScope(result, "grep")).toBe("@feat:a|@feat:b");
      expect(formatScope(result, "scope")).toBe("@feat:a,@feat:b");
    });
  });
});
