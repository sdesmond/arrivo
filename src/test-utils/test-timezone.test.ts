import { describe, expect, it } from "vitest";

describe("unit test timezone", () => {
  it("is pinned by vitest.config.mts, not taken from the machine", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/Denver");
  });
});
