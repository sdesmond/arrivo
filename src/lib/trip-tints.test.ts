import { describe, it, expect } from "vitest";
import { getTint, getAvatarTint } from "@/lib/trip-tints";

describe("getTint", () => {
  it("returns a valid OKLCH string for a known name", () => {
    expect(getTint("Tokyo", false)).toMatch(/^oklch\(/);
  });

  it("returns consistent value for same name and mode", () => {
    expect(getTint("Tokyo", false)).toBe(getTint("Tokyo", false));
  });

  it("dark and light values differ for the same name", () => {
    expect(getTint("Tokyo", true)).not.toBe(getTint("Tokyo", false));
  });

  it("falls back to Default for an unknown name", () => {
    expect(getTint("Unknown", false)).toMatch(/^oklch\(/);
  });

  it("dark unknown name falls back to Default dark", () => {
    expect(getTint("Unknown", true)).not.toBe(getTint("Unknown", false));
  });
});

describe("getAvatarTint", () => {
  it("returns bg and color fields", () => {
    const result = getAvatarTint("AB");
    expect(result).toHaveProperty("bg");
    expect(result).toHaveProperty("color");
  });

  it("bg and color are valid OKLCH strings", () => {
    const result = getAvatarTint("AB");
    expect(result.bg).toMatch(/^oklch\(/);
    expect(result.color).toMatch(/^oklch\(/);
  });

  it("same first letter produces same result regardless of remaining initials", () => {
    const r1 = getAvatarTint("Alice");
    const r2 = getAvatarTint("Alex");
    expect(r1.bg).toBe(r2.bg);
    expect(r1.color).toBe(r2.color);
  });

  it("handles empty string gracefully by using fallback letter", () => {
    const result = getAvatarTint("");
    expect(result.bg).toMatch(/^oklch\(/);
    expect(result.color).toMatch(/^oklch\(/);
  });
});
