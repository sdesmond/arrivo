import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH, validateNewPassword } from "./password-policy";

describe("validateNewPassword", () => {
  it("accepts a matching password of minimum length", () => {
    const password = "a".repeat(PASSWORD_MIN_LENGTH);
    expect(validateNewPassword(password, password)).toBeUndefined();
  });
  it.each([[""], ["short"], ["a".repeat(PASSWORD_MIN_LENGTH - 1)]])("rejects too-short password %j", (password) => {
    expect(validateNewPassword(password, password)).toBe("Password must be at least 8 characters.");
  });
  it("requires confirmation", () => {
    expect(validateNewPassword("long-enough", "")).toBe("Confirm your password.");
  });
  it("requires matching confirmation", () => {
    expect(validateNewPassword("long-enough", "different")).toBe("Passwords do not match.");
  });
});
