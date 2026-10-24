import { describe, expect, it } from "vitest";
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, normalizeUsername, validateUsername } from "./username";

describe("normalizeUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  Jane.Doe ")).toBe("jane.doe");
  });
});

describe("validateUsername", () => {
  it("accepts letters, digits, dots, dashes and underscores", () => {
    expect(validateUsername("jane.doe_2-x")).toBeNull();
  });

  it("validates the normalized value", () => {
    expect(validateUsername("  JaneDoe  ")).toBeNull();
  });

  it("requires a value", () => {
    expect(validateUsername("   ")).toBe("Enter a username.");
  });

  it("rejects names shorter than the minimum", () => {
    expect(validateUsername("a".repeat(USERNAME_MIN_LENGTH - 1))).toBe(
      `Username must be ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters.`
    );
    expect(validateUsername("a".repeat(USERNAME_MIN_LENGTH))).toBeNull();
  });

  it("rejects names longer than the maximum", () => {
    expect(validateUsername("a".repeat(USERNAME_MAX_LENGTH))).toBeNull();
    expect(validateUsername("a".repeat(USERNAME_MAX_LENGTH + 1))).toBe(
      `Username must be ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters.`
    );
  });

  it("rejects characters outside the allowed set", () => {
    const message = "Use letters, numbers, dots, dashes or underscores, starting with a letter or number.";
    expect(validateUsername("jane@doe")).toBe(message);
    expect(validateUsername("jane doe")).toBe(message);
  });

  it("rejects a leading punctuation character", () => {
    expect(validateUsername(".jane")).toBe(
      "Use letters, numbers, dots, dashes or underscores, starting with a letter or number."
    );
  });
});
