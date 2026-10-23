import { describe, expect, it } from "vitest";
import { isUniqueViolation, sanitizeError, withErrorHandling } from "./error-utils";

describe("sanitizeError", () => {
  it("passes through known validation errors unchanged", () => {
    const error = new Error("Invalid labelId: referenced row is not a label or belongs to a different trip");
    const listError = new Error("Invalid listId: referenced packing list belongs to a different trip");

    expect(sanitizeError(error)).toBe(error);
    expect(sanitizeError(listError)).toBe(listError);
  });

  it("replaces unexpected Error instances with a generic message", () => {
    expect(sanitizeError(new Error("database exploded"))).toEqual(
      new Error("An unexpected error occurred. Please try again.")
    );
  });

  it("replaces non-Error throws with the generic message", () => {
    expect(sanitizeError("boom")).toEqual(new Error("An unexpected error occurred. Please try again."));
    expect(sanitizeError({ digest: "NEXT_REDIRECT" })).toEqual(
      new Error("An unexpected error occurred. Please try again.")
    );
  });
});

describe("withErrorHandling", () => {
  it("returns the wrapped result when no error occurs", async () => {
    const wrapped = withErrorHandling(async (value: string) => `${value}-done`);

    await expect(wrapped("trip")).resolves.toBe("trip-done");
  });

  it("rethrows sanitized errors for unexpected failures", async () => {
    const wrapped = withErrorHandling(async () => {
      throw new Error("database exploded");
    });

    await expect(wrapped()).rejects.toThrow("An unexpected error occurred. Please try again.");
  });

  it("preserves redirect-like non-Error throws", async () => {
    const redirectSignal = { digest: "NEXT_REDIRECT" };
    const wrapped = withErrorHandling(async () => {
      throw redirectSignal;
    });

    await expect(wrapped()).rejects.toBe(redirectSignal);
  });

  it("preserves Next.js redirect Error instances with digest", async () => {
    const redirectError = new Error("NEXT_REDIRECT");
    (redirectError as Error & { digest: string }).digest = "NEXT_REDIRECT;push;/sign-in;307;";
    const wrapped = withErrorHandling(async () => {
      throw redirectError;
    });

    await expect(wrapped()).rejects.toThrow("NEXT_REDIRECT");
  });

  it("preserves Next.js notFound Error instances with digest", async () => {
    const notFoundError = new Error("NEXT_NOT_FOUND");
    (notFoundError as Error & { digest: string }).digest = "NEXT_NOT_FOUND";
    const wrapped = withErrorHandling(async () => {
      throw notFoundError;
    });

    await expect(wrapped()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("isUniqueViolation", () => {
  it("matches a driver error carrying the unique-violation code", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("matches a wrapped query error whose cause carries the code", () => {
    expect(isUniqueViolation(new Error("Failed query", { cause: { code: "23505" } }))).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("Failed query", { cause: { code: "23503" } }))).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
