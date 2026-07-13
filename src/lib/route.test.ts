import { describe, expect, it } from "vitest";
import { resolveEffectiveMode } from "./route";

describe("resolveEffectiveMode", () => {
  it("walks when a hop is below the configured threshold", () => {
    expect(resolveEffectiveMode(399, "drive", 400)).toBe("walk");
  });

  it("uses the trip mode when a hop is above the threshold", () => {
    expect(resolveEffectiveMode(401, "transit", 400)).toBe("transit");
  });

  it("uses the trip mode when no threshold is configured", () => {
    expect(resolveEffectiveMode(100, "drive", null)).toBe("drive");
    expect(resolveEffectiveMode(100, "transit", undefined)).toBe("transit");
  });

  it("walks no hops when threshold is zero", () => {
    expect(resolveEffectiveMode(0, "drive", 0)).toBe("drive");
  });

  it("uses the trip mode when a hop equals the threshold", () => {
    expect(resolveEffectiveMode(400, "transit", 400)).toBe("transit");
  });
});
