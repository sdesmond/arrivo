import { describe, expect, it } from "vitest";
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from "@/data/types";
import {
  PASSWORD_BCRYPT_MAX_BYTES,
  PASSWORD_TOO_MANY_BYTES_ERROR,
  countPassword,
  describePasswordRequirements,
  evaluatePasswordRequirements,
  failedPasswordField,
  passwordRequirementsSentence,
  validateNewPassword,
  validatePasswordAgainstPolicy,
  validatePasswordPolicy,
} from "./password-policy";

const STRICT: PasswordPolicy = {
  minLength: 8,
  maxLength: 15,
  minUppercase: 2,
  minNumbers: 2,
  minSpecial: 2,
};

function met(password: string, policy: PasswordPolicy) {
  return Object.fromEntries(evaluatePasswordRequirements(password, policy).map((item) => [item.id, item.met]));
}

describe("countPassword", () => {
  it("counts Unicode code points, not UTF-16 units", () => {
    expect(countPassword("a😀b").length).toBe(3);
    expect("a😀b".length).toBe(4);
  });
  it("counts UTF-8 bytes", () => {
    expect(countPassword("aé😀").bytes).toBe(1 + 2 + 4);
  });
  it("counts ASCII uppercase and digits only", () => {
    const counts = countPassword("AbÉ1٣");
    expect(counts.uppercase).toBe(1);
    expect(counts.numbers).toBe(1);
  });
  it("counts Unicode punctuation and symbols as special but not spaces", () => {
    expect(countPassword("a b!€¿—").special).toBe(4);
    expect(countPassword("   ").special).toBe(0);
  });
  it("does not trim or normalize", () => {
    expect(countPassword("  x  ").length).toBe(5);
    expect(countPassword("é").length).toBe(2);
  });
});

describe("describePasswordRequirements", () => {
  it("lists only length when every class is off", () => {
    expect(describePasswordRequirements(DEFAULT_PASSWORD_POLICY)).toEqual([
      { id: "length", label: "8 to 20 characters" },
    ]);
  });
  it("lists enabled classes with singular and plural labels", () => {
    const labels = describePasswordRequirements({
      ...STRICT,
      minUppercase: 1,
      minNumbers: 3,
      minSpecial: 1,
    }).map((item) => item.label);
    expect(labels).toEqual([
      "8 to 15 characters",
      "At least 1 uppercase letter",
      "At least 3 numbers",
      "At least 1 special character",
    ]);
  });
  it("omits a class whose minimum is 0", () => {
    const ids = describePasswordRequirements({ ...STRICT, minNumbers: 0 }).map((item) => item.id);
    expect(ids).toEqual(["length", "uppercase", "special"]);
  });
  it("lists a class as soon as its minimum is above 0", () => {
    expect(describePasswordRequirements({ ...DEFAULT_PASSWORD_POLICY, minSpecial: 1 }).map((item) => item.id)).toEqual([
      "length",
      "special",
    ]);
  });
});

describe("evaluatePasswordRequirements", () => {
  it("is all unmet for empty input", () => {
    expect(evaluatePasswordRequirements("", STRICT).every((item) => !item.met)).toBe(true);
  });
  it("tracks each requirement independently as the password changes", () => {
    expect(met("ab", STRICT)).toEqual({ length: false, uppercase: false, number: false, special: false });
    expect(met("ABcdefgh", STRICT)).toEqual({ length: true, uppercase: true, number: false, special: false });
    expect(met("AB12!?cd", STRICT)).toEqual({ length: true, uppercase: true, number: true, special: true });
    expect(met("AB12!cd", STRICT)).toEqual({ length: false, uppercase: true, number: true, special: false });
  });
  it("fails length above the maximum", () => {
    expect(met("a".repeat(16), STRICT).length).toBe(false);
    expect(met("a".repeat(15), STRICT).length).toBe(true);
  });
  it("fails length when the password exceeds bcrypt's byte capacity", () => {
    const policy = { ...DEFAULT_PASSWORD_POLICY };
    const emoji = "😀".repeat(19);
    expect(countPassword(emoji).length).toBe(19);
    expect(countPassword(emoji).bytes).toBeGreaterThan(PASSWORD_BCRYPT_MAX_BYTES);
    expect(met(emoji, policy).length).toBe(false);
    // Exactly 72 bytes still fits.
    expect(met("😀".repeat(18), policy).length).toBe(true);
  });
  it("allows disabled classes without requiring them", () => {
    expect(validatePasswordAgainstPolicy("ALL CAPS 123 !!", DEFAULT_PASSWORD_POLICY)).toBeUndefined();
    expect(validatePasswordAgainstPolicy("alllowercase", DEFAULT_PASSWORD_POLICY)).toBeUndefined();
  });
});

