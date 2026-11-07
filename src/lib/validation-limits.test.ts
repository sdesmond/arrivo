import { describe, expect, it } from "vitest";
import { PASSWORD_POLICY_BOUNDS } from "@/data/types";
import {
  clampSignInPassword,
  FIELD_LIMITS,
  isUuid,
  isWithinSignInPasswordLimit,
  isValidIsoDate,
  isValidIsoDateTime,
  MAX_BUDGET_INPUT_LENGTH,
  MAX_BUDGET_TOTAL,
  MAX_EXPENSE_AMOUNT,
  MAX_ITINERARY_POSITION,
  overLimitMessage,
  SIGN_IN_PASSWORD_MAX_LENGTH,
  validateExpenseAmountInput,
} from "./validation-limits";

describe("isUuid", () => {
  it("accepts canonical UUIDs in either case", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuid("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
  });

  it.each(["", "trip-1", "123e4567e89b12d3a456426614174000", "123e4567-e89b-12d3-a456-42661417400g", "../etc"])(
    "rejects %j",
    (value) => {
      expect(isUuid(value)).toBe(false);
    }
  );
});

describe("isValidIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
  });

  it.each(["2026-99-99", "2026-02-30", "2027-02-29", "2026-2-3", "", "2026-01-01T00:00:00Z", "not a date"])(
    "rejects %j",
    (value) => {
      expect(isValidIsoDate(value)).toBe(false);
    }
  );
});

describe("isValidIsoDateTime", () => {
  it("accepts parseable ISO datetimes", () => {
    expect(isValidIsoDateTime("2026-05-01T09:30:00.000Z")).toBe(true);
    expect(isValidIsoDateTime("2026-05-01T09:30")).toBe(true);
  });

  it.each(["", "garbage", "2026-13-01T00:00:00Z", "2026-05-01", "2026-05-01T25:00:00Z"])("rejects %j", (value) => {
    expect(isValidIsoDateTime(value)).toBe(false);
  });
});

describe("limits", () => {
  it("keeps every text limit a positive integer", () => {
    for (const limit of Object.values(FIELD_LIMITS)) {
      expect(Number.isInteger(limit)).toBe(true);
      expect(limit).toBeGreaterThan(0);
    }
  });

  it("keeps numeric bounds inside numeric(12,2)", () => {
    expect(MAX_BUDGET_TOTAL).toBeLessThan(10 ** 10);
    expect(MAX_BUDGET_INPUT_LENGTH).toBe(13);
    expect(MAX_EXPENSE_AMOUNT).toBe(50000);
    expect(MAX_ITINERARY_POSITION).toBeGreaterThan(0);
  });

  it("formats an over-limit message", () => {
    expect(overLimitMessage("Trip name", 100)).toBe("Trip name must be 100 characters or fewer.");
  });
});

describe("validateExpenseAmountInput", () => {
  it("accepts a positive amount within the ceiling", () => {
    expect(validateExpenseAmountInput("12.5")).toEqual({ amount: 12.5 });
    expect(validateExpenseAmountInput("50000")).toEqual({ amount: 50000 });
  });

  it.each([
    ["", "Amount must be greater than 0."],
    ["abc", "Amount must be greater than 0."],
    ["0", "Amount must be greater than 0."],
    ["-3", "Amount must be greater than 0."],
    ["1.234", "Amount must have at most 2 decimal places."],
    ["50000.01", "Amount must be 50,000 or less."],
  ])("rejects %j", (raw, message) => {
    expect(validateExpenseAmountInput(raw).error).toBe(message);
  });
});

describe("SIGN_IN_PASSWORD_MAX_LENGTH", () => {
  it("is the longest password the rules can allow, so sign-in never refuses one set under them", () => {
    expect(SIGN_IN_PASSWORD_MAX_LENGTH).toBe(30);
    expect(SIGN_IN_PASSWORD_MAX_LENGTH).toBe(PASSWORD_POLICY_BOUNDS.maxLength.max);
  });
});

describe("sign-in password length", () => {
  const atCap = "p".repeat(SIGN_IN_PASSWORD_MAX_LENGTH);
  // Each emoji is one character to the password rules but two UTF-16 units to `String.length` and `maxLength`.
  const emojiAtCap = "😀".repeat(SIGN_IN_PASSWORD_MAX_LENGTH);

  it("counts characters the way the password rules do, not UTF-16 units", () => {
    expect(emojiAtCap.length).toBe(SIGN_IN_PASSWORD_MAX_LENGTH * 2);
    expect(isWithinSignInPasswordLimit(atCap)).toBe(true);
    expect(isWithinSignInPasswordLimit(emojiAtCap)).toBe(true);
    expect(isWithinSignInPasswordLimit(atCap + "p")).toBe(false);
    expect(isWithinSignInPasswordLimit(emojiAtCap + "😀")).toBe(false);
    expect(isWithinSignInPasswordLimit("p".repeat(10_000))).toBe(false);
    expect(isWithinSignInPasswordLimit("")).toBe(true);
  });

  it("clamps typed or pasted text to the cap without splitting a character", () => {
    expect(clampSignInPassword(atCap)).toBe(atCap);
    expect(clampSignInPassword(atCap + "xyz")).toBe(atCap);
    expect(clampSignInPassword(emojiAtCap)).toBe(emojiAtCap);
    expect(clampSignInPassword(emojiAtCap + "😀😀")).toBe(emojiAtCap);
    expect(clampSignInPassword("a")).toBe("a");
  });
});
