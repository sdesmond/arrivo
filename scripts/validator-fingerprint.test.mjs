import { describe, expect, it } from "vitest";

describe("validator-fingerprint helpers", async () => {
  const { computeFingerprint, parseScope, shouldSkip } = await import("./validator-fingerprint.mjs");

  describe("computeFingerprint", () => {
    const base = { head: "abc123", trackedDiff: "diff --git a/x b/x", untracked: [] };

    it("is stable for identical state", () => {
      expect(computeFingerprint(base)).toBe(computeFingerprint({ ...base }));
    });

    it("changes when HEAD, tracked diff, or untracked content changes", () => {
      const fingerprint = computeFingerprint(base);
      expect(computeFingerprint({ ...base, head: "def456" })).not.toBe(fingerprint);
      expect(computeFingerprint({ ...base, trackedDiff: "other" })).not.toBe(fingerprint);
      expect(computeFingerprint({ ...base, untracked: [{ path: "new.ts", content: "x" }] })).not.toBe(fingerprint);
    });

    it("is order-independent for untracked files", () => {
      const left = [
        { path: "a.ts", content: "1" },
        { path: "b.ts", content: "2" },
      ];
      expect(computeFingerprint({ ...base, untracked: left })).toBe(
        computeFingerprint({ ...base, untracked: [...left].reverse() })
      );
    });
  });

  describe("parseScope", () => {
    it("treats empty and 'full' (any case) as full", () => {
      expect(parseScope("")).toBe("full");
      expect(parseScope(undefined)).toBe("full");
      expect(parseScope("FULL")).toBe("full");
    });

    it("treats 'none' (any case) as the none scope", () => {
      expect(parseScope("none")).toBe("none");
      expect(parseScope("NONE")).toBe("none");
    });

    it("splits comma or pipe separated tags, deduped and sorted", () => {
      expect(parseScope("@feat:b,@feat:a,@feat:b")).toEqual(["@feat:a", "@feat:b"]);
      expect(parseScope("@feat:b|@feat:a")).toEqual(["@feat:a", "@feat:b"]);
    });
  });

  describe("shouldSkip", () => {
    const fingerprint = "fp";

    it("never skips without a marker or on a fingerprint mismatch", () => {
      expect(shouldSkip(undefined, fingerprint, "full")).toBe(false);
      expect(shouldSkip({ fingerprint: "other", scope: "full" }, fingerprint, "full")).toBe(false);
    });

    it("skips anything when the recorded pass was full", () => {
      expect(shouldSkip({ fingerprint, scope: "full" }, fingerprint, "full")).toBe(true);
      expect(shouldSkip({ fingerprint, scope: "full" }, fingerprint, ["@feat:a"])).toBe(true);
    });

    it("does not skip a full request satisfied only by a prior affected pass", () => {
      expect(shouldSkip({ fingerprint, scope: ["@feat:a"] }, fingerprint, "full")).toBe(false);
    });

    it("skips an affected request only when its tags are a subset of the recorded pass", () => {
      const marker = { fingerprint, scope: ["@feat:a", "@feat:b"] };
      expect(shouldSkip(marker, fingerprint, ["@feat:a"])).toBe(true);
      expect(shouldSkip(marker, fingerprint, ["@feat:a", "@feat:b"])).toBe(true);
      expect(shouldSkip(marker, fingerprint, ["@feat:c"])).toBe(false);
    });

    it("skips a none request (nothing to run) against any prior pass on the same tree", () => {
      expect(shouldSkip({ fingerprint, scope: ["@feat:a"] }, fingerprint, "none")).toBe(true);
      expect(shouldSkip({ fingerprint, scope: "none" }, fingerprint, "none")).toBe(true);
      expect(shouldSkip({ fingerprint: "other", scope: "none" }, fingerprint, "none")).toBe(false);
    });

    it("does not let a prior none pass satisfy a later tag or full request", () => {
      expect(shouldSkip({ fingerprint, scope: "none" }, fingerprint, ["@feat:a"])).toBe(false);
      expect(shouldSkip({ fingerprint, scope: "none" }, fingerprint, "full")).toBe(false);
    });
  });
});