describe("passwordRequirementsSentence", () => {
  it("names only length by default", () => {
    expect(passwordRequirementsSentence(DEFAULT_PASSWORD_POLICY)).toBe("8 to 20 characters");
  });
  it("joins one, two and three classes", () => {
    expect(passwordRequirementsSentence({ ...DEFAULT_PASSWORD_POLICY, minNumbers: 1 })).toBe(
      "8 to 20 characters, with at least 1 number"
    );
    expect(passwordRequirementsSentence({ ...STRICT, minSpecial: 0 })).toBe(
      "8 to 15 characters, with at least 2 uppercase letters and at least 2 numbers"
    );
    expect(passwordRequirementsSentence(STRICT)).toBe(
      "8 to 15 characters, with at least 2 uppercase letters, at least 2 numbers and at least 2 special characters"
    );
  });
});

describe("validatePasswordAgainstPolicy", () => {
  it("accepts a password at the minimum and maximum length", () => {
    expect(validatePasswordAgainstPolicy("a".repeat(8), DEFAULT_PASSWORD_POLICY)).toBeUndefined();
    expect(validatePasswordAgainstPolicy("a".repeat(20), DEFAULT_PASSWORD_POLICY)).toBeUndefined();
  });
  it.each([[""], ["short"], ["a".repeat(7)], ["a".repeat(21)]])("rejects out-of-range length %j", (password) => {
    expect(validatePasswordAgainstPolicy(password, DEFAULT_PASSWORD_POLICY)).toBe(
      "Password must be 8 to 20 characters."
    );
  });
  it("states every active requirement on failure", () => {
    expect(validatePasswordAgainstPolicy("abcdefgh", STRICT)).toBe(
      "Password must be 8 to 15 characters, with at least 2 uppercase letters, at least 2 numbers and at least 2 special characters."
    );
  });
  it("accepts the valid 2/2/2 case", () => {
    expect(validatePasswordAgainstPolicy("AB12!?cdefg", STRICT)).toBeUndefined();
  });
  it("caps bytes explicitly even when the code point count is in range", () => {
    // 19 code points of 4 bytes each is within 8-20 characters yet 76 bytes.
    expect(validatePasswordAgainstPolicy("😀".repeat(19), DEFAULT_PASSWORD_POLICY)).toBe(PASSWORD_TOO_MANY_BYTES_ERROR);
    expect(validatePasswordAgainstPolicy("😀".repeat(18), DEFAULT_PASSWORD_POLICY)).toBeUndefined();
  });
  it("reports the generic requirements, not the byte error, when a class is also missing", () => {
    const policy = { ...DEFAULT_PASSWORD_POLICY, minNumbers: 1 };
    expect(validatePasswordAgainstPolicy("😀".repeat(19), policy)).toBe(
      "Password must be 8 to 20 characters, with at least 1 number."
    );
  });
  it("treats a space as an allowed non-special character", () => {
    const policy = { ...DEFAULT_PASSWORD_POLICY, minSpecial: 1 };
    expect(validatePasswordAgainstPolicy("a b c d e f", policy)).toBeDefined();
    expect(validatePasswordAgainstPolicy("a b c d e f!", policy)).toBeUndefined();
  });
});

describe("validateNewPassword", () => {
  const password = "a".repeat(8);
  it("accepts a matching password", () => {
    expect(validateNewPassword(password, password, DEFAULT_PASSWORD_POLICY)).toBeUndefined();
  });
  it("puts the policy error before confirmation errors", () => {
    expect(validateNewPassword("short", "", DEFAULT_PASSWORD_POLICY)).toBe("Password must be 8 to 20 characters.");
  });
  it("requires confirmation", () => {
    expect(validateNewPassword("long-enough", "", DEFAULT_PASSWORD_POLICY)).toBe("Confirm your password.");
  });
  it("requires matching confirmation", () => {
    expect(validateNewPassword("long-enough", "different", DEFAULT_PASSWORD_POLICY)).toBe("Passwords do not match.");
  });
});

describe("failedPasswordField", () => {
  it("points at the password when it breaks the policy and at the confirmation otherwise", () => {
    expect(failedPasswordField("short", DEFAULT_PASSWORD_POLICY)).toBe("password");
    expect(failedPasswordField("long-enough-1", DEFAULT_PASSWORD_POLICY)).toBe("confirmPassword");
    expect(failedPasswordField("long-enough-1", { ...DEFAULT_PASSWORD_POLICY, minUppercase: 1 })).toBe("password");
  });
});

describe("validatePasswordPolicy", () => {
  it("accepts the defaults and returns a clean copy without extra keys", () => {
    const result = validatePasswordPolicy({ ...DEFAULT_PASSWORD_POLICY, extra: "ignored" });
    expect(result).toEqual({ ok: true, policy: DEFAULT_PASSWORD_POLICY });
  });
  it("accepts 15 characters with 2/2/2 minima", () => {
    expect(validatePasswordPolicy(STRICT)).toEqual({ ok: true, policy: STRICT });
  });
  it("accepts the extremes of every range", () => {
    expect(validatePasswordPolicy({ ...DEFAULT_PASSWORD_POLICY, minLength: 16, maxLength: 16 }).ok).toBe(true);
    expect(validatePasswordPolicy({ ...DEFAULT_PASSWORD_POLICY, minLength: 8, maxLength: 15 }).ok).toBe(true);
    expect(validatePasswordPolicy({ ...DEFAULT_PASSWORD_POLICY, minNumbers: 20, maxLength: 20 }).ok).toBe(true);
  });
  it.each([[null], [undefined], ["policy"], [42], [[]]])("rejects non-object %j", (value) => {
    expect(validatePasswordPolicy(value)).toEqual({ ok: false, error: "Password rules are missing or malformed." });
  });
  it.each([
    ["minLength", 7],
    ["minLength", 17],
    ["minLength", 8.5],
    ["minLength", "8"],
    ["minLength", undefined],
    ["minLength", Number.NaN],
    ["maxLength", 14],
    ["maxLength", 21],
    ["maxLength", 15.5],
    ["maxLength", "20"],
    ["maxLength", undefined],
    ["minUppercase", -1],
    ["minUppercase", 21],
    ["minNumbers", -1],
    ["minSpecial", -2],
    ["minSpecial", 21],
    ["minNumbers", 1.5],
    ["minSpecial", "1"],
    ["minSpecial", undefined],
  ])("rejects %s = %j with the failing field", (field, value) => {
    const result = validatePasswordPolicy({ ...DEFAULT_PASSWORD_POLICY, [field]: value });
    expect(result).toMatchObject({ ok: false, field });
  });
  it("rejects minimum length above maximum length", () => {
    expect(validatePasswordPolicy({ ...DEFAULT_PASSWORD_POLICY, minLength: 16, maxLength: 15 })).toMatchObject({
      ok: false,
      field: "minLength",
    });
  });
  it("rejects class minima that cannot fit in the maximum length", () => {
    const result = validatePasswordPolicy({ ...STRICT, minUppercase: 6, minNumbers: 5, minSpecial: 5 });
    expect(result).toMatchObject({ ok: false, field: "maxLength" });
    expect((result as { error: string }).error).toContain("add up to 16");
  });
  it("accepts 0 for every class, meaning not required", () => {
    const result = validatePasswordPolicy({
      ...DEFAULT_PASSWORD_POLICY,
      minUppercase: 0,
      minNumbers: 0,
      minSpecial: 0,
    });
    expect(result).toEqual({ ok: true, policy: DEFAULT_PASSWORD_POLICY });
  });
  it("accepts minima that exactly fill the maximum length and rejects one more", () => {
    expect(validatePasswordPolicy({ ...STRICT, maxLength: 15, minUppercase: 5, minNumbers: 5, minSpecial: 5 }).ok).toBe(
      true
    );
    expect(validatePasswordPolicy({ ...STRICT, maxLength: 15, minUppercase: 6, minNumbers: 5, minSpecial: 5 }).ok).toBe(
      false
    );
  });
  it("accepts 20 in one class with the maximum length at 20", () => {
    expect(
      validatePasswordPolicy({ ...DEFAULT_PASSWORD_POLICY, minUppercase: 20, minNumbers: 0, minSpecial: 0 }).ok
    ).toBe(true);
  });
  it.each([null, "2", 1.5, Number.NaN, undefined])("rejects a class minimum of %j", (value) => {
    expect(validatePasswordPolicy({ ...STRICT, minNumbers: value })).toMatchObject({ ok: false, field: "minNumbers" });
  });
  it("ignores leftover toggle keys from an older client", () => {
    const result = validatePasswordPolicy({ ...STRICT, requireNumber: true, requireUppercase: false });
    expect(result).toEqual({ ok: true, policy: STRICT });
  });
});
